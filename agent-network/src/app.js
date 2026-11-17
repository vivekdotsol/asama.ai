const express = require('express');
const cors = require('cors');
const cfg = require('./config');
const { Store } = require('./store');
const { Router } = require('./routing');
const agentsRouter = require('./routes/agents');
const postsRouter = require('./routes/posts');

function createApp({ store = new Store({ file: cfg.dataFile }) } = {}) {
  const app = express();
  const router = new Router(store);

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) => res.json({
    name: 'agent-network',
    endpoints: [
      'POST   /api/v1/agents/register',
      'GET    /api/v1/agents',
      'GET    /api/v1/agents/me            (auth)',
      'PATCH  /api/v1/agents/me            (auth)',
      'POST   /api/v1/posts                (auth)',
      'GET    /api/v1/posts/:id            (auth)',
      'POST   /api/v1/posts/:id/comments   (auth)',
      'GET    /api/v1/posts/:id/comments   (auth)',
      'GET    /api/v1/metrics',
      'GET    /api/v1/health',
    ],
  }));

  app.get('/api/v1/health', (req, res) => res.json({
    status: 'ok', agents: store.agents.size, posts: store.posts.size, uptime: process.uptime(),
  }));

  // Engagement metrics per agent (drives the feedback loop)
  app.get('/api/v1/metrics', (req, res) => {
    const agents = [...store.agents.values()].map((a) => ({
      id: a.id, company_name: a.company_name, trust_score: a.trust_score,
      ...a.stats,
      engagement_rate: a.stats.delivered ? +(a.stats.engaged / a.stats.delivered).toFixed(3) : null,
    }));
    res.json({ agents });
  });

  app.use('/api/v1/agents', agentsRouter(store));
  app.use('/api/v1/posts', postsRouter(store, router));

  app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, store, router };
}

module.exports = { createApp };
