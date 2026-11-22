// 分式识别测试
//
// 这个模块的失败模式是"误判"：把 TCP/IP、日期、URL 当成分数后，
// 正文会被拆成竖排的分子分母，读起来比不转换更糟。所以用例里一半是反例。
//
// 用法：node penai/tools/tests/frac_test.mjs
import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../../src/utils/frac.js')

let fail = 0
const ok = (cond, msg) => {
  if (cond) console.log('ok    ' + msg)
  else { fail++; console.log('FAIL  ' + msg) }
}

// frac.js 是 ESM，项目没有 type:module；在 vm 里剥掉 export 直接跑
const src = fs.readFileSync(SRC, 'utf8')
  .replace(/export\s+function/g, 'function')
  .split('\n')
  .filter((l) => l.indexOf('export default') !== 0)
  .join('\n')
const ctx = {}
vm.createContext(ctx)
vm.runInContext(src + '\nthis.parseFracLine = parseFracLine;', ctx)
const parse = ctx.parseFracLine

const fracs = (segs) => (segs || []).filter((s) => s.k === 'f')

// ---- 正例：应该竖排 ----
let r = parse('1/2')
ok(fracs(r).length === 1 && fracs(r)[0].num === '1' && fracs(r)[0].den === '2', '1/2 → 1 竖排 2')

r = parse('所以答案是1/2。')
ok(fracs(r).length === 1, '句中 1/2 识别为分式')
ok(r[0].k === 't' && r[0].s === '所以答案是', '前半句保留为文本')
ok(r[r.length - 1].k === 't' && r[r.length - 1].s === '。', '句号留在文本段')

r = parse('sin x+log₁₀(x)/cos x')
ok(fracs(r).length === 1, '整行复杂分式识别')
ok(fracs(r)[0].num === 'sin x+log₁₀(x)' && fracs(r)[0].den === 'cos x',
  '分子分母切分正确（' + (fracs(r)[0] || {}).num + ' / ' + (fracs(r)[0] || {}).den + '）')

r = parse('(a+b)/(c+d)')
ok(fracs(r).length === 1 && fracs(r)[0].num === 'a+b' && fracs(r)[0].den === 'c+d',
  '括号组作为分子分母，外层括号被横线取代（' + (fracs(r)[0] || {}).num + ' / ' + (fracs(r)[0] || {}).den + '）')

r = parse('x/y')
ok(fracs(r).length === 1, '单字母 x/y 也竖排')

r = parse('½')
ok(fracs(r).length === 1 && fracs(r)[0].num === '1' && fracs(r)[0].den === '2',
  'Unicode ½ 还原成 1 竖排 2')

r = parse('概率约为 3/4 左右')
ok(fracs(r).length === 1, '句中 3/4 识别')

// ---- 反例：必须原样保留 ----
const keep = ['TCP/IP', 'https://a.com/b', '2026/11/19', 'km/h', '100km/h', 'W/Hz', 'and/or', '1/2/3']
for (const t of keep) {
  ok(parse(t) === null, '不误判：' + t)
}

r = parse('A/B 测试怎么做')
ok(fracs(r).length === 0, '中文里的 A/B 术语不误判')

r = parse('访问 https://a.com/x/y 看看')
ok(fracs(r).length === 0, 'URL 里的斜杠不当作分式')

// ---- 结构约束 ----
r = parse('1/2')
ok(typeof fracs(r)[0].w === 'number' && fracs(r)[0].w >= 22, '分式带横线宽度 w')
ok(parse('没有分数的普通一句话') === null, '无斜杠直接返回 null')
ok(parse('') === null && parse(null) === null, '空输入安全')

// ---- 物理表达式 ----
// 物理的坑和数学不同：单位写成 m/s（不是分式）、公式写成 a=F/m（是分式）、
// 复合下标 F_net、整行公式里只有一个分数要竖排。这几条错一个就会被客户看到。

r = parse('速度 v=s/t')
ok(fracs(r).length === 1 && fracs(r)[0].num === 's', '中文公式行 v=s/t 竖排（等号给语境）')

r = parse('密度 ρ=m/V')
ok(fracs(r).length === 1, 'ρ=m/V 竖排')

r = parse('欧姆定律 R=U/I')
ok(fracs(r).length === 1, 'R=U/I 竖排')

r = parse('a=F/m 单位 m/s²')
ok(fracs(r).length === 1 && fracs(r)[0].num === 'F',
  '同一行里公式右边转、后面的单位不转（分式数 ' + fracs(r).length + '）')

r = parse('Eₖ=1/2mv²')
ok(fracs(r).length === 1 && fracs(r)[0].num === '1' && fracs(r)[0].den === '2',
  'Eₖ=1/2mv² 只竖排 1/2，不把整行当分数')

r = parse('Δx=v₀t+1/2at²')
ok(fracs(r).length === 1, '多分式公式行只认真正的分数')

// ---- 单位必须原样保留 ----
const units = ['m/s', 'N/m', 'J/K', 'm/s²', 'kg·m/s²', 'km/h', 'W/Hz']
for (const t of units) ok(parse(t) === null, '单位不误判：' + t)

// ---- 根式 ----
r = parse('v=√(2gh)')
ok(r && r.length === 2 && r[0].k === 't' && r[1].k === 'r' && r[1].body === '2gh',
  'v=√(2gh) 产出根式段（' + JSON.stringify(r && r.map((x) => x.k)) + '）')
ok(r && r[1].w >= 22, '根式带上横线宽度 w')

r = parse('√(3) 加 1/2')
ok(r && r.length === 3 && r[0].k === 'r' && r[2].k === 'f', '根号与分式可在同一行混排')

r = parse('T=2π√(l/g)')
ok(r && r.some((x) => x.k === 'r' && x.body === 'l/g'), '根号内保持原文，不嵌竖排')

// ---- 矢量：字母 + U+20D7 组合箭头 → 结构，页面自己画（该字形在笔端字体里缺失）----
const VEC = String.fromCharCode(0x20d7)
r = parse('F' + VEC + '=ma' + VEC)
ok(r && r.length === 3 && r[0].k === 'v' && r[0].body === 'F' && r[2].k === 'v',
  '矢量识别为结构段（' + JSON.stringify(r && r.map((x) => x.k)) + '）')
ok((parse('速度 v' + VEC + '=v0') || []).some(function (x) { return x.k === 'v' }), '中文行里的矢量也能识别')

// ---- 界面接入（改坏了不会报错，只会退回斜线显示）----
const vue = fs.readFileSync(path.resolve(__dirname, '../../src/pages/chat/chat.vue'), 'utf8')
ok(/import \{ parseFracLine \} from '\.\.\/\.\.\/utils\/frac\.js'/.test(vue), 'chat.vue 引入 parseFracLine')
ok(/ln\.frac/.test(vue), '模板按 ln.frac 分流')
ok(/fracBar\(sg\)/.test(vue), '有分式横线样式方法')
ok(/radBar\(sg\)/.test(vue), '有根号上横线样式方法')
ok(/sg\.k === 'r'/.test(vue), '模板渲染根号段')
ok(/sg\.k === 'v'/.test(vue), '模板渲染矢量段')
ok(/parseFracLine\(line\)/.test(vue), '折行前先判断分式，避免把分子分母切开')

console.log(fail === 0 ? 'OK  frac_test 全部通过' : 'FAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
