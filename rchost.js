/*
In the node.js intro tutorial (http://nodejs.org/), they show a basic tcp
server, but for some reason omit a client connecting to it.  I added an
example at the bottom.

Save the following server in example.js:
*/


/*
    command:
    LISTSESS (LS)    --  list all connected to server devices
    CMD <target> <command>  --  issue command to specified target (in id)
    CMDALL <command>    --  issue command to all connected target
    DROP <target>      --   drop connection of target by id

*/


const net = require('net');
const readline = require('readline');
const netkeepalive = require('net-keepalive')
const moment = require('moment')


const RCPORT = 5000
const ADMINPORT = 5001


let sessList = []

let adminList = []

let count = 1000;

let server = net.createServer(function(socket) {
    // socket.write('Echo server\r\n');
    // socket.pipe(socket);
    socket.setKeepAlive(true, 5000);

    netkeepalive.setKeepAliveInterval(socket, 5000)
    netkeepalive.setKeepAliveProbes(socket, 2)

    count = count + 1

    let sess = {
        id: count,
        status: 'connect',
        token: 'NA',
        mac: 'NA',
        trace: 'NA',
        fwVer: 'NA'
    }


    sess.addr = socket.remoteAddress;
    sess.socket = socket;
    sess.start = moment();

    sessList.push(sess)

    // console.log('[CONN]', sess.addr);
    writeToAdmin(`[CONN] ${sess.addr}`);


    // timeout to finish login process
    setTimeout(() => {

        if (!sess.mac) {
            writeToAdmin(`[DEV NOT VALID] ${sess.addr} ${sess.mac}`)
            socket.end('Not Valid\n')
            socket.destroy()
        } else { // valid
            socket.write('SYS \n');
        }


    }, 5000)


    let i = readline.createInterface(socket, socket);
    i.on('line', function(line) {

        writeToAdmin(`[MGS LINE][${sess.id}][${sess.token}] ${line}`);

        // match mac
        let match = line.match(/^([0-9A-Fa-f]{2}[:]?){5}([0-9A-Fa-f]{2})/)
        if (match) {
            sess.mac = match[0]
            sess.token = match[0].replace(/:/g,"")
                // console.log('[MAC]', match[0])

            //
            // TODO: implement registration match here
            //

            writeToAdmin(`[MAC] ${sess.mac} ${sess.addr}`);

            socket.write('SYS \n');
            socket.write('SYS DBG \n');
            // socket.write(line);
        }

        match = line.match(/FIRMWARE_VERSION=(.+)/)
        if (match) {
            sess.fwVer = match[1]
        }

        match = line.match(/BLE_MAC=(.+)/)
        if (match) {
            sess.bleMac = match[1]
        }

        match = line.match(/WIFI_MAC=(.+)/)
        if (match) {
            sess.mac = match[1]
        }


        match = line.match(/WLAN_VERSION=(.+)/)
        if (match) {
            sess.wlanFwVer = match[1]
        }

        match = line.match(/^TRACE=(.+)/)
        if (match) {
            sess.trace = match[1]
        }

    });

    socket.on('error', function(e) {
        // console.log("[ERROR]");
        writeToAdmin(`[ERROR] ${e} ${sess.mac} ${sess.addr}`)
            // console.log(e);
    });
    socket.on('close', function() {
        sess.status = 'close'
        writeToAdmin(`[CLOSE] ${sess.mac} ${sess.addr}`);

        let pos = sessList.indexOf(sess);
        if (pos >= 0) {
            sessList.splice(pos, 1);
        }
    });
    socket.on('timeout', function() {
        // console.log("[TIMEOUT]", sess);
        writeToAdmin(`[TIMEOUT] ${sess.mac} ${sess.addr}`);
    });
    socket.on('end', function() {
        // console.log("[END]", sess);
        writeToAdmin(`[END] ${sess.mac} ${sess.addr}`);
    });

});





