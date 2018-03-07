import net from "net";
import readline from "readline";
import moment from "moment";
import tls from "tls";
import fs from "fs";

/*
 * Remote Server Guest - BLE Gateway Test Lab
 *
 * This server manages remote device connections and admin connections.
 * Compatible with remote-server.js.
 *
 * Available Commands (case-insensitive):
 */

// Configuration
const VERSION = "1.0.0";

const CONFIG = {
  PORTS: {
    RC: 5000, // Remote control port
    ADMIN: 5001, // Admin port
    RC_TLS: 5040, // Remote control TLS port
    ADMIN_TLS: 5041, // Admin TLS port
  },
  TIMEOUTS: {
    LOGIN_VALIDATION: 5000, // Login validation timeout (ms)
    KEEP_ALIVE: 120 * 1000, // Keep-alive timeout (ms)
  },
  SESSION_DEFAULTS: {
    STATUS: "connect",
    TOKEN: "NA",
    MAC: "NA",
    TRACE: "NA",
    FW_VER: "NA",
    BLE_MAC: "NA",
    WIFI_MAC: "NA",
    WLAN_FW_VER: "NA",
  },
  STATUS: {
    CONNECT: "connect",
    CLOSE: "close",
  },
  TLS: {
    key: (() => {
      try {
        return fs.readFileSync(process.env.TLS_KEY_PATH || "./tls/server.key");
      } catch (e) {
        console.error("Failed to load server key:", e.message);
        process.exit(1);
      }
    })(),
    cert: (() => {
      try {
        return fs.readFileSync(process.env.TLS_CERT_PATH || "./tls/server.crt");
      } catch (e) {
        console.error("Failed to load server cert:", e.message);
        process.exit(1);
      }
    })(),
  },
  LOG_PREFIX: {
    CONN: "[CONN]",
    DEV_NOT_VALID: "[DEV NOT VALID]",
    MSG_LINE: "[MGS LINE]",
    MAC: "[MAC]",
    ERROR: "[ERROR]",
    CLOSE: "[CLOSE]",
    TIMEOUT: "[TIMEOUT]",
    END: "[END]",
    ADMIN_CONN: "[ADMIN CONN]",
    ADMIN_CLOSE: "[ADMIN CLOSE]",
    ADMIN_ERROR: "[ADMIN ERROR]",
    ADMIN_TIMEOUT: "[ADMIN TIMEOUT]",
    ADMIN_END: "[ADMIN END]",
    ADMIN_CMD: "[ADMIN]",
    CMD: "[CMD]",
    CMD_ERROR: "[CMD ERROR]",
    DROP: "[DROP]",
    DROP_ERROR: "[DROP ERROR]",
    SERVER_START: "[SERVER START]",
    SESS_INFO: "[SESS]",
  },
  COMMANDS: {
    // Command patterns (all case-insensitive)
    LS: /^ls\s*(.*)$/i,
    CMD_MAC:
      /^cmd\s+((?:[0-9a-fA-F]{2}[:-]?){5}[0-9a-fA-F]{2}(?:(?:,)(?:[0-9a-fA-F]{2}[:-]?){5}[0-9a-fA-F]{2})*)\s+(.+)$/i,
    CMD_ID: /^cmd\s+([0-9A-Fa-f,]+)\s+(.+)/i,
    CMDALL: /^cmdall\s+(.+)$/i,
    DROP: /^drop\s+([0-9A-Fa-f]+)$/i,
  },
};

// Global state management
const state = {
  sessions: new Map(), // Store sessions in Map for efficient ID-based lookup and removal
  admins: new Set(), // Store admin connections in Set for easy add/remove
  sessionIdCounter: 1000, // Session ID counter starting value
};

// --- Helper Functions ---

// Send message to all connected admins
function logToAdmins(message) {
  const timestamp = `[${moment().format()}]`;
  const fullMessage = `${timestamp}${message}`;
  console.log(fullMessage); // Local output

  state.admins.forEach((admin) => {
    try {
      // Check if socket is writable before attempting write
      if (admin.socket && admin.socket.writable) {
        admin.socket.write(fullMessage + "\n");
      }
    } catch (error) {
      console.error("Admin write error:", error.message);
    }
  });
}

// Find session by ID
function findSessionById(id) {
  return state.sessions.get(id);
}

// Find session by MAC address
function findSessionByMac(mac) {
  for (const session of state.sessions.values()) {
    if (session.mac === mac) {
      return session;
    }
  }
  return undefined;
}

