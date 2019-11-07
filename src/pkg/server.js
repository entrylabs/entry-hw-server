const assetStore = require('./assetPathStore');
const { RUNNING_MODE_TYPES: RunningModeTypes, CLOUD_MODE_TYPES: CloudModeTypes } = require('./constants');
const fs = require('fs');
const EventEmitter = require('events');
const https = require('https');
const http = require('http');
const SocketIOClient = require('socket.io-client');
const SocketIOServer = require('socket.io');

const printLog = console.log;
const printError = console.error;

class EntryServer extends EventEmitter {
    get PORT() {
        return 23518;
    }

    constructor(args = {
        http: false,
    }) {
        super();

        // 외부에서 온 프로퍼티가 있는 경우 필요한 프로퍼티만 뽑아서 세팅한다.
        this.options = args;

        // 서버모드 동작시 필요한 프로퍼티들
        this.hardwareClientList = [];
        this.browserClientList = [];
        this.matchedHardwareClientIdMap = {}; // { [roomId]: hardwareClient.id } 브라우저 -> 하드웨어 클라이언트 송신용
        this.runningMode = RunningModeTypes.server;
        this.currentServerMode = CloudModeTypes.singleServer;
        this.httpServer = undefined;
        this.socketServer = undefined; // 호스트인 경우 세팅됨
        this.clientRoomId = undefined; // 자신이 서버인데 클라우드 모드에서 자신도 데이터 송수신을 해야하는 경우 사용됨

        // 클라이언트 모드 동작시 필요한 프로퍼티들
        this.socketClient = undefined; // 클라이언트인 경우 세팅됨
        this.masterRoomIds = []; // 최초 서버에 문제가 발생하는 경우 서버 재선출 후 세팅될 클라이언트 목록 저장용

        printLog('pkg object created');
    }

    addRoomId(roomId) {
        if (!roomId) {
            return;
        }

        printLog('roomId inserted from hardware client:', roomId);
        if (this.runningMode === RunningModeTypes.server) {
            printLog('host server\'s roomId inserted');
            this.clientRoomId = roomId;
            if (this.masterRoomIds.indexOf(roomId) === -1) {
                this.masterRoomIds.push(roomId);
            }
        } else {
            printLog('client roomId inserted. client will request match browser target:', roomId);
            this.clientRoomId = roomId;
            this.socketClient && this.socketClient.emit('matchTarget', roomId);
            if (this.masterRoomIds.indexOf(roomId) === -1) {
                this.masterRoomIds.push(roomId);
            }
        }
    }

    // legacy 용. 필요없게 되면 지워도 됩니다. entryjs 에서 하드웨어 연결 종료시 실행
    disconnectHardware() {
        this.sendToClient('disconnectHardware');
    }

    // 엔트리 서버로 데이터를 송신한다.
    sendToClient(data) {
        const payload = { data };
        // 자신이 클라이언트라면 서버에 메세지를 보낸다
        if (this.runningMode === RunningModeTypes.client) {
            this.socketClient.emit('message', payload);
        }

        // 자신이 서버인 경우
        else if (this.runningMode === RunningModeTypes.server) {
            // 클라우드모드인 경우 자신도 Cloud PC 접속 버튼을 눌러 roomId 를 보유해야 한다.
            if (this.currentServerMode === CloudModeTypes.cloud && this.clientRoomId) {
                this.socketServer.to(this.clientRoomId).emit('message', payload);
            }

            // 만약 클라우드모드가 아닌 일반 단일모드면 그냥 모든 브라우저에 전부 데이터를 보낸다. 해당 브라우저는 하나라고 가정한다.
            else {
                this.browserClientList.forEach((client) => {
                    client.emit('message', payload);
                });
            }
        }

        // 둘다 아닌 경우는 없어야 한다. 개발자 에러이다.
        else {
            printError('Unexpected Error');
        }
    }

    /**
     * 단순히 _initServer 의 synonym
     * @param port{number?}
     */
    open(port) {
        this._initServer(port);
    }

    close() {
        printLog('server will be close..');
        this.socketServer && this.socketServer.close();
        this.httpServer && this.httpServer.listening &&
        this.httpServer.close();
        this.socketServer = undefined;
        this.httpServer = undefined;
        this.emit('close');
    }

    _httpHealthCheckListener(req, res) {
        printLog('http request received:', req.path);
        res.statusCode = 200;
        res.end('hello entry');
    };

    /**
     * 현재 객체가 서버로 동작하는지, 클라이언트로 동작하는지를 표기한다.
     * @param mode
     * @private
     */
    _setRunningMode(mode) {
        switch (mode) {
            case RunningModeTypes.client: {
                printLog('running mode : client');
                break;
            }
            case RunningModeTypes.server: {
                printLog('running mode : server');
                break;
            }
        }
        this.runningMode = mode;
        this.emit('runningModeChanged', mode);
    }

