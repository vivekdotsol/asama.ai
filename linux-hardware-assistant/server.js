require('dotenv').config();

const express = require('express');
const cors = require('cors');

const hardwareRoutes = require('./src/routes/hardware');
const { notFound, errorHandler } = require('./src/middleware/errors');

const app = express();
const PORT = process.env.PORT || 3000;

const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'linux-hardware-assistant',
    endpoints: [
      'GET /api/health',
      'GET /api/hardware',
      'GET /api/hardware/cpu',
      'GET /api/hardware/memory',
      'GET /api/hardware/pci',
      'GET /api/hardware/usb',
      'GET /api/hardware/disks',
    ],
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.use('/api/hardware', hardwareRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