// Parse ID from string - supports both decimal and hexadecimal
function parseId(idStr) {
  // Auto-detect: if starts with '0x' or contains A-F, use hex base
  const isHex = idStr.startsWith('0x') || /[A-Fa-f]/.test(idStr);
  return parseInt(idStr, isHex ? 16 : 10);
}

// Format uptime duration
function formatUptime(startTime) {
  const duration = moment.duration(moment().diff(startTime));
  const days = Math.floor(duration.asDays());
  const timeFormat = moment.utc(duration.asMilliseconds()).format("HH:mm:ss");
  return `${days} days, ${timeFormat}`;
}

// --- Remote Device Connection Handler ---

function handleRemoteConnection(socket) {
  socket.setKeepAlive(true, CONFIG.TIMEOUTS.KEEP_ALIVE);

  const sessionId = ++state.sessionIdCounter;
  const session = {
    id: sessionId,
    status: CONFIG.STATUS.CONNECT,
    token: CONFIG.SESSION_DEFAULTS.TOKEN,
    mac: CONFIG.SESSION_DEFAULTS.MAC,
    trace: CONFIG.SESSION_DEFAULTS.TRACE,
    fwVer: CONFIG.SESSION_DEFAULTS.FW_VER,
    addr: socket.remoteAddress,
    socket: socket,
    start: moment(),
    // Additional properties extracted later - matches remote-server.js
    bleMac: "NA",
    wlanFwVer: "NA",
  };

  state.sessions.set(sessionId, session);
  logToAdmins(`${CONFIG.LOG_PREFIX.CONN} ID:${sessionId} ${session.addr}`);

  // Set login validation timeout
  const validationTimeout = setTimeout(() => {
    // Check if MAC is still the default 'NA' value
    if (session.mac === CONFIG.SESSION_DEFAULTS.MAC) {
      logToAdmins(
        `${CONFIG.LOG_PREFIX.DEV_NOT_VALID} ${session.addr} ${session.mac}`,
      );
      socket.end("Not Valid\n"); // Graceful end first
      socket.destroy(); // Ensure complete shutdown
      // No need to remove from sessions here, 'close' event will handle it
    } else {
      // MAC already received, SYS might have been sent
      // socket.write('SYS \n');
    }
  }, CONFIG.TIMEOUTS.LOGIN_VALIDATION);

  socket.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (!line) return; // Ignore empty lines

    try {
      logToAdmins(
        `${CONFIG.LOG_PREFIX.MSG_LINE}[${session.id}][${session.token}] ${line}`,
      );

      // Define regex patterns
      const patterns = {
        // MAC address regex - matches with or without colons
        mac: /([0-9A-Fa-f]{2}[:]?){5}([0-9A-Fa-f]{2})/,
        firmwareVersion: /FIRMWARE_VERSION=(.+)/,
        bleMac: /BLE_MAC=(.+)/,
        wifiMac: /WIFI_MAC=(.+)/,
        wlanFwVer: /WLAN_VERSION=(.+)/,
        trace: /^TRACE=(.+)/,
      };

      // Check for MAC address first
      let match = line.match(patterns.mac);
      if (match && session.mac === CONFIG.SESSION_DEFAULTS.MAC) {
        // Only update if not already set
        session.mac = match[0];
        session.token = match[0].replace(/:/g, "");
        logToAdmins(`${CONFIG.LOG_PREFIX.MAC} ${session.mac} ${session.addr}`);
        // Send required responses upon successful identification
        socket.write("SYS \n");
        socket.write("SYS DBG \n");
        // Clear validation timeout since MAC received
        clearTimeout(validationTimeout);
      }

      // Check for other device info (excluding mac)
      for (const [key, pattern] of Object.entries(patterns)) {
        if (key === "mac") continue; // Already handled

        match = line.match(pattern);
        if (match) {
            // Map property names to match remote-server.js
            const sessionKey =
              key === "firmwareVersion"
                ? "fwVer"
                : key === "bleMac"
                  ? "bleMac"
                  : key === "wifiMac"
                    ? "wifiMac"
                    : key === "wlanFwVer"
                      ? "wlanFwVer"
                      : key === "trace"
                        ? "trace"
                        : key;
          session[sessionKey] = match[1];
        }
      }
    } catch (error) {
      console.error(`Data processing error for session ${session.id}:`, error);
    }
  });

  // Connection event handlers
  socket.on("error", (e) => {
    logToAdmins(
      `${CONFIG.LOG_PREFIX.ERROR} ID:${session.id} ${e} ${session.mac} ${session.addr}`,
    );
    // 'close' usually emitted after 'error'
  });

  socket.on("close", (hadError) => {
    clearTimeout(validationTimeout); // Clean up timeout to ensure cleanup
    session.status = CONFIG.STATUS.CLOSE;
    logToAdmins(`${CONFIG.LOG_PREFIX.CLOSE} ID:${session.id} ${session.mac} ${session.addr}`);
    state.sessions.delete(sessionId); // Remove from Map
  });

  socket.on("timeout", () => {
    // Keep-alive timeout
    logToAdmins(`${CONFIG.LOG_PREFIX.TIMEOUT} ID:${session.id} ${session.mac} ${session.addr}`);
    socket.end("Idle Timeout\n");
    socket.destroy();
  });

  socket.on("end", () => {
    // Peer closed connection gracefully
    logToAdmins(`${CONFIG.LOG_PREFIX.END} ID:${session.id} ${session.mac} ${session.addr}`);
    // 'close' will be emitted after 'end'
  });
}

