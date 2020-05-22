const downloadEntryModuleFileHandler = require('./downloadEntryModuleFileHandler');

const printLog = console.log;

module.exports = (req, res) => {
    if (req.url.startsWith('/modules')) {
        // app/server/[OS_type]/server.exe
        downloadEntryModuleFileHandler(req, res);
    } else {
        printLog('http request received:', req.path);
        res.statusCode = 200;
        res.end('hello entry');
    }
}
