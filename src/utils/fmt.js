// 文本美化：化学式下标、幂次上标、离子电荷、反应箭头、ASCII 图清理
//
// 背景：936×280 的笔屏上，模型输出的 "Al2(SO4)3"、"x^2" 读起来吃力；
// 它还会用 \ / | 画苯环，而 miniapp 的 text 是比例字体，ASCII 图必然错位成乱码。
// 这里的策略是：能转成 Unicode 上下标的就转（字体实测全覆盖），
// 画不了的 ASCII 图直接抹掉，靠文字说明代替。

var SLASH = String.fromCharCode(92)
var NL = String.fromCharCode(10)

var SUP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ',
  // Unicode modifier letters（真机验证 PuHuiTi 全覆盖，高位小字）
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ',
  'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ',
  'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ'
}
var SUB = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  // 拉丁下标字母（真机验证有字形：ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ；q/w/y/z 等 Unicode 无字形）
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ',
  'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ',
  'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
}

var ELEM_LIST = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni '
  + 'Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce '
  + 'Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra '
  + 'Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' ')
var ELEM = {}
for (var ei = 0; ei < ELEM_LIST.length; ei++) ELEM[ELEM_LIST[ei]] = 1

function mapAll(s, table) {
  var o = ''
  for (var i = 0; i < s.length; i++) {
    var c = table[s.charAt(i)]
    if (!c) return null
    o += c
  }
  return o
}

// ---------- 离子电荷：Fe3+ → Fe³⁺，OH- → OH⁻ ----------
// 有机物结构简式里的横线是化学键，不是负电荷：
//   -CHOH- / -CH2- / CH3CH2-（乙基）  vs  OH- / Cl- / CH3COO-（离子）
// 判据一：这个词本身以 - 或 = 开头 → 两端连接的写法，末尾横线是键
// 判据二：横线后面紧跟「基」字 → 取代基；跟「根 / 离」→ 离子
function fixIon(t) {
  t = t.replace(/([A-Z][a-z]?)([0-9]{0,1})([+-])(?![A-Za-z0-9])/g,
    function (m, el, num, sign, off) {
      if (!ELEM[el]) return m
      var p = off - 1
      while (p >= 0) {
        var c = t.charAt(p)
        if (c === ' ' || c === '\n' || c === '\t' || c.charCodeAt(0) > 0x2e80) break
        p--
      }
      var head = t.charAt(p + 1)
      if (head === '-' || head === '=') return m
      // 聚合物重复单元 [-CH2-CH2-]n：横线后面紧跟右括号/右方括号，是键不是电荷
      var afterSign = t.charAt(off + m.length)
      if (afterSign === ']' || afterSign === ')' || afterSign === '}') return m
      var tail = t.slice(off + m.length).replace(/^[ \t]+/, '')
      if (tail.charAt(0) === '基') return m
      var sup = num ? mapAll(num, SUP) : ''
      if (sup === null) return m
      return el + sup + SUP[sign]
    })
  // 配离子：[Cu(NH3)4]2+ → ]²⁺、[Fe(CN)6]3- → ]³⁻
  t = t.replace(/\](\d{0,1})([+-])(?![A-Za-z0-9])/g, function (m, num2, sign2) {
    var s2 = num2 ? mapAll(num2, SUP) : ''
    if (s2 === null) return m
    return ']' + s2 + SUP[sign2]
  })
  return t
}

// ---------- 幂次：x^2 → x²，x^(n+1) → x⁽ⁿ⁺¹⁾ ----------
// 化学里 c(H^+) / K^+ 这种写法很常见，单独处理 ^+ 与 ^-
function fixChargeCaret(t) {
  return t.replace(/\^\+/g, '⁺').replace(/\^-(?![0-9])/g, '⁻')
}