let adminServer = net.createServer(function(socket) {
    // socket.write('Echo server\r\n');
    // socket.pipe(socket);
    socket.setKeepAlive(true, 5000);

    netkeepalive.setKeepAliveInterval(socket, 5000)
    netkeepalive.setKeepAliveProbes(socket, 2)

    let sess = {}
    sess.addr = socket.remoteAddress;
    sess.socket = socket;
    sess.status = 'connect'


    adminList.push(sess)

    writeToAdmin(`[ADMIN CONN] ${sess.addr}`);

    let i = readline.createInterface(socket, socket);
    i.on('line', function(line) {
        if (line.trim() != '') {
            writeToAdmin(`[ADMIN] ${line}`);

            processCommandLine(line);
        }

    });

    socket.on('error', function(e) {
        console.log(`[ADMIN ERROR] ${e} ${sess.addr}`);
    });

    socket.on('close', function() {
        sess.status = 'close'

        let pos = adminList.indexOf(sess);
        if (pos >= 0) {
            adminList.splice(pos, 1);
        }

        writeToAdmin(`[ADMIN CLOSE] ${sess.addr}`);

    });
    socket.on('timeout', function() {
        writeToAdmin(`[ADMIN TIMEOUT] ${sess.addr}`);

    });
    socket.on('end', function() {


        writeToAdmin(`[ADMIN END] ${sess.addr}`);

    });

});




function writeToAdmin(line) {
    let now = moment().format()
    let ts = `[${now}]`

    console.log(ts + line);
    for (let s of adminList) {
        try {
            s.socket.write(ts + line + "\n");
        } catch (e) {}
    }
}


function findSocketByMac(mac) {
    for (let s of sessList) {
        // console.log('s:' , s)
        if (s.mac === mac) {
            return s.socket
        }
    }
}


function findSocketById(id) {
    for (let s of sessList) {
        // console.log('id ' + s.id + " -- " + id)
        if (s.id == id) {
            return s.socket
        }
    }
}

// interactive console
const rl = readline.createInterface(process.stdin, process.stdout);
// rl.setPrompt('guess> ');
// rl.prompt();
rl.on('line', function(line) {

    processCommandLine(line);

    // rl.prompt();
}).on('close', function() {
    // process.exit(0);
});


function processCommandLine(line) {
    // TODO: implement admin command
    let match = line.match(/^[lL][sS] ?(.*)/)
    if (match) {
        let opt = match[1];
        // console.log("opt:", opt)

        for (let s of sessList) {
            let ms = moment.duration(moment().diff(s.start))
            let upTime = Math.floor(ms.asDays()) + " days, " + moment.utc(ms.asMilliseconds()).format("HH:mm:ss");
            let out = `[SESS][${s.id}][${s.token}] ${upTime} trace: ${s.trace}\t${s.fwVer}\t-- ${s.addr}`;

            if (out.indexOf(opt) >= 0) {
                writeToAdmin(out);
            }

            // writeToAdmin(`[SESS] ${JSON.stringify(s)}`)
        }

    }

    // issue command to remote by MAC -- ex. CMD AC:83:F3:A0:41:EE SYS DUMP
    match = line.match(/^CMD ([0-9A-Fa-f,]+) (.+)/)
    if (match) {
        // console.log('match', match)
        let ids = match[1].split(",");
        let cmd = match[2];

        for (let id of ids) {
            let target = findSocketById(id)

            if (target) {
                console.log("[CMD] " + cmd)
                target.write(cmd + "\n")
            }
        }


    }

    match = line.match(/^CMDALL (.+)/)
    if (match) {
        // console.log('match', match)
        let cmd = match[1]

        for (let s of sessList) {
            console.log(`[CMD] ${s.id} ${s.addr} ${cmd}`);
            try {
                s.socket.write(cmd + "\n")
            } catch (e) {}
        }
    }

    // drop connection
    match = line.match(/^DROP ([0-9A-Fa-f]+)/)
    if (match) {
        // console.log('match', match)
        let id = match[1]

        let target = findSocketById(id)

        if (target) {
            console.log("[DROP] " + id)
            target.end()
            target.destroy()
        }
    }

}


server.listen(RCPORT);

adminServer.listen(ADMINPORT);

writeToAdmin(`[SERVER START]`);

console.log(`RCPORT: ${RCPORT} ADMINPORT: ${ADMINPORT}`)

