# iGS03 Remote Control Server - BLE Gateway Test Lab

A Node.js server for managing iGS03 remote device connections with admin control capabilities. This project implements the [iGS03 Remote Control Server Design](./DESIGN_iGS03_Remote_Control_Server.md).

## Features

- **iGS03 Support**: Specifically designed for iGS03 and compatible devices.
- **Multiple Connection Types**: TCP and TLS support for both remote control and admin connections.
- **Device Management**: Connect, monitor, and manage BLE devices.
- **Admin Commands**: Interactive CLI to send commands to devices, list sessions, and manage connections.
- **Session Tracking**: Track connected devices with uptime, firmware versions, and MAC addresses.
- **Secure by Default**: Built-in TLS support for production-ready environments.

---

## Quick Start

### Prerequisites

- Node.js (v14+)
- OpenSSL (for certificate generation)

### Setup

1. **Generate TLS certificates** (required for TLS ports):

```bash
./generate-certs.sh
```

This creates:
- `./tls/server.key` - Private key
- `./tls/server.crt` - Self-signed certificate (valid 365 days)

2. **Start the server**:

```bash
node remote-admin.js
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TLS_KEY_PATH` | Path to TLS private key | `./tls/server.key` |
| `TLS_CERT_PATH` | Path to TLS certificate | `./tls/server.crt` |

### Default Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 5000 | TCP | Remote control |
| 5001 | TCP | Admin interface |
| 5040 | TLS | Remote control (secure) |
| 5041 | TLS | Admin interface (secure) |

---

## Admin Commands

Connect to port 5001 (or 5041 for TLS) to access the admin interface. Commands are case-insensitive.

| Command | Description | Example |
|---------|-------------|---------|
| `ls [filter]` | List all connected devices (optional substring filter) | `ls 1001` |
| `cmd <id\|mac> <cmd>` | Send command to device(s) by ID or MAC. Supports comma-separated list. | `cmd 1001 SYS` |
| `cmdall <command>` | Send command to all connected devices | `cmdall reset` |
| `drop <id>` | Drop connection by device Session ID | `drop 1001` |

### Examples

```bash
# List all sessions
ls

# Filter sessions by ID or metadata
ls trace

# Send command to device with ID 1001 (Decimal) or 0x3E8 (Hex)
cmd 1001 SYS DUMP
cmd 0x3E8 SYS DUMP

# Send command by MAC address
cmd AA:BB:CC:DD:EE:FF SYS

# Send command to multiple devices (Mixed ID/MAC)
cmd 1001,1002,AABBCCDDEEFF SYS

# Broadcast command to all devices
cmdall sys debug

# Drop device connection
drop 1001
```

### ID & MAC Formats

- **Session ID**: Decimal (e.g., `1001`) or Hexadecimal (e.g., `0x3E8`, `3E9`).
- **MAC Address**: With colons (`AA:BB:CC:DD:EE:FF`) or without (`AABBCCDDEEFF`).

---

## Protocol Flow

1. **Connection**: Device connects to port 5000/5040.
2. **Identification**: Device must send its MAC address within **5 seconds** (Login Validation Timeout).
3. **Initialization**: Upon valid MAC, server responds with `SYS \n` and `SYS DBG \n`.
4. **Maintenance**: Connection remains open with a **120s** Keep-alive/Idle timeout.

---

## File Structure

```
.
├── remote-admin.js             # Main server script
├── DESIGN_iGS03_Remote_Control_Server.md  # Detailed Design Spec
├── remote-admin.test.js        # Unit tests
├── remote-admin.spec.js        # Integration tests
├── generate-certs.sh           # Certificate generation script
├── tls/                        # Generated TLS certificates
└── README.md                   # This file
```

## Development

To modify configuration, edit the `CONFIG` object in `remote-admin.js`.

## License

MIT