function fixPower(t) {
  var out = ''
  var i = 0
  while (i < t.length) {
    var ch = t.charAt(i)
    if (ch !== '^') { out += ch; i++; continue }
    var j = i + 1
    var body = null
    var next = j
    var open = t.charAt(j)
    if (open === '{' || open === '(') {
      var close = open === '{' ? '}' : ')'
      var depth = 0
      for (var k = j; k < t.length; k++) {
        var c = t.charAt(k)
        if (c === open) depth++
        else if (c === close) {
          depth--
          // 保留外括号：x^(n+1)→x⁽ⁿ⁺¹⁾，否则会与 xⁿ+1 混淆
          if (depth === 0) {
            // 纯数字指数直接转上标：10^{8} → 10⁸（加括号会变成 10⁽⁸⁾，物理里到处都是）
            var inner = t.slice(j + 1, k)
            body = /^[0-9]+$/.test(inner) ? inner : '(' + inner + ')'
            next = k + 1
            break
          }
        }
      }
      if (body === null) { out += ch; i++; continue }
    } else {
      // 指数只能是一个整体：-1、2、n、n1；不能把 x^2-5x 里的 -5 也吞进来
      var m = /^(-[0-9]+|[0-9]+|[a-zA-Z][a-zA-Z0-9]*)/.exec(t.slice(j))
      if (!m) { out += ch; i++; continue }
      body = m[0]
      next = j + body.length
    }
    var sup = mapAll(body, SUP)
    if (sup === null) { out += '^' + body } else { out += sup }
    i = next
  }
  return out
}

// ---------- 化学式：H2O → H₂O，Al2(SO4)3 → Al₂(SO₄)₃ ----------
function parseFormula(m, inParen) {
  var i = 0
  var out = ''
  var hasDigit = false
  var units = 0
  while (i < m.length) {
    var c = m.charAt(i)
    if (c === '(') {
      var depth = 0
      var k = i
      var inner = ''
      for (; k < m.length; k++) {
        var cc = m.charAt(k)
        if (cc === '(') {
          depth++
          if (depth === 1) continue
        } else if (cc === ')') {
          depth--
          if (depth === 0) break
        }
        inner += cc
      }
      if (depth !== 0) return null
      // 括号内允许没有数字（OH、SO4 里 OH 无数字）
      var sub = parseFormula(inner, true)
      if (!sub) return null
      out += '(' + sub + ')'
      i = k + 1
      var num0 = ''
      while (i < m.length && m.charAt(i) >= '0' && m.charAt(i) <= '9') { num0 += m.charAt(i); i++ }
      if (num0) {
        var s0 = mapAll(num0, SUB)
        if (s0 === null) return null
        out += s0
        hasDigit = true
      }
      units++
      continue
    }
    if (c < 'A' || c > 'Z') return null
    var sym = c
    var nx = m.charAt(i + 1)
    if (nx >= 'a' && nx <= 'z') sym += nx
    if (!ELEM[sym]) return null
    out += sym
    i += sym.length
    var num = ''
    while (i < m.length && m.charAt(i) >= '0' && m.charAt(i) <= '9') { num += m.charAt(i); i++ }
    if (num) {
      var s1 = mapAll(num, SUB)
      if (s1 === null) return null
      out += s1
      hasDigit = true
    }
    units++
  }
  if (!hasDigit && !inParen) return null
  if (units < 1) return null
  return out
}

function fixFormula(t) {
  return t.replace(/[A-Z][A-Za-z0-9()]*/g, function (m, off) {
    if (m.length < 2) return m
    var before = off > 0 ? t.charAt(off - 1) : ''
    if (before >= 'A' && before <= 'z') return m
    var after = t.charAt(off + m.length)
    if (after >= 'A' && after <= 'z') return m
    if (!/[0-9]/.test(m)) return m
    // 行内 SMILES 的环闭合数字不是下标（C1=CC=CC=C1 改了就复制不出来）
    var ts = off
    while (ts > 0 && !TOK_SEP.test(t.charAt(ts - 1))) ts--
    var te = off
    while (te < t.length && !TOK_SEP.test(t.charAt(te))) te++
    if (looksSmilesToken(t.slice(ts, te))) return m
    var r = parseFormula(m, false)
    if (r) return r
    // 形如 H2SO4(浓) 的写法：候选串会吞掉后面那个左括号，去掉再试一次
    // 形如 (C6H10O5)n 的写法：正则从 C 起算，会吞掉右括号和聚合度 n
    var cut = m
    while (cut.length > 1) {
      var tail2 = cut.charAt(cut.length - 1)
      if (tail2 === '(' || tail2 === ')') { cut = cut.slice(0, cut.length - 1); continue }
      if (tail2 === 'n' && cut.charAt(cut.length - 2) === ')') { cut = cut.slice(0, cut.length - 1); continue }
      break
    }
    if (cut !== m) {
      var r2 = parseFormula(cut, false)
      if (r2) return r2 + m.slice(cut.length)
    }
    return m
  })
}

// ---------- 箭头 ----------
function fixArrow(t) {
  var s = t
  s = s.split('<->').join('↔')
  s = s.split('<=>').join('⇌')
  s = s.split('-->').join('→')
  s = s.split('->').join('→')
  s = s.split('<-').join('←')
  return s
}

