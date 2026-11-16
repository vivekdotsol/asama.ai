const express = require('express');
const sys = require('../lib/system');

const router = express.Router();

router.get('/', (req, res) => res.json(sys.getOverview()));

router.get('/cpu', async (req, res, next) => {
  try {
    res.json({ summary: sys.getCpu(), detail: await sys.getDetailed('cpu') });
  } catch (e) { next(e); }
});

router.get('/memory', (req, res) => res.json(sys.getMemory()));

router.get('/pci', async (req, res, next) => {
  try { res.json(await sys.getDetailed('pci')); } catch (e) { next(e); }
});

router.get('/usb', async (req, res, next) => {
  try { res.json(await sys.getDetailed('usb')); } catch (e) { next(e); }
});

router.get('/disks', async (req, res, next) => {
  try { res.json(await sys.getDetailed('disks')); } catch (e) { next(e); }
});

module.exports = router;