    /**
     * 현재 개체가 단일서버로 동작중인지, 클라이언트가 물려있는지의 상태를 표기한다.
     * 현재 개체가 서버가 아닌 경우는 로직에 영향을 주지 않는다.
     * 이 표기가 필요한 이유는, UI 상태 변경 및 소켓 메세지 전달 방식의 수정이 필요해서이다.
     * @param mode
     * @private
     */
    _setCloudServerMode(mode) {
        switch (mode) {
            case CloudModeTypes.singleServer:
                printLog('cloud status : single server');
                break;
            case CloudModeTypes.cloud: {
                printLog('cloud status : cloud server');
                break;
            }
            default: {
                // 두가지 외 다른 값이 들어오면 아무동작도 하지 않는다.
            }
        }

        this.currentServerMode = mode;
        this.emit('cloudModeChanged', mode);
    }

    _getSSLFileList() {
        const SSLFileList = [
            assetStore.get('hardware.key'),
            assetStore.get('cert.pem'),
            assetStore.get('ChainCA1.crt'),
            assetStore.get('ChainCA2.crt'),
            assetStore.get('RootCA.crt'),
        ];
        const existsSync = (fileName) => {
            try {
                fs.accessSync(fileName);
                return true;
            } catch (e) {
                return false;
            }
        };

        const isAllExists = SSLFileList.map((fileName) => existsSync(fileName));
        if (isAllExists.every((result) => result)) {
            const [key, cert, ...ca] = SSLFileList.map((fileName) => fs.readFileSync(fileName));
            return { key, cert, ca };
        }
    }

    _initServer(port = this.PORT) {
        printLog('init server..');
        try {
            const SSLFileList = this.options.http ? undefined : this._getSSLFileList();
            const host = this.options.http ?
                `http://127.0.0.1:${port}` :
                `https://hardware.playentry.org:${port}`;
            let server = undefined;
            if (SSLFileList) {
                printLog('server runs on https');
                server = https.createServer({
                    key: fs.readFileSync(assetStore.get('hardware.key')),
                    cert: fs.readFileSync(assetStore.get('cert.pem')),
                    ca: [
                        fs.readFileSync(assetStore.get('ChainCA1.crt')),
                        fs.readFileSync(assetStore.get('ChainCA2.crt')),
                        fs.readFileSync(assetStore.get('RootCA.crt')),
                    ],
                }, this._httpHealthCheckListener.bind(this));
            } else {
                printLog('server runs on http');
                server = http.createServer(this._httpHealthCheckListener.bind(this));
            }

            server.on('error', () => {
                printLog('failed to server listen. try to run client mode');
                this.httpServer = undefined;
                this.socketServer = undefined;
                this._setRunningMode(RunningModeTypes.client);
                this._setCloudServerMode(CloudModeTypes.cloud);
                this.socketClient = this._createSocketClient(host);
            });

            server.on('listening', () => {
                printLog('server listen successfully.');
                this.httpServer = server;
                this._setRunningMode(RunningModeTypes.server);
                this._setCloudServerMode(CloudModeTypes.singleServer);
                this._initSocketServer();
            });

            server.listen(port, () => {
                printLog('https server created');
            });
        } catch (e) {
            printError('Error occurred while server open', e);
        }
    }