// ---------- ASCII 结构图清理 ----------
// 模型画的苯环长这样：每行 10~15 个字符，含 \ / |，没有汉字。
// 比例字体下必然错位，直接抹掉换成一句说明。
var ART_OK = /^[ A-Za-z0-9()\[\]{}<>+\-=_*.:;,'"\/|^~`\\]+$/

function looksLikeArt(s) {
  if (!s) return false
  if (s.length > 26) return false
  if (/[\u4e00-\u9fa5\uff00-\uffef]/.test(s)) return false
  // |x|、|-2| 这类绝对值：竖线紧贴字母/数字，不是画图的竖线
  if (/\|[A-Za-z0-9(]/.test(s) || /[A-Za-z0-9)]\|/.test(s)) return false
  return ART_OK.test(s)
}

function countMarks(s) {
  var n = 0
  if (s.indexOf(SLASH) >= 0) n++
  if (s.indexOf('/') >= 0) n++
  if (s.indexOf('|') >= 0) n++
  if (s.indexOf('_') >= 0) n++
  return n
}

function stripArt(t) {
  var lines = t.split(NL)
  var out = []
  var i = 0
  while (i < lines.length) {
    if (!looksLikeArt(lines[i])) { out.push(lines[i]); i++; continue }
    var j = i
    var block = []
    while (j < lines.length && (looksLikeArt(lines[j]) || lines[j].replace(/\s/g, '') === '')) {
      block.push(lines[j])
      j++
    }
    while (block.length && block[block.length - 1].replace(/\s/g, '') === '') {
      block.pop()
      j--
    }
    var solid = 0
    var marked = 0
    for (var k = 0; k < block.length; k++) {
      if (!block[k].replace(/\s/g, '')) continue
      solid++
      if (countMarks(block[k]) > 0) marked++
    }
    if (solid >= 3 && marked >= 2) {
      out.push('〔结构示意图略，见下方文字说明〕')
      i = j
      continue
    }
    out.push(lines[i])
    i++
  }
  return out.join(NL)
}

// ---------- LaTeX 残留命令：提示词已禁 LaTeX，但模型偶尔仍会漏出 ----------
// 只转"无歧义"的：绝对值定界符、希腊字母、常见数学符号。分数/根式交给 stripCommands。
var MATH_CMDS = {
  'left|': '|', 'right|': '|', 'left(': '(', 'right)': ')', 'left[': '[', 'right]': ']',
  'left.': '', 'right.': '',
  'partial': '∂', 'infty': '∞', 'nabla': '∇', 'cdot': '·', 'times': '×', 'div': '÷',
  'pm': '±', 'mp': '∓', 'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥',
  'neq': '≠', 'ne': '≠', 'approx': '≈', 'equiv': '≡', 'sim': '∼', 'propto': '∝',
  'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'Delta': 'Δ',
  'theta': 'θ', 'lambda': 'λ', 'mu': 'μ', 'pi': 'π', 'rho': 'ρ', 'sigma': 'σ',
  'Sigma': 'Σ', 'omega': 'ω', 'Omega': 'Ω', 'phi': 'φ', 'Phi': 'Φ',
  'prime': '′', 'angle': '∠', 'perp': '⊥', 'parallel': '∥', 'degree': '°',
  'to': '→', 'rightarrow': '→', 'Rightarrow': '⇒', 'leftrightarrow': '↔',
  'sum': '∑', 'prod': '∏', 'int': '∫', 'lim': 'lim', 'log': 'log', 'ln': 'ln',
  'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'cot': 'cot'
}

function fixMath(t) {
  if (t.indexOf(SLASH) < 0) return t
  var out = ''
  var i = 0
  while (i < t.length) {
    var ch = t.charAt(i)
    if (ch !== SLASH) { out += ch; i++; continue }
    // 尝试匹配最长命令（先 2~10 字符）
    var matched = null
    for (var len = 10; len >= 1; len--) {
      var seg = t.substr(i + 1, len)
      if (MATH_CMDS[seg] !== undefined && MATH_CMDS.hasOwnProperty(seg)) {
        matched = seg
        break
      }
    }
    if (matched === null) { out += ch; i++; continue }
    // 纯字母命令才需要"后跟字母说明被截断"检查（\le 是 \left 的前缀）；
    // 含定界符的命令（right|、left( 等）后面的字母是正文，直接接受
    if (/^[a-zA-Z]+$/.test(matched)) {
      var after2 = t.charAt(i + 1 + matched.length)
      if ((after2 >= 'a' && after2 <= 'z') || (after2 >= 'A' && after2 <= 'Z')) { out += ch; i++; continue }
    }
    out += MATH_CMDS[matched]
    i += 1 + matched.length
  }
  return out
}

// ---------- 上标电荷：CO3^2- → CO₃²⁻（只认离子方程式语境，x²-5x 的减号不碰） ----------
function fixSupCharge(t) {
  return t.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹])-(?=\s|[+=→⇌]|\)|$)/g, '$1⁻')
}

