const express = require('express');
const cfg = require('../config');
const { embed, conceptsOf } = require('../lib/embeddings');
const { sha256, randomToken, validateWebhookUrl } = require('../lib/security');
const { sanitize } = require('../lib/guardrails');
const { publicAgent } = require('../store');
const { authenticate } = require('../auth');

module.exports = function agentsRouter(store) {
  const router = express.Router();
  const auth = authenticate(store);

  // Register an agent. The API key and webhook secret are shown exactly once.
  router.post('/register', async (req, res) => {
    const { company_name, industry_category, webhook_url, interest_manifesto } = req.body || {};
    for (const [k, v] of Object.entries({ company_name, industry_category, webhook_url, interest_manifesto })) {
      if (typeof v !== 'string' || !v.trim()) return res.status(400).json({ error: `${k} is required` });
    }
    if (interest_manifesto.length > 2000) return res.status(400).json({ error: 'interest_manifesto too long (max 2000)' });

    const urlError = validateWebhookUrl(webhook_url, cfg.allowPrivateWebhooks);
    if (urlError) return res.status(400).json({ error: urlError });

    const manifesto = sanitize(interest_manifesto, 2000);
    const apiKey = 'ank_' + randomToken(24);
    const webhookSecret = 'whsec_' + randomToken(24);

    const agent = store.addAgent({
      id: store.id(),
      company_name: sanitize(company_name, 255),
      industry_category: sanitize(industry_category, 100),
      webhook_url,
      webhook_secret: webhookSecret,
      interest_manifesto: manifesto,
      interest_embedding: await embed(manifesto),
      interest_concepts: [...conceptsOf(manifesto)],
      dynamic_vector: null,
      ignore_streak: 0,
      trust_score: 1.0,
      blocked_industries: [],
      blocked_agent_ids: [],
      active: true,
      api_key_hash: sha256(apiKey),
      stats: { delivered: 0, engaged: 0, ignored: 0, failed: 0 },
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      ...publicAgent(agent),
      api_key: apiKey,
      webhook_secret: webhookSecret,
      note: 'Store api_key and webhook_secret now; they are not shown again.',
    });
  });

  // Public directory
  router.get('/', (req, res) => {
    res.json({ agents: [...store.agents.values()].filter((a) => a.active).map(publicAgent) });
  });

  router.get('/me', auth, (req, res) => {
    const a = req.agent;
    res.json({ ...publicAgent(a), webhook_url: a.webhook_url, blocked_industries: a.blocked_industries, blocked_agent_ids: a.blocked_agent_ids, stats: a.stats });
  });

  // Update interests (re-embeds) and/or blocklists.
  router.patch('/me', auth, async (req, res) => {
    const a = req.agent;
    const { interest_manifesto, blocked_industries, blocked_agent_ids, webhook_url } = req.body || {};

    if (interest_manifesto !== undefined) {
      if (typeof interest_manifesto !== 'string' || !interest_manifesto.trim()) return res.status(400).json({ error: 'interest_manifesto must be a non-empty string' });
      a.interest_manifesto = sanitize(interest_manifesto, 2000);
      a.interest_embedding = await embed(a.interest_manifesto);
      a.interest_concepts = [...conceptsOf(a.interest_manifesto)];
      a.dynamic_vector = null; // reset learned drift when interests are rewritten
    }
    if (webhook_url !== undefined) {
      const err = validateWebhookUrl(webhook_url, cfg.allowPrivateWebhooks);
      if (err) return res.status(400).json({ error: err });
      a.webhook_url = webhook_url;
    }
    for (const [name, val] of Object.entries({ blocked_industries, blocked_agent_ids })) {
      if (val === undefined) continue;
      if (!Array.isArray(val) || val.some((x) => typeof x !== 'string')) return res.status(400).json({ error: `${name} must be an array of strings` });
      a[name] = val;
    }
    store.save();
    res.json({ ...publicAgent(a), blocked_industries: a.blocked_industries, blocked_agent_ids: a.blocked_agent_ids });
  });

  return router;
};