// --- Admin Connection Handler ---

function handleAdminConnection(socket) {
  socket.setKeepAlive(true, CONFIG.TIMEOUTS.KEEP_ALIVE);

  const admin = {
    addr: socket.remoteAddress,
    socket: socket,
    status: CONFIG.STATUS.CONNECT,
  };

  state.admins.add(admin);
  logToAdmins(`${CONFIG.LOG_PREFIX.ADMIN_CONN} ${admin.addr}`);

  const rl = readline.createInterface({
    input: socket,
    output: socket,
    terminal: false, // Important for network streams
  });

  rl.on("line", (line) => {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      logToAdmins(`${CONFIG.LOG_PREFIX.ADMIN_CMD} ${trimmedLine}`);
      processAdminCommand(trimmedLine);
    }
  });

  // Admin connection event handlers
  socket.on("error", (e) => {
    console.error(`${CONFIG.LOG_PREFIX.ADMIN_ERROR} ${e} ${admin.addr}`);
    // 'close' usually follows
  });

  socket.on("close", (hadError) => {
    admin.status = CONFIG.STATUS.CLOSE;
    state.admins.delete(admin); // Remove from Set
    rl.close(); // Explicitly close readline interface
    logToAdmins(`${CONFIG.LOG_PREFIX.ADMIN_CLOSE} ${admin.addr}`);
  });

  socket.on("timeout", () => {
    logToAdmins(`${CONFIG.LOG_PREFIX.ADMIN_TIMEOUT} ${admin.addr}`);
    socket.end("Admin Idle Timeout\n");
    socket.destroy();
  });

  socket.on("end", () => {
    logToAdmins(`${CONFIG.LOG_PREFIX.ADMIN_END} ${admin.addr}`);
    // 'close' follows
  });
}

// --- Process Admin Commands ---

