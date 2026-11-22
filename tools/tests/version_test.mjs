// 版本号一致性测试
//
// 起因：界面左上角写死了 'v1.9.18'，安装包已经升到 1.9.20，界面还显示旧号。
// 核对线上是哪一版时会直接误判，回归日志里的 ver 也是错的。
// 现在版本号只有一个来源 APP_VERSION，这里守住三条：
//   1) APP_VERSION 与 package.json 一致
//   2) chat.vue 不再硬编码 vX.Y.Z
//   3) 安装包文件名里的版本号与 package.json 一致（若包已构建）

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { APP_VERSION } from '../../src/utils/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

let fail = 0
function ok(cond, msg) {
  if (cond) console.log('ok    ' + msg)
  else { fail++; console.log('FAIL  ' + msg) }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
ok(/^\d+\.\d+\.\d+$/.test(APP_VERSION), 'APP_VERSION 是 x.y.z 形式，实际 ' + APP_VERSION)
ok(
  APP_VERSION === pkg.version,
  'APP_VERSION 与 package.json 一致：' + APP_VERSION + ' vs ' + pkg.version
)

const chat = fs.readFileSync(path.join(ROOT, 'src/pages/chat/chat.vue'), 'utf8')
ok(
  !/ver:\s*'v\d+\.\d+\.\d+'/.test(chat),
  'chat.vue 没有硬编码版本号'
)
ok(
  /ver:\s*'v'\s*\+\s*APP_VERSION/.test(chat),
  'chat.vue 的 ver 由 APP_VERSION 拼出'
)

// 已构建的安装包：文件名由 appid 与版本拼出
const amr = pkg.appid + '.' + APP_VERSION.replace(/\./g, '_') + '.amr'
const amrPath = path.join(ROOT, amr)
if (fs.existsSync(amrPath)) {
  const st = fs.statSync(amrPath)
  ok(st.size > 100000, '安装包存在且大小合理：' + amr + ' ' + st.size + ' 字节')
} else {
  console.log('skip  尚未构建 ' + amr + '（构建后再跑本测试）')
}

console.log(fail === 0 ? 'OK  version_test 全部通过' : 'FAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
