/**
 * 외부에서 메세지를 받아 서버에 전달하는 역할을 하는 함수
 * @param entryServer {EntryServer}
 */
const registerFunction = (entryServer) => {
    process.on('message', (message) => {
        if (typeof message === 'string') {
            return;
        }
        try {
            const { key, value } = message;
            if (!key) {
                return;
            }

            switch (key) {
                case 'open': {
                    entryServer.open();
                    break;
                }
                case 'addRoomId': {
                    entryServer.addRoomId(value);
                    break;
                }
                case 'send': {
                    entryServer.sendToClient(value);
                    break;
                }
                case 'disconnectHardware': {
                    entryServer.disconnectHardware();
                    break;
                }
            }
        } catch (e) {
        }
    });
};

module.exports = {
    register: registerFunction,
};
