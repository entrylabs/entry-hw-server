const path = require('path');
const fs = require('fs');
const pkgFilePath = path.dirname(process.execPath);
const modulePath = path.join(pkgFilePath, '..', '..', 'modules');

module.exports = (req, res) => {
    const moduleName = req.url.replace('/modules/', '');

    console.log(`${moduleName} download requested`);
    console.log('file path is ', path.join(modulePath, moduleName));

    if (fs.existsSync(path.join(modulePath, `${moduleName}.json`))) {
        const configBuffer = fs.readFileSync(path.join(modulePath, `${moduleName}.json`));
        const configJson = JSON.parse(configBuffer);

        if (configJson.block) {
            res.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
            });
            res.write(fs.readFileSync(path.join(modulePath, configJson.block)), 'utf8');
            res.end(null, 'utf8');
        } else {
            res.statusCode = 400;
            res.end('Cannot find module', 'utf8');
        }
    }
};
