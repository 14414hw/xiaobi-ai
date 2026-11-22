// 构建 PenAI 发行版安装包（纯发行版仓库，单副本）
//
// 用法：npm ci && node tools/build.mjs
// 产物：<appid>.<version>.amr（版本号点号转下划线）
// 构建后自动做安装包自包含校验，失败则退出码 1。

import fs from 'fs'
import path from 'path'
import { execSync, execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const amrName = pkg.appid + '.' + String(pkg.version).replace(/\./g, '_') + '.amr'
const amr = path.join(ROOT, amrName)

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.error('缺少 node_modules，先执行 npm ci')
  process.exit(1)
}

console.log('[1/4] 安全扫描')
execFileSync('python', [path.join(__dirname, 'security_scan.py'), ROOT], { stdio: 'inherit' })

console.log('[2/4] 编译页面与打包：' + amrName)
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

if (!fs.existsSync(amr)) {
  console.error('构建未生成安装包：' + amr)
  process.exit(1)
}
console.log('[3/4] 安装包已生成：' + fs.statSync(amr).size + ' 字节')

console.log('[4/4] 安装包自包含校验')
execFileSync('python', [path.join(__dirname, 'check_amr.py'), amr], { stdio: 'inherit' })
console.log('OK  发行版构建完成：' + amrName)
