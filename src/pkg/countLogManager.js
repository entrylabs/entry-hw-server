const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const si = require("systeminformation");
const { ENTRY_API_SERVER } = require("./constants");
const fetch = require("node-fetch");

const TARGET_FILE_NAME = "app.asar";
const LOG_TYPE = {
  START_APP: "start_app",
  CONNECT_DEVICE_SUCCESS: "connect_device_success",
  CONNECT_DEVICE_FAIL: "connect_device_fail",
  CONNECT_WS_SUCCESS: "connect_ws_success",
  DISCONNECT_WS: "disconnect_ws",
  CONNECT_ALL: "connect_all",
};

class CountLogManager {
  constructor() {
    this.logs = [];
    this.sha1 = undefined;
    this.osInfo = undefined;
    this.instanceHashId = this.generateUniqueId();
    this.deviceConnected = false;
    this.wsConnected = false;
    this.entryApiDomain = undefined;
    this.hardwareId = undefined;
  }

  async getSha1() {
    const targetFilePath = path.join(process.execPath, "..", TARGET_FILE_NAME);
    if (!fs.existsSync(targetFilePath)) {
      console.log("targetFilePath not Found");
      return;
    }

    const checksum = crypto.createHash("sha1");
    const readStream = fs.createReadStream(targetFilePath);

    return new Promise((resolve, reject) => {
      readStream.on("data", function (data) {
        checksum.update(data);
      });
      readStream.on("end", function () {
        resolve(checksum.digest("hex"));
      });
      readStream.on("error", reject);
    });
  }

  async getOsInfo() {
    const osInfo = await si.osInfo();
    return osInfo;
  }

  addLog(type, isCloudMode) {
    this.setConnectionState(type);
    this.pushLog(type, isCloudMode);

    // INFO : WS와 Device 모두 연결된 경우엔 서버로 로그 송신
    if (this.deviceConnected && this.wsConnected) {
      this.pushLog(LOG_TYPE.CONNECT_ALL, isCloudMode);
      this.sendLogs();
    }
  }

  pushLog(type, isCloudMode) {
    const log = {
      data: new Date(),
      type,
      isCloudMode: isCloudMode,
    };
    this.logs.push(log);
  }

  setApiDomain(env) {
    this.entryApiDomain = ENTRY_API_SERVER[env];
  }

  setConnectionState(type) {
    switch (type) {
      case LOG_TYPE.CONNECT_DEVICE_SUCCESS:
        this.deviceConnected = true;
        break;
      case LOG_TYPE.CONNECT_DEVICE_FAIL:
        this.deviceConnected = false;
        break;
      case LOG_TYPE.CONNECT_WS_SUCCESS:
        this.wsConnected = true;
        break;
      case LOG_TYPE.DISCONNECT_WS:
        this.wsConnected = false;
        break;
      case LOG_TYPE.START_APP:
      case LOG_TYPE.CONNECT_ALL:
        break;
      default:
        console.log("Invalid LOG_TYPE", type);
        break;
    }
  }

  sendLogs() {
    const logData = {
      instanceHashId: this.instanceHashId,
      asar: this.sha1,
      osInfo: this.osInfo,
      logs: this.logs,
      hardwareId: this.hardwareId,
    };

    if (!this.entryApiDomain) {
      console.log("Invalid Domain Error");
      return;
    }

    fetch(`${this.entryApiDomain}/api/hwActionLog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
    })
      .then((result) => {
        this.logs = [];
      })
      .catch((error) => {
        console.log(error);
      });
  }

  generateUniqueId() {
    const randomBytes = crypto.randomBytes(16);
    const hash = crypto.createHash("sha256").update(randomBytes).digest("hex");
    return hash;
  }

  async init() {
    this.sha1 = await this.getSha1();
    this.osInfo = await this.getOsInfo();
  }
}

const counter = new CountLogManager();

module.exports = {
  counter,
  LOG_TYPE,
};
