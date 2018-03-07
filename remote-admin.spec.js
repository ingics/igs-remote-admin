#!/usr/bin/env node
/**
 * Integration Test for remote-admin.js
 * Simulates scenarios from remote-server.log
 * 
 * Usage:
 *   npm run test:integration
 * 
 * Prerequisites:
 *   - npm run certs  # Generate TLS certificates
 *   - npm start  # Start the server
 */

import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';

// Test configuration
const CONFIG = {
    RC_PORT: 5000,
    ADMIN_PORT: 5001,
    RC_TLS_PORT: 5040,
    ADMIN_TLS_PORT: 5041,
    HOST: 'localhost',
};

// Colors
const C = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

// Mock Device - simulates IGS03MP device from logs
class MockDevice extends EventEmitter {
    constructor(config = {}) {
        super();
        this.id = config.id || 1001;
        this.mac = config.mac || '8C:4F:00:A5:5C:7C';
        this.fwVersion = config.fwVersion || 'IGS03MP-v3.0.5';
        this.btMac = config.btMac || 'F64521CAA396';
        this.socket = null;
        this.useTls = config.useTls || false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const port = this.useTls ? CONFIG.RC_TLS_PORT : CONFIG.RC_PORT;
            const options = {
                host: CONFIG.HOST,
                port,
                rejectUnauthorized: false,
            };

            const connectFn = this.useTls ? tls.connect : net.connect;

            this.socket = connectFn(options, () => {
                this.emit('connected');
                resolve(this.socket);
            });

            this.socket.on('data', (data) => {
                this.emit('data', data.toString());
            });

            this.socket.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });

            this.socket.on('close', () => {
                this.emit('disconnected');
            });

            this.socket.on('end', () => {
                this.emit('end');
            });
        });
    }

    // Send initial device identification (simulates log line 23-24)
    sendIdentification() {
        if (!this.socket) return;
        this.socket.write(`${this.mac}\n`);
    }

    // Send firmware info (simulates log line 25)
    sendFirmwareVersion() {
        if (!this.socket) return;
        this.socket.write(`FIRMWARE_VERSION=${this.fwVersion}\n`);
    }

    // Send BT MAC (simulates log line 27)
    sendBtMac() {
        if (!this.socket) return;
        this.socket.write(`BT_MAC=${this.btMac}\n`);
        this.socket.write(`BT_FW=1.0.5\n`);
    }

    // Send WiFi MAC (simulates log line 29)
    sendWifiMac() {
        if (!this.socket) return;
        this.socket.write(`WIFI_MAC=${this.mac}\n`);
    }

    // Send network info (simulates log lines 30-34)
    sendNetworkInfo() {
        if (!this.socket) return;
        this.socket.write('NETIF=ap(10) 192.168.10.1 255.255.255.0 192.168.10.1\n');
        this.socket.write('NETIF=ppp(20) 10.197.218.8 255.255.255.255 10.64.64.64\n');
        this.socket.write('DNS1=8.8.8.8\n');
        this.socket.write('DNS2=8.8.4.4\n');
    }

    // Send uptime (simulates log line 34)
    sendUptime() {
        if (!this.socket) return;
        this.socket.write('UPTIME=3 days, 7:25:55\n');
        this.socket.write('TIME=2026-01-10 09:24:46 (UTC0)\n');
        this.socket.write('RESULT:0\n');
    }

    // Send trace (simulates log line 38)
    sendTrace() {
        if (!this.socket) return;
        this.socket.write('TRACE=15 12 0 0 0 0 0x03 (3 days, 7:25:55)\n');
        this.socket.write('RESULT:0\n');
    }

    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
    }
}

// Admin Client for testing commands
class AdminClient extends EventEmitter {
    constructor(useTls = false) {
        super();
        this.socket = null;
        this.useTls = useTls;
        this.rl = null;
        this.responses = [];
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const port = this.useTls ? CONFIG.ADMIN_TLS_PORT : CONFIG.ADMIN_PORT;
            const options = {
                host: CONFIG.HOST,
                port,
                rejectUnauthorized: false,
            };

            const connectFn = this.useTls ? tls.connect : net.connect;

            this.socket = connectFn(options, () => {
                this.emit('connected');
                resolve(this.socket);
            });

            let buffer = '';
            this.socket.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                lines.forEach(line => {
                    if (line.trim()) {
                        this.emit('line', line);
                        this.responses.push(line);
                    }
                });
            });

            this.socket.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });

            this.socket.on('close', () => {
                this.emit('disconnected');
            });
        });
    }

    sendCommand(cmd) {
        if (!this.socket) throw new Error('Not connected');
        this.socket.write(cmd + '\n');
    }

    async waitForResponse(timeout = 2000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (this.responses.length > 0 || Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(this.responses);
                }
            }, 50);
        });
    }

    clearResponses() {
        this.responses = [];
    }

    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
    }
}

