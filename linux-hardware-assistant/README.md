# linux-hardware-assistant

Express API that reports system hardware info.

## Setup
```bash
npm install
cp .env.example .env
npm run dev
```

## Endpoints
| Route | Description |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/hardware` | Overview: OS, CPU, memory |
| `GET /api/hardware/cpu` | CPU summary + `lscpu` detail (Linux) |
| `GET /api/hardware/memory` | Total / free / used RAM |
| `GET /api/hardware/pci` | `lspci` output (Linux) |
| `GET /api/hardware/usb` | `lsusb` output (Linux) |
| `GET /api/hardware/disks` | `lsblk` output (Linux) |

On non-Linux systems the detailed endpoints return `available: false` instead of failing.
