const path = require('path');

/**
 * pkg 는 아래의 조건을 만족하는 경우 asset 을 탐지할 수 있다고 한다.
 * - path.join
 * - 2개의 인자
 * - 두번째 인자는 string literal
 * @see https://github.com/zeit/pkg#detecting-assets-in-source-code
 */
const assetList = {
    ['hardware.key']: path.join(__dirname, '../../assets/hardware.key'),
    ['cert.pem']: path.join(__dirname, '../../assets/cert.pem'),
    ['ChainCA1.crt']: path.join(__dirname, '../../assets/ChainCA1.crt'),
    ['RootCA.crt']: path.join(__dirname, '../../assets/RootCA.crt'),
};

module.exports = {
    get: (fileName) => assetList[fileName] || undefined,
};
