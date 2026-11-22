// 分式与根式排版：把文本里的分数/根号识别成「结构」，交给页面用
// 分子 / 横线 / 分母 竖排，或 √ + 上横线。
//
// 为什么单独一个文件：fmt.js 只产出字符串，而竖排需要结构（两个文本块 + 一条线），
// 字符串层面做不到。识别范围刻意收窄——宁可漏判，也不要误判：
// TCP/IP、km/h、https://a/b/c、2026/11/19、W/Hz 这些必须原样保留。
//
// 输出：null（不含分式/根式）或分段数组：
//   [{ k:'t', s:'所以答案是' }, { k:'f', num:'1', den:'2', w:22 }]
//   [{ k:'r', body:'2gh', w:40 }]
//   [{ k:'v', body:'F' }]                 ← 矢量：字母上方画小箭头
// w 是横线的像素宽度（按内容估算），页面直接用。

var VULGAR = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
}

// SI 单位符号：物理里 "m/s" "N/m" "J/K" 是单位，不是分式。
// 只在整行没有等号时生效——"a=F/m" 有等号，右边就是要竖排的分式（F 与 m
// 同样是单位符号，靠等号区分：公式 vs 单位）。
var UNIT = {
  // 基本单位
  m: 1, s: 1, g: 1, A: 1, K: 1, mol: 1, cd: 1,
  // 导出单位
  N: 1, J: 1, W: 1, Pa: 1, Hz: 1, V: 1, C: 1, F: 1, H: 1, T: 1,
  Wb: 1, lm: 1, lx: 1, Bq: 1, Gy: 1, Sv: 1, rad: 1, sr: 1, S: 1, ohm: 1,
  // 常用非 SI
  L: 1, l: 1, h: 1, min: 1, d: 1, t: 1, eV: 1, kWh: 1, Wh: 1, dB: 1
}

// 带前缀的量：km mg μm ms kV mA 之类。前缀表 + 基本单位表拼起来判断，
// 这样不用手写几十个组合。
var PREFIX = { k: 1, c: 1, m: 1, u: 1, 'μ': 1, n: 1, p: 1, M: 1, G: 1, T: 1, d: 1, h: 1 }

// 少数组合单位：kWh（k+Wh）、mAh（m+Ah）
var UNIT2 = { Wh: 1, Ah: 1, 'Ω': 1, Nm: 1 }

function isUnitAtom(s) {
  var t = String(s == null ? '' : s)
  // s²、m³、s^{-2} 这类指数不改变单位性质
  t = t.replace(/[\u2070-\u209f\u00b2\u00b3\u00b9]+$/, '').replace(/\^\(?-?\d+\)?$/, '')
  if (!t) return false
  if (UNIT[t] === 1) return true
  // km / mg / μs：首字母是前缀且余下部分是单位
  if (t.length >= 2 && PREFIX[t.charAt(0)] === 1) {
    var rest = t.slice(1)
    if (UNIT[rest] === 1 || UNIT2[rest] === 1) return true
  }
  if (UNIT2[t] === 1) return true
  return false
}

// 行内分式的两侧原子：括号组、数字（可带小数）、单个字母
var ATOM = '(?:\\([^()\\n]{1,40}\\)|\\d+(?:\\.\\d+)?|[A-Za-z])'
// 前面不能紧跟字母/数字/下划线/斜杠/冒号（挡 URL、日期、TCP/IP）；
// 后面不能紧跟数字/下划线/斜杠（挡 a/b/c、1/2/3）。字母留给下面按语境再判：
// "1/2mv²" 的 1/2 要认（分母后跟变量），"a/bc" 的 a/b 不认。
var RE_ATOM = new RegExp('(^|[^A-Za-z0-9_/:.])(' + ATOM + ')\\s?/\\s?(' + ATOM + ')(?![0-9_/])', 'g')

var MAX_EM_CHARS = 60

function isMathChar(c) {
  var code = c.charCodeAt(0)
  if (code >= 48 && code <= 57) return true
  if (code >= 65 && code <= 90) return true
  if (code >= 97 && code <= 122) return true
  if (code >= 0x2070 && code <= 0x209f) return true   // ⁰¹²… 上标 / ₀₁₂… 下标
  if (code >= 0x00b0 && code <= 0x00bf) return true   // ° ± · × ÷ ² ³ ¹
  if (code >= 0x03b1 && code <= 0x03c9) return true   // 希腊字母 α~ω
  return '+-*/^()., =<>≤≥√π∫'.indexOf(c) >= 0
}

function restoreVulgar(s) {
  var out = ''
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    out += (VULGAR[c] || c)
  }
  return out
}

function charEm(c) {
  var code = c.charCodeAt(0)
  if (code === 32) return 0.32
  if (code < 128) return 0.55
  if (code >= 0x2070 && code <= 0x209f) return 0.5
  return 1
}

