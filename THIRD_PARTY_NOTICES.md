第三方组件与许可声明

一、npm 依赖（通过 npm 安装，不随仓库分发二进制）

  aiot-vue-cli 1.0.32    MIT    https://registry.npmjs.org/aiot-vue-cli
  falcon-ui    2.0.2     MIT    https://registry.npmjs.org/falcon-ui

二、字体

  src/utils/glyphs.js 中的字形轮廓由 Noto 字体生成，字体二进制不随仓库分发。
  字体软件按 SIL Open Font License 1.1 授权，许可全文见本仓库 OFL-1.1.txt。

三、设计参照

  PenCG 项目（GPL-3.0）：
  仅参照宿主 JSAPI 的注册范式与通用样板声明，未复制其协议栈与媒体处理
  实现代码，也未分发其二进制。本项目源码为独立实现，主许可采用 Apache-2.0。

四、不在本仓库分发的内容

  设备登录凭据、API 密钥、用户会话与偏好数据、厂商逆向得到的二进制库、
  内部调试版源码与开发脚本，以及云游戏相关的页面、原生模块与侧车脚本。
  本仓库不包含任何原生模块。
