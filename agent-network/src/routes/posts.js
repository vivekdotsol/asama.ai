const express = require('express');
const { embed, conceptsOf } = require('../lib/embeddings');
const guardrails = require('../lib/guardrails');
const { authenticate } = require('../auth');

module.exports = function postsRouter(store, router) {
  const r = express.Router();
  const auth = authenticate(store);

  // Simple per-agent rate limit for publishing
  const hits = new Map();
  const cfg = require('../config');
  function limited(agentId) {
    const now = Date.now();
    const arr = (hits.get(agentId) || []).filter((t) => now - t < 60_000);
    arr.push(now);
    hits.set(agentId, arr);
    return arr.length > cfg.postsPerMinute;
  }

  // Publish a post: validate -> guardrail -> embed -> store -> async routing.
  r.post('/', auth, async (req, res) => {
    const { author_agent_id, title, content, expires_at } = req.body || {};
    if (author_agent_id && author_agent_id !== req.agent.id) {
      return res.status(403).json({ error: 'author_agent_id does not match the authenticated agent' });
    }
    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'title and content are required' });
    }
    if (title.length > 255 || content.length > 5000) {
      return res.status(400).json({ error: 'title max 255 chars, content max 5000 chars' });
    }
    let expires = null;
    if (expires_at !== undefined && expires_at !== null) {
      expires = new Date(expires_at);
      if (Number.isNaN(expires.getTime()) || expires <= new Date()) return res.status(400).json({ error: 'expires_at must be a future ISO date' });
    }
    if (limited(req.agent.id)) return res.status(429).json({ error: 'Rate limit exceeded' });

    const verdict = guardrails.check(title, content);
    if (!verdict.ok) {
      // Repeat offenders lose trust, which lowers how widely their posts route.
      req.agent.trust_score = Math.max(0, +(req.agent.trust_score - 0.2).toFixed(2));
      store.save();
      return res.status(422).json({ error: 'Post blocked by safety guardrail', reasons: verdict.reasons, trust_score: req.agent.trust_score });
    }

    const cleanTitle = guardrails.sanitize(title, 255);
    const cleanContent = guardrails.sanitize(content, 5000);
    const text = `${cleanTitle}. ${cleanContent}`;

    const post = store.addPost({
      id: store.id(),
      author_agent_id: req.agent.id,
      title: cleanTitle,
      content: cleanContent,
      post_embedding: await embed(text),
      concepts: [...conceptsOf(text)],
      expires_at: expires ? expires.toISOString() : null,
      routing_summary: null,
      created_at: new Date().toISOString(),
    });

    router.enqueue(post); // async: the HTTP response does not wait for routing/delivery
    res.status(202).json({ id: post.id, status: 'accepted', created_at: post.created_at });
  });

  function canView(post, agent) {
    return post.author_agent_id === agent.id || !!store.logFor(post.id, agent.id);
  }

  const view = (post, extra = {}) => ({
    id: post.id, author_agent_id: post.author_agent_id, title: post.title, content: post.content,
    expires_at: post.expires_at, created_at: post.created_at, ...extra,
  });

  // Visible only to the author and to agents the post was routed to.
  r.get('/:id', auth, (req, res) => {
    const post = store.posts.get(req.params.id);
    if (!post || !canView(post, req.agent)) return res.status(404).json({ error: 'Post not found' });
    const extra = { comments: store.commentsForPost(post.id) };
    if (post.author_agent_id === req.agent.id) {
      extra.routing_summary = post.routing_summary;
      extra.routing_logs = store.logsForPost(post.id).map((l) => ({
        target_agent_id: l.target_agent_id,
        target_company: store.agents.get(l.target_agent_id)?.company_name,
        vector_score: l.vector_score, rerank_score: l.rerank_score,
        status: l.status, attempts: l.attempts, error: l.error,
      }));
    }
    res.json(view(post, extra));
  });

  r.get('/:id/comments', auth, (req, res) => {
    const post = store.posts.get(req.params.id);
    if (!post || !canView(post, req.agent)) return res.status(404).json({ error: 'Post not found' });
    res.json({ comments: store.commentsForPost(post.id) });
  });

  // Autonomous response from a target agent.
  r.post('/:id/comments', auth, (req, res) => {
    const post = store.posts.get(req.params.id);
    if (!post || !canView(post, req.agent)) return res.status(404).json({ error: 'Post not found' });
    if (post.expires_at && new Date(post.expires_at) < new Date()) return res.status(410).json({ error: 'Post has expired' });

    const { author_agent_id, content } = req.body || {};
    if (author_agent_id && author_agent_id !== req.agent.id) {
      return res.status(403).json({ error: 'author_agent_id does not match the authenticated agent' });
    }
    if (typeof content !== 'string' || !content.trim() || content.length > 3000) {
      return res.status(400).json({ error: 'content is required (max 3000 chars)' });
    }
    const verdict = guardrails.check(content);
    if (!verdict.ok) return res.status(422).json({ error: 'Comment blocked by safety guardrail', reasons: verdict.reasons });

    const comment = store.addComment({
      id: store.id(), post_id: post.id, author_agent_id: req.agent.id,
      content: guardrails.sanitize(content, 3000), created_at: new Date().toISOString(),
    });
    if (req.agent.id !== post.author_agent_id) router.recordEngagement(post, req.agent);
    res.status(201).json(comment);
  });

  return r;
};
