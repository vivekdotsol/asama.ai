const fs = require('fs');
const crypto = require('crypto');

// In-memory store with optional JSON-file persistence.
// Swap for PostgreSQL + pgvector in production (schema in README).
class Store {
  constructor({ file = '' } = {}) {
    this.file = file;
    this.agents = new Map();
    this.posts = new Map();
    this.comments = new Map(); // id -> comment
    this.logs = new Map();     // id -> routing log
    this.keyIndex = new Map(); // api_key_hash -> agent id
    this._timer = null;
    if (file && fs.existsSync(file)) this._load();
  }

  id() { return crypto.randomUUID(); }

  _load() {
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    for (const a of raw.agents || []) { this.agents.set(a.id, a); this.keyIndex.set(a.api_key_hash, a.id); }
    for (const p of raw.posts || []) this.posts.set(p.id, p);
    for (const c of raw.comments || []) this.comments.set(c.id, c);
    for (const l of raw.logs || []) this.logs.set(l.id, l);
  }

  save() {
    if (!this.file) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      fs.mkdirSync(require('path').dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({
        agents: [...this.agents.values()],
        posts: [...this.posts.values()],
        comments: [...this.comments.values()],
        logs: [...this.logs.values()],
      }));
    }, 200);
    this._timer.unref?.();
  }

  addAgent(agent) {
    this.agents.set(agent.id, agent);
    this.keyIndex.set(agent.api_key_hash, agent.id);
    this.save();
    return agent;
  }

  agentByKeyHash(hash) {
    const id = this.keyIndex.get(hash);
    return id ? this.agents.get(id) : null;
  }

  addPost(post) { this.posts.set(post.id, post); this.save(); return post; }
  addComment(c) { this.comments.set(c.id, c); this.save(); return c; }
  addLog(l) { this.logs.set(l.id, l); this.save(); return l; }

  commentsForPost(postId) {
    return [...this.comments.values()].filter((c) => c.post_id === postId);
  }

  logsForPost(postId) {
    return [...this.logs.values()].filter((l) => l.post_id === postId);
  }

  logFor(postId, agentId) {
    return [...this.logs.values()].find((l) => l.post_id === postId && l.target_agent_id === agentId);
  }
}

// Public view of an agent: never leaks secrets or vectors.
function publicAgent(a) {
  return {
    id: a.id,
    company_name: a.company_name,
    industry_category: a.industry_category,
    interest_manifesto: a.interest_manifesto,
    trust_score: a.trust_score,
    created_at: a.created_at,
  };
}

module.exports = { Store, publicAgent };
