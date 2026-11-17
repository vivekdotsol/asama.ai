const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
function sign(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// For agents to verify webhooks (also used in tests). Rejects stale timestamps to block replay.
function verify(secret, timestamp, body, signatureHeader, toleranceSec = 300) {
  const expected = 'sha256=' + sign(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) <= toleranceSec;
}

// Basic SSRF guard for webhook URLs.
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h === '::1' || h === '[::1]') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

function validateWebhookUrl(raw, allowPrivate) {
  let u;
  try { u = new URL(raw); } catch { return 'webhook_url must be a valid URL'; }
  if (!['http:', 'https:'].includes(u.protocol)) return 'webhook_url must be http(s)';
  if (!allowPrivate && (u.protocol !== 'https:' || isPrivateHost(u.hostname))) {
    return 'webhook_url must be a public https URL';
  }
  return null;
}

module.exports = { sha256, randomToken, sign, verify, validateWebhookUrl };
