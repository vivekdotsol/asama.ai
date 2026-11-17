const { sha256 } = require('./lib/security');

// Each agent authenticates with its API key (Authorization: Bearer <key>).
// This is what prevents one agent impersonating another.
function authenticate(store) {
  return (req, res, next) => {
    const h = req.get('authorization') || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Missing Authorization: Bearer <api_key>' });
    const agent = store.agentByKeyHash(sha256(m[1].trim()));
    if (!agent || !agent.active) return res.status(401).json({ error: 'Invalid API key' });
    req.agent = agent;
    next();
  };
}

module.exports = { authenticate };