    _initSocketServer() {
        printLog('init socket server..');
        if (!this.httpServer) {
            return;
        }

        const socketServer = SocketIOServer(this.httpServer, {
            pingInterval: 1000,
            transports: [
                'websocket',
                'flashsocket',
                'htmlfile',
                'xhr-polling',
                'jsonp-polling',
                'polling',
            ],
        });

        this.socketServer = socketServer;

        socketServer.on('connection', (socket) => {
            printLog('socket connected');

            const connection = socket;

            // handshake 쿼리에 childServer 가 있으면 하드웨어, 없으면 브라우저로 판단한다.
            // 브라우저는 기본적으로 roomId 가 있을 것으로 판단한다.
            if (connection.handshake.query.childServer === 'true') {
                printLog('socket is hardware client');
                // 클라이언트가 하드웨어인 경우
                this.hardwareClientList.push(connection);
            } else {
                // 클라이언트가 브라우저인 경우 해당 커넥션은 기본적으로 roomId 가 있다는 가정하에 room join 을 해둔다.
                // 이 room 은 추후 하드웨어가 참여할 공간이 된다.
                const roomId = connection.handshake.query.roomId;
                printLog('socket is browser client. roomId is', roomId);
                connection.join(roomId);
                connection.roomId = roomId;
                this.browserClientList.push(connection);
            }

            // 신규 커넥션이 도착하면 서버의 상태를 변경한다. 연결된 하드웨어 클라이언트가 없으면
            // 클라우드 PC 모드에서 싱글 모드로 변경한다.
            if (this.hardwareClientList.length > 0) {
                this._setCloudServerMode(CloudModeTypes.cloud);
            } else {
                this._setCloudServerMode(CloudModeTypes.singleServer);
            }

            connection.on('matchTarget', (roomIdArgument) => {
                const roomId = typeof roomIdArgument === 'object' ? roomIdArgument.roomId : roomIdArgument;

                if (connection.handshake.query.childServer === 'true' && roomId) {
                    printLog('hardware client requested browser target match');

                    // 자신이 외부에서 받아온 roomId 에 커넥션 id 를 등록한다.
                    // 브라우저 -> 하드웨어로 갈 때 필요한 조치
                    // NOTE socketIo 는 room join 전 자신의 id 를 자신의 첫번째 roomId 로 가지고 있다.
                    this.matchedHardwareClientIdMap[roomId] = connection.id;

                    // 하드웨어 -> 브라우저로 갈 떄 필요한 조치
                    connection.roomId = roomId;
                }
            });

            // 자신에게 연결된 소켓이 연결이 해제된 경우
            connection.on('disconnect', () => {
                if (connection.handshake && connection.handshake.query.childServer === 'true') {
                    // 연결해제된 클라이언트 소켓이 하드웨어인 경우
                    printLog('hardware client socket disconnected:', connection.id);
                    this._removeHardwareClient(connection);
                } else {
                    // 연결해제된 클라이언트 소켓이 브라우저인 경우
                    printLog('browser client socket disconnected:', connection.id);
                    this._removeBrowserClient(connection);
                }
            });

            connection.on('message', (message, ack) => {
                if (this.currentServerMode === CloudModeTypes.singleServer) {
                    // 싱글 서버 모드인경우
                    this.emit('data', message);
                } else {
                    // Cloud PC 모드인 경우
                    if (connection.handshake.query.childServer === 'true') {
                        // 하드웨어에서 온 데이터라면 연결된 브라우저로 전달
                        if (connection.roomId) {
                            socketServer.to(connection.roomId).emit('message', message);
                        }
                    } else if (this.matchedHardwareClientIdMap[connection.roomId]) {
                        // 브라우저에서 온 데이터라면 먼저 다른 하드웨어로 전달해야 하는지 확인 후 전달
                        const roomId = this.matchedHardwareClientIdMap[connection.roomId];
                        socketServer.to(roomId).emit('message', message);
                    } else if (this.clientRoomId === connection.roomId) {
                        // 브라우저가 서버 자신과 매칭된 녀석이라면 그냥 자신이 데이터를 점유.
                        this.emit('data', message);
                    }
                }

                // 특수한 경우 사용됨
                if (ack) {
                    const { key = true } = message;
                    ack(key);
                }
            });

            connection.on('close', () => {
                if (connection.handshake.query.childServer === 'true') {
                    // 해당 클라이언트가 하드웨어에서 온 메세지인 경우
                    this._removeHardwareClient(connection);
                } else {
                    this._removeBrowserClient(connection);
                }
            });
        });
        printLog('socket server created');
    }

    _removeHardwareClient(target) {
        printLog(target.id, 'is removed from list');
        this.hardwareClientList = this.hardwareClientList.filter((client) => client.id !== target.id);
        if (target.connected) {
            target.disconnect();
        }

        // 목록이 삭제되고 나서 하드웨어 클라이언트 목록이 없으면 다시 단일 호스트로 동작한다.
        if (this.hardwareClientList.length <= 0) {
            this._setCloudServerMode(CloudModeTypes.singleServer);
        }
    }

    _removeBrowserClient(target) {
        printLog(target.id, 'is removed from list');
        this.browserClientList = this.browserClientList.filter((client) => client.id !== target.id);
        if (target.connected) {
            target.disconnect();
        }
    }

    _createSocketClient(address) {
        printLog('init socket client...');
        const socket = SocketIOClient(address, {
            query: { childServer: true },
            reconnectionAttempts: 3,
        });

        socket.on('connect', () => {
            printLog('client successfully connected with server');
            if (this.clientRoomId) {
                // 만약 서버와의 연결이 끊어져서 재선출 시도를 하였다가 실패하여 다시 클라이언트 모드로 동작하는 경우,
                // 이전에 가지고 있던 브라우저의 roomId 을 활용해 다시 타겟연결을 시도해둔다.
                this.socketClient.emit('matchTarget', this.clientRoomId);
            }
        });

        socket.on('message', (message) => {
            this.emit('data', message);
        });

        // 필요없으면 삭제
        socket.on('mode', (data) => {
            socket.mode = data;
        });

        socket.on('reconnect_failed', () => {
            // 소켓 연결이 실패한 경우는 클라이언트모드를 끝내고 다시 서버모드 전환을 시도한다.
            socket.close();
            this.socketClient = undefined;
            this._initServer();
        });

        socket.on('disconnect', () => {
            socket.close();
            this.socketClient = undefined;
            this._initServer();
        });

        return socket;
    }
}

module.exports = EntryServer;