// ---------- 变量/物理量下标：v1→v₁、t0→t₀、x2→x₂、log2→log₂ ----------
// 化学式（H2O→H₂O）由 fixFormula 先处理，这里只补数学/物理单字母变量。
// 保护：后跟数字（多位数 v12）、小数点（版本号 v1.0）、斜杠、字母（a1b）都不转。
var TOK_SEP = /[\s，。、；：！？""''《》【】]/

// 行内 SMILES 不是变量：c1ccccc1、C1=CC=CC=C1、[C@@H] 这些数字是环闭合编号，
// 改成下标就再也复制不出来，也让化学老师看不懂
function looksSmilesToken(tok) {
  if (!tok) return false
  // @ # \ 不会出现在任何化学式里，只可能是 SMILES
  if (/[@#\\]/.test(tok)) return true
  // 芳香小写原子开头（c/n/o/s/p）+ 环闭合数字
  if (/^[cnosp]/.test(tok) && /[0-9]/.test(tok)) return true
  // 全碳骨架且不带 H 的等号式（C1=CC=CC=C1）是 SMILES；
  // 带 H 的 CH2=CH2 是结构简式，必须照常转下标
  if (tok.indexOf('=') >= 0 && tok.indexOf('H') < 0) return true
  return false
}

function fixVarSub(t) {
  return t.replace(/([a-zA-Z])([0-9])(?![0-9])/g, function (m, letter, digit, off, whole) {
    var after = whole.charAt(off + m.length)
    if (after === '.' || after === '/' || after === '-') return m
    if ((after >= 'a' && after <= 'z') || (after >= 'A' && after <= 'Z')) return m
    var s = off
    while (s > 0 && !TOK_SEP.test(whole.charAt(s - 1))) s--
    var e = off
    while (e < whole.length && !TOK_SEP.test(whole.charAt(e))) e++
    if (looksSmilesToken(whole.slice(s, e))) return m
    return letter + SUB[digit]
  })
}

// ---------- 杂化轨道：sp3 → sp³（是上标，不是下标） ----------
function fixHybrid(t) {
  return t.replace(/(^|[^a-zA-Z])sp([23])(?![0-9a-zA-Z])/g, function (m, pre, n) {
    return pre + 'sp' + SUP[n]
  })
}

// ---------- 对数底数：log_10 100 → log₁₀ 100；log_a(b) → logₐ(b) ----------
// 只认显式下划线写法，避免把 "logic" 里的 log 误伤。
function fixLogBase(t) {
  return t.replace(/log_([0-9]{1,2}|[a-z])(?![0-9a-zA-Z])/g, function (m, base) {
    var s = ''
    for (var i = 0; i < base.length; i++) {
      var c = base.charAt(i)
      if (!SUB[c]) return m
      s += SUB[c]
    }
    return 'log' + s
  })
}

// ---------- 横写数字分数 → Unicode 分数（½⅓⅔…，仅查表内；10/21 等无字形不转） ----------
var VULGAR = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
  '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞'
}

function fixVulgar(t) {
  return t.replace(/(^|[^\dA-Za-z])(\d{1,2})\/(\d{1,2})(?![\dA-Za-z])/g,
    function (m, pre, a, b) {
      var v = VULGAR[a + '/' + b]
      return v ? pre + v : m
    })
}

// ---------- 组合 ----------
export function beautify(t) {
  t = fixChargeCaret(t)
  if (!t) return t
  var s = String(t)
  s = fixMath(s)
  s = fixIon(s)
  s = fixPower(s)
  s = fixSupCharge(s)
  s = fixFormula(s)
  s = fixHybrid(s)
  s = fixVarSub(s)
  s = fixLogBase(s)
  s = fixVulgar(s)
  s = fixArrow(s)
  s = stripArt(s)
  return s
}
