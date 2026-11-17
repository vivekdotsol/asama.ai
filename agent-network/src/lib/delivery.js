const crypto = require('crypto');
const cfg = require('../config');
const { sign } = require('./security');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-agent circuit breaker: a slow/broken webhook can't hog workers.
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

class Delivery {
  constructor() {
    this.breakers = new Map(); // agentId -> { failures, openUntil }
  }

  _isOpen(agentId) {
    const b = this.breakers.get(agentId);
    return !!b && b.openUntil > Date.now();
  }

  _record(agentId, ok) {
    const b = this.breakers.get(agentId) || { failures: 0, openUntil: 0 };
    if (ok) { b.failures = 0; b.openUntil = 0; }
    else {
      b.failures += 1;
      if (b.failures >= BREAKER_THRESHOLD) b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    }
    this.breakers.set(agentId, b);
  }

  // Returns { ok, attempts, error? }
  async deliver(agent, payload) {
    if (this._isOpen(agent.id)) return { ok: false, attempts: 0, error: 'circuit open' };

    const deliveryId = crypto.randomUUID();
    const body = JSON.stringify({ ...payload, delivery_id: deliveryId });
    let lastError = 'unknown';

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
      const ts = Math.floor(Date.now() / 1000);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      try {
        const res = await fetch(agent.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Timestamp': String(ts),
            'X-Network-Signature': 'sha256=' + sign(agent.webhook_secret, ts, body),
            'X-Network-Delivery-Id': deliveryId,
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) { this._record(agent.id, true); return { ok: true, attempts: attempt }; }
        lastError = `HTTP ${res.status}`;
        // 4xx (except 408/429) won't succeed on retry
        if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err.name === 'AbortError' ? 'timeout' : err.message;
      }
      if (attempt < cfg.maxAttempts) await sleep(cfg.backoffMs * 2 ** (attempt - 1));
    }
    this._record(agent.id, false);
    return { ok: false, attempts: cfg.maxAttempts, error: lastError };
  }
}

module.exports = { Delivery };
