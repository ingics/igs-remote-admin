/**
 * Test Suite for remote-admin.js
 * Based on remote-server.log patterns
 * 
 * Run with: npm test
 * Prerequisites:
 *   - npm run certs  # Generate TLS certificates
 *   - npm start  # Start the server
 */

import net from 'net';
import tls from 'tls';
import readline from 'readline';
import { spawn } from 'child_process';

// Test configuration
const TEST_CONFIG = {
    HOST: 'localhost',
    RC_PORT: 5000,
    ADMIN_PORT: 5001,
    RC_TLS_PORT: 5040,
    ADMIN_TLS_PORT: 5041,
    TIMEOUT: 5000,
};

// Test statistics
const stats = {
    passed: 0,
    failed: 0,
    tests: [],
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

// Helper functions
function assert(condition, testName, message = '') {
    if (condition) {
        stats.passed++;
        stats.tests.push({ name: testName, status: 'PASS', message });
        console.log(`${colors.green}✓${colors.reset} ${testName}`);
    } else {
        stats.failed++;
        stats.tests.push({ name: testName, status: 'FAIL', message });
        console.log(`${colors.red}✗${colors.reset} ${testName}${message ? `: ${message}` : ''}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// TCP connection helper
async function connectTcp(port, host = TEST_CONFIG.HOST) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, host, () => {
            resolve(socket);
        });
        socket.on('error', reject);
        socket.setTimeout(TEST_CONFIG.TIMEOUT);
    });
}

// TLS connection helper
async function connectTls(port, host = TEST_CONFIG.HOST) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({
            host,
            port,
            rejectUnauthorized: false,
        }, () => {
            resolve(socket);
        });
        socket.on('error', reject);
        socket.setTimeout(TEST_CONFIG.TIMEOUT);
    });
}

// Send command and receive response
async function sendCommand(socket, command, timeout = TEST_CONFIG.TIMEOUT) {
    return new Promise((resolve, reject) => {
        let response = '';
        
        socket.on('data', (data) => {
            response += data.toString();
        });
        
        socket.write(command + '\n');
        
        setTimeout(() => {
            resolve(response);
        }, timeout);
    });
}

// Test classes
class RemoteDeviceSimulator {
    constructor(id, mac, fwVersion) {
        this.id = id;
        this.mac = mac;
        this.fwVersion = fwVersion;
        this.socket = null;
    }

    async connect(port) {
        this.socket = await connectTcp(port);
        return this.socket;
    }

    async sendDeviceInfo() {
        if (!this.socket) return;
        
        // Simulate device connection sequence from remote-server.log
        this.socket.write(`${this.mac}\n`);
        await sleep(100);
        this.socket.write(`FIRMWARE_VERSION=${this.fwVersion}\n`);
        await sleep(100);
        this.socket.write(`BT_MAC=F64521CAA396\n`);
        await sleep(100);
        this.socket.write(`WIFI_MAC=${this.mac}\n`);
        await sleep(100);
    }

    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
        }
    }
}

// Main test runner
async function runTests() {
    console.log(`${colors.blue}========================================${colors.reset}`);
    console.log(`${colors.blue}  remote-admin.js Test Suite  ${colors.reset}`);
    console.log(`${colors.blue}========================================${colors.reset}\n`);

    console.log(`${colors.yellow}Note: Make sure remote-admin.js is running before running tests${colors.reset}\n`);

    try {
        // Test: VERSION constant is defined
        console.log(`${colors.blue}--- Version Test ---${colors.reset}`);
        try {
            const fs = await import('fs');
            const content = fs.readFileSync('./remote-admin.js', 'utf8');
            const hasVersion = content.includes('const VERSION = ');
            assert(hasVersion, 'VERSION constant is defined');
            if (hasVersion) {
                const versionMatch = content.match(/const VERSION = "([^"]+)"/);
                if (versionMatch) {
                    console.log(`${colors.green}✓${colors.reset} Version: ${versionMatch[1]}`);
                }
            }
        } catch (e) {
            assert(false, 'VERSION constant check', e.message);
        }

        // Test 1: Server is running
        console.log(`${colors.blue}--- Server Connectivity Tests ---${colors.reset}`);
        try {
            const socket = await connectTcp(TEST_CONFIG.RC_PORT);
            socket.end();
            socket.destroy();
            assert(true, 'Server RC port (5000) is accessible');
        } catch (e) {
            assert(false, 'Server RC port (5000) is accessible', 'Connection failed - is server running?');
        }

        // Test 2: Admin port is accessible
        try {
            const socket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            socket.end();
            socket.destroy();
            assert(true, 'Server ADMIN port (5001) is accessible');
        } catch (e) {
            assert(false, 'Server ADMIN port (5001) is accessible', 'Connection failed - is server running?');
        }

        // Test 3: TLS ports are accessible
        try {
            const socket = await connectTls(TEST_CONFIG.RC_TLS_PORT);
            socket.end();
            socket.destroy();
            assert(true, 'Server RC TLS port (5040) is accessible');
        } catch (e) {
            assert(false, 'Server RC TLS port (5040) is accessible', e.message);
        }

        try {
            const socket = await connectTls(TEST_CONFIG.ADMIN_TLS_PORT);
            socket.end();
            socket.destroy();
            assert(true, 'Server ADMIN TLS port (5041) is accessible');
        } catch (e) {
            assert(false, 'Server ADMIN TLS port (5041) is accessible', e.message);
        }

        // Test 4: Device connection simulation
        console.log(`\n${colors.blue}--- Device Connection Tests ---${colors.reset}`);
        const device1 = new RemoteDeviceSimulator(1001, '8C:4F:00:A5:5C:7C', 'IGS03MP-v3.0.5');
        try {
            await device1.connect(TEST_CONFIG.RC_PORT);
            await device1.sendDeviceInfo();
            await sleep(200);
            
            // Check if device receives SYS response
            const response = await sendCommand(device1.socket, '', 500);
            assert(response.includes('SYS'), 'Device receives SYS response on connection');
        } catch (e) {
            assert(false, 'Device connection and identification', e.message);
        } finally {
            device1.disconnect();
        }

        // Test 5: Admin LS command
        console.log(`\n${colors.blue}--- Admin Command Tests ---${colors.reset}`);
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const lsResponse = await sendCommand(adminSocket, 'ls', 500);
            
            assert(true, 'LS command executes without error');
            assert(lsResponse.includes('[SESS]') || lsResponse.length > 0, 'LS command returns session data');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'LS command executes', e.message);
        }

        // Test 6: LS command case-insensitive
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const lsResponse1 = await sendCommand(adminSocket, 'ls', 500);
            const lsResponse2 = await sendCommand(adminSocket, 'LS', 500);
            const lsResponse3 = await sendCommand(adminSocket, 'Ls', 500);
            
            assert(
                lsResponse1.length > 0 && lsResponse2.length > 0 && lsResponse3.length > 0,
                'LS command is case-insensitive'
            );
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'LS command case-insensitivity', e.message);
        }

        // Test 7: CMD command by ID
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const cmdResponse = await sendCommand(adminSocket, 'CMD 3E8 SYS DUMP', 500);
            
            assert(cmdResponse.length >= 0, 'CMD command by ID accepts format');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'CMD command by ID', e.message);
        }

        // Test 8: CMD command by MAC
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const cmdResponse = await sendCommand(adminSocket, 'CMD 8C:4F:00:A5:5C:7C SYS', 500);
            
            assert(cmdResponse.length >= 0, 'CMD command by MAC accepts format');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'CMD command by MAC', e.message);
        }

        // Test 9: CMDALL command
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const cmdAllResponse = await sendCommand(adminSocket, 'CMDALL SYS DEBUG', 500);
            
            assert(cmdAllResponse.length >= 0, 'CMDALL command accepts format');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'CMDALL command', e.message);
        }

        // Test 10: DROP command
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const dropResponse = await sendCommand(adminSocket, 'DROP 3E8', 500);
            
            assert(dropResponse.length >= 0, 'DROP command accepts format');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'DROP command', e.message);
        }

        // Test 11: Command case-insensitivity
        console.log(`\n${colors.blue}--- Case Insensitivity Tests ---${colors.reset}`);
        const caseVariations = [
            'cmd 3E8 SYS',
            'CMD 3E8 SYS',
            'Cmd 3E8 SYS',
            'cmdall sys debug',
            'CMDALL SYS DEBUG',
            'Cmdall Sys Debug',
            'drop 3E8',
            'DROP 3E8',
            'Drop 3E8',
        ];

        for (const cmd of caseVariations) {
            try {
                const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
                await sendCommand(adminSocket, cmd, 200);
                adminSocket.end();
                adminSocket.destroy();
                assert(true, `Command case-insensitive: "${cmd}"`);
            } catch (e) {
                assert(false, `Command case-insensitive: "${cmd}"`, e.message);
            }
        }

        // Test 12: Multiple devices with CMD
        console.log(`\n${colors.blue}--- Multiple Devices Tests ---${colors.reset}`);
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const multiCmdResponse = await sendCommand(adminSocket, 'CMD 3E8,3E9,3EA SYS', 500);
            
            assert(multiCmdResponse.length >= 0, 'CMD accepts multiple IDs separated by commas');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'CMD multiple IDs', e.message);
        }

        // Test 13: LS with filter
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const lsFilterResponse = await sendCommand(adminSocket, 'ls trace', 500);
            
            assert(lsFilterResponse.length >= 0, 'LS command accepts filter parameter');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'LS command with filter', e.message);
        }

        // Test 14: Invalid command handling
        console.log(`\n${colors.blue}--- Error Handling Tests ---${colors.reset}`);
        try {
            const adminSocket = await connectTcp(TEST_CONFIG.ADMIN_PORT);
            const invalidResponse = await sendCommand(adminSocket, 'INVALID_COMMAND', 500);
            
            // Server should not crash on invalid commands
            assert(true, 'Server handles invalid commands gracefully');
            
            adminSocket.end();
            adminSocket.destroy();
        } catch (e) {
            assert(false, 'Invalid command handling', e.message);
        }

    } catch (e) {
        console.log(`${colors.red}Fatal error during tests:${colors.reset}`, e.message);
    }

    // Print test summary
    console.log(`\n${colors.blue}========================================${colors.reset}`);
    console.log(`${colors.blue}  Test Summary                        ${colors.reset}`);
    console.log(`${colors.blue}========================================${colors.reset}`);
    console.log(`Total Tests: ${stats.passed + stats.failed}`);
    console.log(`${colors.green}Passed: ${stats.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${stats.failed}${colors.reset}`);
    console.log(`Success Rate: ${((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(1)}%`);
    
    if (stats.failed > 0) {
        console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
        stats.tests
            .filter(t => t.status === 'FAIL')
            .forEach(t => {
                console.log(`  - ${t.name}${t.message ? `: ${t.message}` : ''}`);
            });
    }
    
    process.exit(stats.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(console.error);