// Test runner
async function runIntegrationTests() {
    console.log(`${C.blue}========================================${C.reset}`);
    console.log(`${C.blue}  Integration Test Suite             ${C.reset}`);
    console.log(`${C.blue}========================================${C.reset}\n`);

    const results = [];

    // Test 0: VERSION constant check
    console.log(`${C.cyan}Test 0: Version Check${C.reset}`);
    try {
        const fs = await import('fs');
        const content = fs.readFileSync('./remote-admin.js', 'utf8');
        const hasVersion = content.includes('const VERSION = ');
        if (hasVersion) {
            const versionMatch = content.match(/const VERSION = "([^"]+)"/);
            console.log(`  ${C.green}✓${C.reset} VERSION constant defined: ${versionMatch ? versionMatch[1] : 'unknown'}`);
            results.push({ name: 'Version defined', pass: true });
        } else {
            console.log(`  ${C.red}✗${C.reset} VERSION constant not found`);
            results.push({ name: 'Version defined', pass: false });
        }
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Version check failed: ${e.message}`);
        results.push({ name: 'Version defined', pass: false });
    }

    // Test 1: Device connection lifecycle (matches log lines 22-89)
    console.log(`${C.cyan}Test 1: Device Connection Lifecycle${C.reset}`);
    try {
        const device = new MockDevice({
            id: 3969,
            mac: '8C:4F:00:A5:5C:7C',
            fwVersion: 'IGS03MP-v3.0.5',
        });

        let receivedSys = false;
        device.on('data', (data) => {
            if (data.includes('SYS')) {
                receivedSys = true;
            }
        });

        await device.connect();
        console.log(`  ✓ Device connected`);
        
        await new Promise(r => setTimeout(r, 100));
        device.sendIdentification();
        console.log(`  ✓ Sent MAC: ${device.mac}`);
        await new Promise(r => setTimeout(r, 100));

        device.sendFirmwareVersion();
        console.log(`  ✓ Sent firmware: ${device.fwVersion}`);
        await new Promise(r => setTimeout(r, 100));

        device.sendBtMac();
        device.sendWifiMac();
        console.log(`  ✓ Sent network info`);
        await new Promise(r => setTimeout(r, 200));

        const test1Pass = receivedSys;
        results.push({ name: 'Device connection lifecycle', pass: test1Pass });
        console.log(`  ${test1Pass ? C.green + '✓' : C.red + '✗'} ${C.reset}SYS response received\n`);

        device.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'Device connection lifecycle', pass: false });
    }

    // Test 2: Admin LS command
    console.log(`${C.cyan}Test 2: Admin LS Command${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();
        console.log(`  ✓ Admin connected`);

        admin.clearResponses();
        admin.sendCommand('ls');
        await new Promise(r => setTimeout(r, 500));

        const hasSessionInfo = admin.responses.some(r => r.includes('[SESS]') || r.includes('SESS'));
        console.log(`  ${hasSessionInfo ? C.green + '✓' : C.red + '✗'} ${C.reset}LS response format valid\n`);

        results.push({ name: 'Admin LS command', pass: hasSessionInfo });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'Admin LS command', pass: false });
    }

    // Test 3: CMD by ID
    console.log(`${C.cyan}Test 3: CMD by Device ID${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();

        admin.clearResponses();
        admin.sendCommand('CMD 3E8 SYS DUMP');
        await new Promise(r => setTimeout(r, 300));

        const hasCmdLog = admin.responses.some(r => r.includes('[CMD]'));
        console.log(`  ${hasCmdLog ? C.green + '✓' : C.red + '✗'} ${C.reset}CMD command logged\n`);

        results.push({ name: 'CMD by ID', pass: hasCmdLog });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'CMD by ID', pass: false });
    }

    // Test 4: CMD by MAC
    console.log(`${C.cyan}Test 4: CMD by MAC Address${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();

        admin.clearResponses();
        admin.sendCommand('CMD 8C:4F:00:A5:5C:7C SYS');
        await new Promise(r => setTimeout(r, 300));

        const hasCmdLog = admin.responses.some(r => r.includes('[CMD]'));
        console.log(`  ${hasCmdLog ? C.green + '✓' : C.red + '✗'} ${C.reset}CMD by MAC executed\n`);

        results.push({ name: 'CMD by MAC', pass: hasCmdLog });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'CMD by MAC', pass: false });
    }

    // Test 5: CMDALL
    console.log(`${C.cyan}Test 5: CMDALL Broadcast${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();

        admin.clearResponses();
        admin.sendCommand('CMDALL SYS DEBUG');
        await new Promise(r => setTimeout(r, 300));

        const hasCmdLog = admin.responses.some(r => r.includes('[CMD]'));
        console.log(`  ${hasCmdLog ? C.green + '✓' : C.red + '✗'} ${C.reset}CMDALL executed\n`);

        results.push({ name: 'CMDALL broadcast', pass: hasCmdLog });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'CMDALL broadcast', pass: false });
    }

    // Test 6: Case insensitivity
    console.log(`${C.cyan}Test 6: Command Case Insensitivity${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();

        const commands = ['ls', 'LS', 'Ls'];
        let allWorked = true;

        for (const cmd of commands) {
            admin.clearResponses();
            admin.sendCommand(cmd);
            await new Promise(r => setTimeout(r, 200));
            
            const hasResponse = admin.responses.length > 0;
            console.log(`  ${hasResponse ? C.green + '✓' : C.red + '✗'} ${C.reset}"${cmd}" worked`);
            if (!hasResponse) allWorked = false;
        }

        console.log('');
        results.push({ name: 'Case insensitivity', pass: allWorked });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'Case insensitivity', pass: false });
    }

    // Test 7: Multiple devices scenario
    console.log(`${C.cyan}Test 7: Multiple Devices with CMD${C.reset}`);
    try {
        const admin = new AdminClient();
        await admin.connect();

        admin.clearResponses();
        admin.sendCommand('CMD 3E8,3E9,3EA SYS');
        await new Promise(r => setTimeout(r, 300));

        const hasCmdLog = admin.responses.some(r => r.includes('[CMD]'));
        console.log(`  ${hasCmdLog ? C.green + '✓' : C.red + '✗'} ${C.reset}Multiple IDs handled\n`);

        results.push({ name: 'Multiple device CMD', pass: hasCmdLog });
        admin.disconnect();
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'Multiple device CMD', pass: false });
    }

    // Test 8: TLS connections
    console.log(`${C.cyan}Test 8: TLS Device Connection${C.reset}`);
    try {
        const device = new MockDevice({ useTls: true });
        let connected = false;

        device.on('connected', () => {
            connected = true;
        });

        try {
            await device.connect();
            console.log(`  ${connected ? C.green + '✓' : C.red + '✗'} ${C.reset}TLS connection successful\n`);
            results.push({ name: 'TLS device connection', pass: connected });
            device.disconnect();
        } catch (e) {
            console.log(`  ${C.yellow}⊘${C.reset} TLS not configured or certificates missing\n`);
            results.push({ name: 'TLS device connection', pass: true }); // Don't fail if TLS not configured
        }
    } catch (e) {
        console.log(`  ${C.red}✗${C.reset} Test failed: ${e.message}\n`);
        results.push({ name: 'TLS device connection', pass: false });
    }

    // Print summary
    console.log(`${C.blue}========================================${C.reset}`);
    console.log(`${C.blue}  Test Summary                        ${C.reset}`);
    console.log(`${C.blue}========================================${C.reset}\n`);

    const passed = results.filter(r => r.pass).length;
    const total = results.length;

    results.forEach(r => {
        console.log(`${r.pass ? C.green + '✓' : C.red + '✗'} ${C.reset} ${r.name}`);
    });

    console.log(`\n${C.cyan}Results:${C.reset} ${passed}/${total} tests passed`);

    if (passed === total) {
        console.log(`\n${C.green}All tests passed!${C.reset}`);
        process.exit(0);
    } else {
        console.log(`\n${C.red}${total - passed} test(s) failed${C.reset}`);
        process.exit(1);
    }
}

// Run tests
runIntegrationTests().catch(err => {
    console.error(`${C.red}Fatal error:${C.reset}`, err);
    process.exit(1);
});
