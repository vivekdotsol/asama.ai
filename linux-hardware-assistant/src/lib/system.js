const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

// Only these fixed commands can ever run. No user input reaches the shell.
const COMMANDS = {
  cpu: ['lscpu', ['-J']],
  pci: ['lspci', []],
  usb: ['lsusb', []],
  disks: ['lsblk', ['-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,MODEL']],
};

async function runCommand(key) {
  const [cmd, args] = COMMANDS[key];
  try {
    const { stdout } = await run(cmd, args, { timeout: 5000 });
    return { available: true, source: cmd, output: stdout };
  } catch (err) {
    const reason = err.code === 'ENOENT' ? `${cmd} not installed or not on this OS` : err.message;
    return { available: false, source: cmd, reason };
  }
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function getCpu() {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    arch: os.arch(),
  };
}

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const gb = (b) => +(b / 1024 ** 3).toFixed(2);
  return { totalGB: gb(total), freeGB: gb(free), usedGB: gb(total - free) };
}

function getOverview() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    uptimeHours: +(os.uptime() / 3600).toFixed(2),
    cpu: getCpu(),
    memory: getMemory(),
    isLinux: os.platform() === 'linux',
  };
}

async function getDetailed(key) {
  const result = await runCommand(key);
  if (result.available && ['cpu', 'disks'].includes(key)) {
    result.data = tryJson(result.output);
    if (result.data) delete result.output;
  }
  return result;
}

module.exports = { getOverview, getCpu, getMemory, getDetailed };
