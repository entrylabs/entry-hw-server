# Entry HW Server

## 무슨 프로젝트인가?
[엔트리 하드웨어](https://github.com/entrylabs/entry-hw)는 워크스페이스와 웹소켓 통신으로 연결되어 있습니다.

그리고 워크스페이스가 포함되어있는 엔트리 웹사이트는 https 이므로, 이를 위해 엔트리 하드웨어는 https 웹소켓 서버를 오픈해야 합니다.

오픈소스로 개발 되고있는 엔트리 하드웨어에 https 서버 구동을 위한 SSL 인증서 포함은 불가피 하였으나,

보안상 이슈가 발생할 수 있다는 점과 발생하지 않더라도 real phase 에서 사용되고있는 SSL 인증서가 공개된 코드에 포함된다는 것에 대한 이슈로 인해
해당 문제점을 해결 하기 위해 만들어진 프로젝트입니다.

## 무엇이 달라졌는가?
SSL 인증서를 사용하는 http 서버 로직 / 클라우드 환경에서의 다양한 로직을 한군데 모으고,
외부와 IPC Process Event 만으로 상호작용할 수 있도록 코드를 개선하였습니다.

바이너리화는 pkg 를 사용하였으며, Node 10 version 에서 동작하는것과 동일한 세팅환경인 단일 실행가능 파일로 만들어집니다.

## 어떤 일을 하는가?
### As - Is

![image](https://user-images.githubusercontent.com/40051225/66364966-62afde00-e9c6-11e9-88be-ede7443b8f86.png)

기존의 로직은 모든 코드가 전부 공개되어있는 상태입니다.

Electron 의 asar 압축을 하더라도 간단한 virtual file system 정도의 압축이므로 간단히 압축을 해제하여 SSL 인증서를 탈취할 수 있습니다.
 
### To - Be

![image](https://user-images.githubusercontent.com/40051225/66364975-680d2880-e9c6-11e9-96db-7c9553d954bb.png)

Single Executable Binary 로 서버 관련 로직을 한군데 모으고,

엔트리 하드웨어와는 IPC Channel 로 통신합니다. 모든 로직은 { key: string, value: any } 모양을 유지하여 통신하도록 규정하였습니다.
key 는 eventName, value 는 arguments 입니다.

## 구성

### 사용시
빌드 결과 파일을 아래와 같이 사용합니다.
```javascript
const { spawn } = require('child_process');
const childPkgProc = spawn('path/to/binary', [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], detached: true });
```
알아두어야 할 점은, 꼭 IPC 채널로 Parent Process 와 연결되어야 한다는 점입니다.

백그라운드에서 주기적으로 Parent 와 연결되어있는지 체크하고, 연결이 해제됨을 감지하면 자동으로 프로세스가 종료됩니다.
(엔트리 하드웨어가 종료되었는데 계속 백그라운드 프로세스로 혼자 떠있는 것을 방지하기 위함)

```javascript
setInterval(() => {
    if (!process.connected || process.channel === null) {
        process.exit();
    }
}, 3000);
```

### Parent Process → this 로 IPC Message 전송 시 API

메세지는 { key: string, value: any } 의 형태로 전송합니다.

전송 코드는 **childPkgProc.send(message);** 와 같은 형태를 가집니다.

| key                | value          | 설명                                                                                       |
|--------------------|----------------|--------------------------------------------------------------------------------------------|
| open               | -              | 서버를 구동한다.                                                                           |
| addRoomId          | roomId: string | 클라우드 모드에서, 현재 실행된 엔트리 하드웨어 프로세스에 roomId 를 주입하는 이벤트        |
| send               | object: any    | 해당 서버 코드를 통해 엔트리 워크스페이스로 데이터를 전송하는 이벤트                       |
| disconnectHardware | -              | 하드웨어 연결 끊김 이벤트 전송 ( send('disconnectHardware') 의 alias 로, 레거시 대응용임 ) |

### this → Parent Process 로 IPC Message 전송 시 API

메세지는 { key: string, value: any } 의 형태로 전송합니다.

Parent Process 에서 해당 이벤트를 구독하기 위해서는 **childPkgProc.on('message', ({key, value}) => { some logic... })** 의 한 이벤트에서 로직을 처리하여야 합니다.

| key                | value        | 설명                                                                                                      |
|--------------------|--------------|-----------------------------------------------------------------------------------------------------------|
| cloudModeChanged   | mode: number | 현재 프로세스가 단일 서버 프로세스로 동작하는지, 클라우드 환경으로 동작중인지에 대한 상태변경 이벤트      |
| runningModeChanged | mode: number | 현재 프로세스가 클라우드 모드에서 호스트서버로 동작하는지, 클라이언트로 동작하는지에 대한 상태변경 이벤트 |
| data               | object: any  | 엔트리 워크스페이스에서 하드웨어쪽으로 전송하는 데이터를 받는 이벤트                                      |
| close              | -            | 서버가 종료될때 발생하는 이벤트                                                                           |
