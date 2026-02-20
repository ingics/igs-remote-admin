# iGS03 Remote Control Server Design

## Overview
- **Product**: iGS03 Remote Control Server Design
- **Date**: Feb, 2026 (Updated from rev. 1)
- **Company**: INGICS TECHNOLOGY CO., LTD.
- **Original**: Based on iGS01S Remote Control Server Design (Mar, 2018)

---

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     iGS03       │  ──TCP──▶ │   Admin Server  │  ◀──TCP── │   Admin Client  │
│   (Device)      │ Port 5000 │   (Server)      │ Port 5001 │     (PC)        │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                       │
                              ┌────────┴────────┐
                              │    TLS Support  │
                              │ Ports 5040/5041 │
                              └─────────────────┘
```

---

## Port Configuration

| Port | Protocol | Purpose | Direction |
|------|----------|---------|-----------|
| 5000 | TCP | Remote Control Server | iGS03 → Admin Server |
| 5001 | TCP | Admin Interface | Admin Client → Admin Server |
| 5040 | TLS | Remote Control (Secure) | iGS03 → Admin Server |
| 5041 | TLS | Admin Interface (Secure) | Admin Client → Admin Server |

---

## Remote Control Server Specification

### TCP Connection Settings
- **RCHOST**: IP address or hostname of the Admin Server
- **RCPORT**: Port for device connections (default: 5000)
- **ADMINPORT**: Port for admin client connections (default: 5001)

### Secure Connections (TLS)
- **RCPORT_TLS**: Secure port for device connections (default: 5040)
- **ADMINPORT_TLS**: Secure port for admin connections (default: 5041)

### Protocol Flow
1. iGS03 connects to assigned Admin Server through TCP connection using RCHOST:RCPORT.
2. Admin Server accepts connection and assigns a Session ID (starting from 1000).
3. iGS03 must send its MAC address for identification within **5 seconds**.
4. Upon receiving MAC address, Admin Server responds with:
   - `SYS \n`
   - `SYS DBG \n`
5. Admin Client connects to Admin Server on ADMINPORT.
6. Admin Server issues commands to iGS03 through the established connection.

### Timeouts
- **Login Validation**: 5000ms (Connection closed if MAC address not received)
- **Keep-Alive**: 120,000ms (Idle timeout)

### Authentication
- The Administration Server should accept connections from iGS03 devices.
- Each server determines its own authentication policy as required.
- Example Administration Server implementation is provided as reference.

---

## Features
- iGS03 can be configured to connect to assigned administration server through TCP.
- Support for both plaintext (TCP) and encrypted (TLS) connections.
- Administration Server can issue commands to iGS03 through established connections.
- Multi-device management via Admin Client.
- Case-insensitive command processing.
- Support for both decimal and hexadecimal session IDs.

---

## Revision History

| Version | Date | Changes | Note |
|---------|------|---------|------|
| 1 | Mar, 2018 | Initial release | iGS01S version |
| 2 | Feb, 2026 | Updated to iGS03, added TLS ports 5040/5041 | Current version |

---

## Configuration Example (remote-admin.js)

```javascript
const CONFIG = {
  PORTS: {
    RC: 5000,        // Remote Control (TCP)
    ADMIN: 5001,     // Admin Interface (TCP)
    RC_TLS: 5040,    // Remote Control (TLS)
    ADMIN_TLS: 5041, // Admin Interface (TLS)
  },
  TIMEOUTS: {
    LOGIN_VALIDATION: 5000,
    KEEP_ALIVE: 120000,
  }
};
```

---

## Admin Commands

Available commands through Admin Client on port 5001/5041:

| Command | Description | Example |
|---------|-------------|---------|
| `ls [filter]` | List connected devices with optional substring filter | `ls 1001` |
| `cmd <mac1,mac2,...> <command>` | Send command to devices by MAC address | `cmd 00:0E:C6:XX:XX:XX hello` |
| `cmd <id1,id2,...> <command>` | Send command to devices by Session ID (Dec or Hex) | `cmd 1001 uptime` |
| `cmdall <command>` | Broadcast command to all connected devices | `cmdall reset` |
| `drop <id>` | Drop device connection by Session ID | `drop 0x3E9` |

---

**Contact**: SUPPORT@INGICS.COM • WWW.INGICS.COM
