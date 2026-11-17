require('dotenv').config();
const cfg = require('./src/config');
const { createApp } = require('./src/app');

const { app, router } = createApp();

// Periodically mark unengaged notifications as IGNORED (feedback loop)
setInterval(() => router.sweepIgnored(), 60_000).unref();

app.listen(cfg.port, () => console.log(`agent-network running on http://localhost:${cfg.port}`));