function processAdminCommand(line) {
  // LS command - List all sessions (case-insensitive)
  const listMatch = line.match(CONFIG.COMMANDS.LS);
  if (listMatch) {
    const opt = listMatch[1];
    state.sessions.forEach((session) => {
      const uptime = formatUptime(session.start);
      const out = `[SESS][${session.id}][${session.token}] ${uptime} trace: ${session.trace}\t${session.fwVer}\t-- ${session.addr}`;

      if (!opt || out.indexOf(opt) >= 0) {
        logToAdmins(out);
      }
    });
    return;
  }

  // CMD by MAC - Send command to device(s) by MAC address (case-insensitive)
  const cmdByMacMatch = line.match(CONFIG.COMMANDS.CMD_MAC);
  if (cmdByMacMatch) {
    const macs = cmdByMacMatch[1].split(",");
    const cmd = cmdByMacMatch[2];

    macs.forEach((mac) => {
      mac = mac.trim();
      const session = findSessionByMac(mac);
      if (session && session.socket.writable) {
        logToAdmins(`${CONFIG.LOG_PREFIX.CMD} ${cmd}`);
        try {
          session.socket.write(cmd + "\n");
        } catch (error) {
          logToAdmins(
            `${CONFIG.LOG_PREFIX.CMD_ERROR} Failed to send to MAC ${mac}: ${error.message}`,
          );
        }
      } else if (!session) {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD_ERROR} Device MAC ${mac} not found.`,
        );
      } else {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD_ERROR} Device MAC ${mac} socket not writable.`,
        );
      }
    });
    return;
  }

  // CMD by ID - Send command to device(s) by ID (supports hexadecimal, case-insensitive)
  const cmdByIdMatch = line.match(CONFIG.COMMANDS.CMD_ID);
  if (cmdByIdMatch) {
    const ids = cmdByIdMatch[1].split(",");
    const cmd = cmdByIdMatch[2];

    ids.forEach((idStr) => {
      const id = parseId(idStr);
      if (isNaN(id)) {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD_ERROR} Invalid ID format: ${idStr}`,
        );
        return;
      }
      const session = findSessionById(id);
      if (session && session.socket.writable) {
        logToAdmins(`${CONFIG.LOG_PREFIX.CMD} ${cmd}`);
        try {
          session.socket.write(cmd + "\n");
        } catch (error) {
          logToAdmins(
            `${CONFIG.LOG_PREFIX.CMD_ERROR} Failed to send to ID ${id}: ${error.message}`,
          );
        }
      } else if (!session) {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD_ERROR} Device ID ${id} not found.`,
        );
      } else {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD_ERROR} Device ID ${id} socket not writable.`,
        );
      }
    });
    return;
  }

  // CMDALL - Send command to all devices (case-insensitive)
  const cmdAllMatch = line.match(CONFIG.COMMANDS.CMDALL);
  if (cmdAllMatch) {
    const cmd = cmdAllMatch[1];
    state.sessions.forEach((session) => {
      if (session.socket.writable) {
        logToAdmins(
          `${CONFIG.LOG_PREFIX.CMD} ${session.id} ${session.addr} ${cmd}`,
        );
        try {
          session.socket.write(cmd + "\n");
        } catch (error) {
          console.error("Error sending command:", error.message);
        }
      }
    });
    return;
  }

  // DROP - Drop connection by ID (supports hexadecimal, case-insensitive)
  const dropMatch = line.match(CONFIG.COMMANDS.DROP);
  if (dropMatch) {
    const idStr = dropMatch[1];
    const id = parseId(idStr);
    if (isNaN(id)) {
      return;
    }
    const session = findSessionById(id);

    if (session) {
      logToAdmins(`${CONFIG.LOG_PREFIX.DROP} ${id}`);
      session.socket.end("Connection dropped by admin.\n");
      session.socket.destroy();
    }
    return;
  }
}

// --- Set up CLI Interface ---
function setupCliInterface() {
  const rl = readline.createInterface(process.stdin, process.stdout);

  rl.on("line", (line) => {
    processAdminCommand(line);
  }).on("close", () => {
    // process.exit(0);
  });
}

// --- Initialize Servers ---
function initServers() {
  console.log(`Remote Server Guest v${VERSION}`);
  console.log("");

  const rcServer = net.createServer(handleRemoteConnection);
  const adminServer = net.createServer(handleAdminConnection);
  const rcServerTls = tls.createServer(CONFIG.TLS, handleRemoteConnection);
  const adminServerTls = tls.createServer(CONFIG.TLS, handleAdminConnection);

  rcServer.on("error", (err) => {
    console.error("RC Server Error:", err);
    // Handle specific errors like EADDRINUSE
  });

  adminServer.on("error", (err) => {
    console.error("Admin Server Error:", err);
  });

  rcServerTls.on("error", (err) => {
    console.error("RC TLS Server Error:", err);
  });

  adminServerTls.on("error", (err) => {
    console.error("Admin TLS Server Error:", err);
  });

  rcServer.listen(CONFIG.PORTS.RC, () => {
    console.log(`Remote Control server listening on port ${CONFIG.PORTS.RC}`);
  });

  adminServer.listen(CONFIG.PORTS.ADMIN, () => {
    console.log(`Admin server listening on port ${CONFIG.PORTS.ADMIN}`);
  });

  rcServerTls.listen(CONFIG.PORTS.RC_TLS, () => {
    console.log(
      `Remote Control TLS server listening on port ${CONFIG.PORTS.RC_TLS}`,
    );
  });

  adminServerTls.listen(CONFIG.PORTS.ADMIN_TLS, () => {
    console.log(`Admin TLS server listening on port ${CONFIG.PORTS.ADMIN_TLS}`);
  });

  logToAdmins(`${CONFIG.LOG_PREFIX.SERVER_START}`);

  console.log(
    `RCPORT: ${CONFIG.PORTS.RC} ADMINPORT: ${CONFIG.PORTS.ADMIN} RCPORT_TLS: ${CONFIG.PORTS.RC_TLS} ADMINPORT_TLS: ${CONFIG.PORTS.ADMIN_TLS}`,
  );
}

// --- Start the server ---
initServers(); // Start network servers first
setupCliInterface(); // Then setup local CLI
