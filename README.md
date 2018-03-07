# Remote Admin - BLE Gateway Test Lab

A Node.js server for managing remote BLE device connections with admin control capabilities.

## Features

- **Multiple Connection Types**: TCP and TLS support for both remote control and admin connections
- **Device Management**: Connect, monitor, and manage BLE devices
- **Admin Commands**: Interactive CLI to send commands to devices, list sessions, and manage connections
- **Session Tracking**: Track connected devices with uptime, firmware versions, and MAC addresses

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

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TLS_KEY_PATH` | Path to TLS private key | `./tls/server.key` |
| `TLS_CERT_PATH` | Path to TLS certificate | `./tls/server.crt` |

Example with custom paths:
```bash
TLS_KEY_PATH=/etc/ssl/private/server.key TLS_CERT_PATH=/etc/ssl/certs/server.crt node remote-admin.js
```

### Default Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 5000 | TCP | Remote control |
| 5001 | TCP | Admin interface |
| 5040 | TLS | Remote control (secure) |
| 5041 | TLS | Admin interface (secure) |

## Admin Commands

Connect to port 5001 (or 5041 for TLS) to access the admin interface.

| Command | Description |
|---------|-------------|
| `ls [filter]` | List all connected devices (optional filter) |
| `cmd <id\|mac> <command>` | Send command to device by ID or MAC |
| `cmdall <command>` | Send command to all connected devices |
| `drop <id>` | Drop connection by device ID |

### Examples

```bash
# List all sessions
ls

# Filter sessions containing 'trace'
ls trace

# Send command to device with ID 0x3E8
cmd 3E8 SYS DUMP

# Send command by MAC address
cmd AA:BB:CC:DD:EE:FF SYS

# Send command to multiple devices
cmd 1001,1002,1003 SYS

# Broadcast command to all devices
cmdall sys debug

# Drop device with ID 1001
drop 1001
```

### Device ID Formats

- **Decimal**: `1001`, `2048`
- **Hexadecimal**: `3E8`, `0x3E8` (case-insensitive, A-F supported)

### MAC Address Formats

- With colons: `AA:BB:CC:DD:EE:FF`
- Without colons: `AABBCCDDEEFF`
- Comma-separated for multiple targets: `AA:BB:CC:DD:EE:FF,11:22:33:44:55:66`

## File Structure

```
.
├── remote-admin.js             # Main server script
├── remote-admin.test.js        # Unit tests
├── remote-admin.spec.js        # Integration tests
├── generate-certs.sh           # Certificate generation script
├── tls/
│   ├── server.key           # TLS private key (generated)
│   └── server.crt           # TLS certificate (generated)
└── README.md                # This file
```

## Protocol

Devices identify themselves by sending their MAC address. Upon connection:

1. Server waits for device MAC address (5-second timeout)
2. Valid device receives `SYS` and `SYS DBG` commands
3. Session is tracked with device info (firmware version, trace, etc.)

## Development

To modify configuration, edit the `CONFIG` object in `remote-admin.js`:

```javascript
const CONFIG = {
  PORTS: {
    RC: 5000,
    ADMIN: 5001,
    RC_TLS: 5040,
    ADMIN_TLS: 5041,
  },
  TIMEOUTS: {
    LOGIN_VALIDATION: 5000,  // ms
    KEEP_ALIVE: 120 * 1000,  // ms
  },
  // ...
};
```

## License

MIT
