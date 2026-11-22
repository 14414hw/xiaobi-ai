# PenAI 发行版

面向有道词典笔（RK3562，逻辑画布 936×280）的 AI 助手发行版源码。

本仓库只包含发行版：应用标识 `8001123456789110`，当前版本 `1.0.2`。

## 目录结构

```
src/                       应用源码（页面、数据与工具模块）
tools/build.mjs            构建入口：编译并校验 .amr
tools/check_amr.py         安装包完整性校验
tools/security_scan.py     源码合规扫描
tools/molmetrics.mjs       结构布局度量辅助库
tools/tests/               回归测试（发行断言、分式排版、化学结构、语料、词库、版本）
docs/                      更新日志
package.json               发行版本元数据
package-lock.json          依赖锁定
app_icon.png               发行版图标
```

## 构建

环境要求：Node.js 18 及以上、Python 3、npm。

```
npm ci
node tools/build.mjs
```

产物为当前目录下的 `8001123456789110.1_0_2.amr`。构建脚本会先编译页面，
再逐项核对安装包清单：manifest 登记条目与包内文件一一对应（大小与 MD5）、
应用入口与全部注册页面齐全、路径安全。校验失败时构建以非零状态退出。

运行全部回归测试与合规扫描：

```
for f in tools/tests/*.mjs; do node "$f"; done
python tools/security_scan.py .
```

测试覆盖发行断言、分式与根式排版、结构式提取与渲染、化学审计、有机分子
语料（876 项）、布局度量（154 项）、输入法词库与版本同源。
构建脚本会先执行合规扫描，命中预设规则即终止构建。

## 安装

```
adb connect <设备地址>:5555
adb push 8001123456789110.1_0_2.amr /userdisk/penai_release.amr
adb shell miniapp_cli install /userdisk/penai_release.amr
```

按设备固有行为，安装后需重启一次宿主进程，再从桌面图标启动应用。
安装包是自包含的，不需要预先推送资源文件。

## 配置与数据

发行版不预设 API 地址、密钥或模型。首次使用在设置页填写服务商接口地址、
密钥与模型名称，也可从接口拉取模型列表后点选。

数据写入 `/userdisk/penair` 独立目录。核心提示词中的公式与化学结构规范
在运行时合成并锁定，用户补充要求只能追加。

## 许可

主许可采用 Apache-2.0，见 `LICENSE`。第三方依赖与字体的许可信息见
`THIRD_PARTY_NOTICES.md`，字体许可全文见 `OFL-1.1.txt`。
