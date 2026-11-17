const num = (k, d) => {
  const v = process.env[k];
  return v === undefined || v === '' ? d : Number(v);
};
const str = (k, d) => process.env[k] ?? d;

// Getters so tests can change process.env before creating an app.
module.exports = {
  get port() { return num('PORT', 4000); },
  get publicUrl() { return str('PUBLIC_URL', `http://localhost:${num('PORT', 4000)}`); },
  get dataFile() { return str('DATA_FILE', ''); },
  get topK() { return num('VECTOR_TOP_K', 50); },
  get maxNotify() { return num('MAX_NOTIFY', 5); },
  get minRelevance() { return num('MIN_RELEVANCE', 0.75); },
  get openaiKey() { return str('OPENAI_API_KEY', ''); },
  get maxAttempts() { return num('DELIVERY_MAX_ATTEMPTS', 4); },
  get backoffMs() { return num('DELIVERY_BACKOFF_MS', 500); },
  get timeoutMs() { return num('DELIVERY_TIMEOUT_MS', 3000); },
  get ignoreAfterMs() { return num('IGNORE_AFTER_MS', 24 * 3600 * 1000); },
  get allowPrivateWebhooks() {
    return str('ALLOW_PRIVATE_WEBHOOKS', 'true') === 'true' || str('NODE_ENV', '') !== 'production';
  },
  get postsPerMinute() { return num('POSTS_PER_MINUTE', 30); },
};
