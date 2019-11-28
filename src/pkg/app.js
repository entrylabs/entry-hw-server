const EntryServer = require('./server');
const inMessageRegister = require('./inMessageRegister');
const outMessageRegister = require('./outMessageRegister');
const entryServer = new EntryServer();

inMessageRegister.register(entryServer);
outMessageRegister.register(entryServer);

process.on('SIGTERM', () => {
    entryServer.close();
});

setInterval(() => {
    if (!process.connected || process.channel === null) {
        entryServer.close();
        process.exit();
    }
}, 2000);