function emWidth(s) {
  var w = 0
  for (var i = 0; i < (s || '').length; i++) w += charEm(s.charAt(i))
  return w
}

// 横线本身就表示分组，(a+b)/(c+d) 显示成 a+b 在上、c+d 在下更接近课本排版；
// 只有"整串被一对括号完整包住"时才剥，避免把 (x)(y) 剥坏
function stripOuter(s) {
  var t = String(s == null ? '' : s).replace(/^\s+|\s+$/g, '')
  if (t.length < 2 || t.charAt(0) !== '(' || t.charAt(t.length - 1) !== ')') return t
  var depth = 0
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i)
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0 && i < t.length - 1) return t   // 括号没包到最后，不剥
    }
  }
  if (depth !== 0) return t
  return t.slice(1, t.length - 1).replace(/^\s+|\s+$/g, '')
}

function barWidth(a, b) {
  var w = Math.max(emWidth(a), emWidth(b)) * 18 + 10
  if (w < 22) w = 22
  if (w > 240) w = 240
  return Math.round(w)
}

function makeFrac(num, den) {
  return { k: 'f', num: stripOuter(num), den: stripOuter(den), w: barWidth(num, den) }
}

// 整行是一个数学式，且只有一个顶层除号 → 整行竖排（图二那种）。
// 有等号时不做整行竖排：Eₖ=1/2mv² 该只把 1/2 竖起来，而不是整行变一个大分数。
function wholeLine(s) {
  var t = s.replace(/^\s+|\s+$/g, '')
  if (t.length < 3 || t.length > MAX_EM_CHARS) return null
  if (t.indexOf('=') >= 0) return null
  if (t.indexOf('√') >= 0) return null
  if (/[\u3400-\u9fff\uff00-\uffef]/.test(t)) return null   // 有中文/全角就不是纯数学行
  if (t.indexOf('://') >= 0) return null
  var depth = 0
  var idx = -1
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i)
    if (!isMathChar(c)) return null
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth < 0) return null }
    else if (c === '/' && depth === 0) {
      if (idx >= 0) return null      // 多个顶层除号：留给行内规则逐个处理
      idx = i
    }
  }
  if (depth !== 0 || idx <= 0 || idx >= t.length - 1) return null
  var num = t.slice(0, idx).replace(/\s+$/, '')
  var den = t.slice(idx + 1).replace(/^\s+/, '')
  if (!num || !den) return null
  var mathSignal = /[0-9]/.test(t) || /[+\-*^()]/.test(t) ||
    /(sin|cos|tan|cot|sec|csc|log|ln|lg|exp|lim|max|min|sqrt|arc)/i.test(t)
  // x/y 这种单字母对也认；其余没有数学信号的（TCP/IP 已被字符集挡掉）不认
  if (!mathSignal && !(/^[A-Za-z]$/.test(num) && /^[A-Za-z]$/.test(den))) return null
  // 单位量词：100km/h、60m/s —— 数字后面跟短字母、分母也是短字母，是速度写法
  if (/^\d+(?:\.\d+)?[A-Za-z]{1,4}$/.test(num) && /^[A-Za-z]{1,4}$/.test(den)) return null
  // 纯单位之比：m/s、N/m、J/K、m/s² —— 没有等号就是单位
  if (isUnitAtom(num) && isUnitAtom(den)) return null
  return { num: num, den: den }
}

// 矢量：\`F⃗\`（字母 + U+20D7 组合箭头）→ { k:'v', body:'F' }。
// 真机上 U+20D7 在 PuHuiTi 里没有字形，直接显示会成豆腐块（实测 F□），
// 所以页面用 column 布局自己画：字母上方放一个小号 →。
var VEC_RE = /([A-Za-zα-ωΑ-Ω])⃗/g

function splitVecs(s) {
  var segs = []
  var last = 0
  var m
  VEC_RE.lastIndex = 0
  while ((m = VEC_RE.exec(s)) !== null) {
    if (m.index > last) segs.push({ k: 't', s: s.slice(last, m.index) })
    segs.push({ k: 'v', body: m[1] })
    last = m.index + m[0].length
  }
  if (!segs.length) return [{ k: 't', s: s }]
  if (last < s.length) segs.push({ k: 't', s: s.slice(last) })
  return segs
}

