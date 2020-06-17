const sendEventUsingProcess = (methodName, value) => {
    process.send({
        key: methodName,
        value,
    });
};

/**
 * 서버에서 발생한 이벤트를 받아 외부에 전달하는 역할을 하는 함수
 * @param entryServer {EntryServer}
 */
const registerFunction = (entryServer) => {
    entryServer.on('cloudModeChanged', (mode) => {
        sendEventUsingProcess('cloudModeChanged', mode);
    });
    entryServer.on('runningModeChanged', (mode) => {
        sendEventUsingProcess('runningModeChanged', mode);
    });
    entryServer.on('data', (message) => {
        sendEventUsingProcess('data', message);
    });
    entryServer.on('close', (connectionId) => {
        sendEventUsingProcess('close', connectionId);
    });
    entryServer.on('connection', () => {
        sendEventUsingProcess('connection');
    });
};

module.exports = {
    register: registerFunction,
};