// 根号：√(2gh) → { k:'r', body:'2gh' }，渲染成 √ 加上横线。
// 只认紧跟左括号的形式；根号内的内容不再解析（√(l/g) 里的 l/g 保持斜线，
// 一个 280px 宽的屏上不允许根号里再嵌竖排分式）。
function splitRadicals(s) {
  var segs = []
  var last = 0
  var i = 0
  while (i < s.length) {
    if (s.charAt(i) !== '√' || s.charAt(i + 1) !== '(') { i++; continue }
    var depth = 0
    var close = -1
    for (var k = i + 1; k < s.length; k++) {
      var c = s.charAt(k)
      if (c === '(') depth++
      else if (c === ')') { depth--; if (depth === 0) { close = k; break } }
    }
    if (close < 0) { i++; continue }
    if (i > last) segs.push({ k: 't', s: s.slice(last, i) })
    var body = s.slice(i + 2, close).replace(/^\s+|\s+$/g, '')
    // 顶线宽度按 17px 字号正好盖住被开方数（略加 8px 余量）；
    // 以前借用 barWidth（分式横线口径）偏宽，顶线伸出太多反而显得错乱
    var rw = Math.round(emWidth(body) * 17 + 8)
    if (rw < 20) rw = 20
    if (rw > 240) rw = 240
    segs.push({ k: 'r', body: body, w: rw })
    last = close + 1
    i = close + 1
  }
  if (last < s.length) segs.push({ k: 't', s: s.slice(last) })
  return segs
}

// 一段纯文本里的 a/b → 分式结构
function splitFracs(s) {
  var hasEq = s.indexOf('=') >= 0
  // 中文句子里的 "A/B 测试" 是术语，不是分数。但一旦句子里有等号，
  // 说明是公式语境（"速度 v=s/t"），单字母对也要竖排。
  var cjk = /[\u3400-\u9fff]/.test(s)
  var segs = []
  var last = 0
  var m
  RE_ATOM.lastIndex = 0
  while ((m = RE_ATOM.exec(s)) !== null) {
    var pre = m[1] || ''
    var start = m.index + pre.length
    var num = m[2]
    var den = m[3]
    var after = s.charAt(m.index + m[0].length)
    var bothDigit = /^\d+(?:\.\d+)?$/.test(num) && /^\d+(?:\.\d+)?$/.test(den)
    // 分母后面紧跟字母：1/2mv² 是分式，a/bc 不是
    if (after && /[A-Za-z]/.test(after) && !bothDigit) continue
    // 单字母对在中文语境里是术语（A/B 测试），除非整句是公式
    if (cjk && !hasEq && /^[A-Za-z]$/.test(num) && /^[A-Za-z]$/.test(den)) continue
    // 单位之比：m/s、km/h、N/m —— 但紧跟等号的是公式右边（a=F/m），必须转。
    // 按"紧邻"而不是"整行有等号"判断：'加速度 a=F/m 单位 m/s²' 里
    // 第一个是公式，第二个是单位。
    if (isUnitAtom(num) && isUnitAtom(den)) {
      var before = s.slice(0, start).replace(/\s+$/, '')
      if (before.charAt(before.length - 1) !== '=') continue
    }
    if (start > last) segs.push({ k: 't', s: s.slice(last, start) })
    segs.push(makeFrac(num, den))
    last = m.index + m[0].length
  }
  if (!segs.length) return null
  if (last < s.length) segs.push({ k: 't', s: s.slice(last) })
  return segs
}

/**
 * @param {string} text 一行文本
 * @returns {null|Array<{k:'t',s:string}|{k:'f',num:string,den:string,w:number}|{k:'r',body:string,w:number}>}
 */
export function parseFracLine(text) {
  var s = String(text == null ? '' : text)
  if (!s) return null
  // 必须先还原 ½ 这类字符：它们本身没有斜杠，还原后才是 a/b
  s = restoreVulgar(s)
  var hasRad = s.indexOf('√(') >= 0
  var hasVec = s.indexOf('⃗') >= 0
  if (s.indexOf('/') < 0 && !hasRad && !hasVec) return null

  // 整行纯分式（无等号、无根号、无矢量）
  if (!hasRad && !hasVec) {
    var whole = wholeLine(s)
    if (whole) return [makeFrac(whole.num, whole.den)]
  }

  // 三层切分：矢量 → 根号 → 分式
  var lvl1 = hasVec ? splitVecs(s) : [{ k: 't', s: s }]
  var out = []
  for (var i = 0; i < lvl1.length; i++) {
    var seg = lvl1[i]
    if (seg.k !== 't') { out.push(seg); continue }
    var lvl2 = seg.s.indexOf('√(') >= 0 ? splitRadicals(seg.s) : [seg]
    for (var k2 = 0; k2 < lvl2.length; k2++) {
      var seg2 = lvl2[k2]
      if (seg2.k !== 't') { out.push(seg2); continue }
      var sub = splitFracs(seg2.s)
      if (sub) out = out.concat(sub)
      else out.push(seg2)
    }
  }
  // 没有任何 f/r 段时返回 null：否则页面会给纯文本白套一层 flex 容器
  var hasStruct = false
  for (var j = 0; j < out.length; j++) {
    if (out[j].k === 'f' || out[j].k === 'r' || out[j].k === 'v') hasStruct = true
  }
  if (!hasStruct) return null
  // 纯空白段没有意义，去掉以免多出空 div
  return out.filter(function (x) { return x.k !== 't' || (x.s && x.s.replace(/\s/g, '')) })
}

export default { parseFracLine }
