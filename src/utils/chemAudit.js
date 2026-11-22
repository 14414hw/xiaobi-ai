/* 结构式化学审计（2026-11-21）
 *
 * 边界先说清楚：这里不做"证明结构正确"，只做三件能判定的事——
 *   1) 价态/芳香性是否自洽（mol.js 的 inspectSmiles 已给出 issues）
 *   2) 模型声明的分子式是否与结构算出来的一致
 *   3) 中文名里的官能团关键词是否能在结构里找到
 * 任何一条不通过都只做"标记"，不擅自改图；名称命中结构库时以库为准。
 *
 * 之所以能这样做的前提：这台设备没有化学引擎，但高中题目的官能团种类有限，
 * 关键词 + 子结构匹配足以抓住"苯酚画成苯甲醛""乙酸乙酯画成乙酸"这类硬伤。
 */
import { lookupMol, normName } from './molLib.js'

// ---------------- 分子式 ----------------

var SUB = '₀₁₂₃₄₅₆₇₈₉'

// 只认真实元素符号，避免把 "COX" 这类缩写当成分子式
// 2026-11-21：元素表与 mol.js 的 ELEM 对齐。旧表只收了 26 种元素，含 Cr、Co、
// Ni、Sn 等的分子式（重铬酸铵、配合物）会被判为非法 → 校验收不到这类分子式，
// 模型写错也发现不了。
var ELEM_SET = {}
;(function () {
  var list = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
    'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn').split(' ')
  for (var i = 0; i < list.length; i++) ELEM_SET[list[i]] = 1
})()

/** 统一全角下标、去空格、去结晶水，输出 Hill 序分子式；非法返回 '' */
export function normalizeFormula(s) {
  var t = String(s || '')
  var out = ''
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i)
    var idx = SUB.indexOf(ch)
    out += idx >= 0 ? String(idx) : ch
  }
  out = out.replace(/[\s\u3000]/g, '')
  out = out.split('·')[0].split('•')[0]
  if (!/^(?:[A-Z][a-z]?\d*)+$/.test(out)) return ''
  var cnt = {}
  var re = /([A-Z][a-z]?)(\d*)/g
  var m
  while ((m = re.exec(out))) {
    var n = m[2] ? parseInt(m[2], 10) : 1
    if (!n || n > 999) return ''
    if (!ELEM_SET[m[1]]) return ''
    cnt[m[1]] = (cnt[m[1]] || 0) + n
  }
  var parts = []
  if (cnt.C) parts.push('C' + (cnt.C > 1 ? cnt.C : ''))
  if (cnt.H) parts.push('H' + (cnt.H > 1 ? cnt.H : ''))
  var rest = []
  for (var k in cnt) if (k !== 'C' && k !== 'H') rest.push(k)
  rest.sort()
  for (var j = 0; j < rest.length; j++) {
    parts.push(rest[j] + (cnt[rest[j]] > 1 ? cnt[rest[j]] : ''))
  }
  return parts.join('')
}

// ---------------- 图上的小工具 ----------------

function orderOf(g, bi) {
  return (g.order && g.order[bi] !== undefined) ? g.order[bi] : g.bonds[bi].order
}

function orderBetween(g, a, b) {
  var nb = g.atoms[a].nbr
  for (var i = 0; i < nb.length; i++) if (nb[i].to === b) return orderOf(g, nb[i].bond)
  return 0
}

function hasAromaticRing(g) {
  for (var r = 0; r < g.rings.length; r++) {
    var ring = g.rings[r]
    var all = true
    for (var k = 0; k < ring.atoms.length; k++) {
      if (!g.atoms[ring.atoms[k]].arom) { all = false; break }
    }
    if (all) return true
  }
  return false
}

function isCarbonylC(g, i) {
  var a = g.atoms[i]
  if (a.sym !== 'C') return false
  for (var k = 0; k < a.nbr.length; k++) {
    if (g.atoms[a.nbr[k].to].sym === 'O' && orderOf(g, a.nbr[k].bond) === 2) return true
  }
  return false
}

function hasCarboxyl(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    if (!isCarbonylC(g, i)) continue
    var a = g.atoms[i]
    for (var k = 0; k < a.nbr.length; k++) {
      var o = a.nbr[k].to
      if (g.atoms[o].sym === 'O' && orderOf(g, a.nbr[k].bond) === 1 && !hasCarbonNeighbor(g, o)) return true
    }
  }
  return false
}

function hasCarbonNeighbor(g, i) {
  var a = g.atoms[i]
  for (var k = 0; k < a.nbr.length; k++) if (g.atoms[a.nbr[k].to].sym === 'C') return true
  return false
}

function hasEster(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    if (!isCarbonylC(g, i)) continue
    var a = g.atoms[i]
    for (var k = 0; k < a.nbr.length; k++) {
      var o = a.nbr[k].to
      if (g.atoms[o].sym === 'O' && orderOf(g, a.nbr[k].bond) === 1 && hasCarbonNeighbor(g, o)) return true
    }
  }
  return false
}

function hasAldehyde(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    if (!isCarbonylC(g, i)) continue
    var a = g.atoms[i]
    if (a.h >= 1) return true
    for (var k = 0; k < a.nbr.length; k++) if (g.atoms[a.nbr[k].to].sym === 'H') return true
  }
  return false
}

function hasKetone(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    if (!isCarbonylC(g, i)) continue
    var n = 0
    var a = g.atoms[i]
    for (var k = 0; k < a.nbr.length; k++) if (g.atoms[a.nbr[k].to].sym === 'C') n++
    if (n >= 2) return true
  }
  return false
}

function hasAlcohol(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym !== 'C' || isCarbonylC(g, i)) continue
    for (var k = 0; k < a.nbr.length; k++) {
      var o = g.atoms[a.nbr[k].to]
      if (o.sym === 'O' && orderOf(g, a.nbr[k].bond) === 1 && (o.h >= 1 || o.charge < 0)) return true
    }
  }
  return false
}

function hasPhenol(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym !== 'C' || !a.arom) continue
    for (var k = 0; k < a.nbr.length; k++) {
      var o = g.atoms[a.nbr[k].to]
      if (o.sym === 'O' && orderOf(g, a.nbr[k].bond) === 1 && (o.h >= 1 || o.charge < 0)) return true
    }
  }
  return false
}

function hasAmide(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    if (!isCarbonylC(g, i)) continue
    var a = g.atoms[i]
    for (var k = 0; k < a.nbr.length; k++) {
      if (g.atoms[a.nbr[k].to].sym === 'N') return true
    }
  }
  return false
}

function hasAmine(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym !== 'N' || a.charge > 0) continue
    var c = 0
    var nearCarbonyl = false
    for (var k = 0; k < a.nbr.length; k++) {
      var nb = a.nbr[k].to
      if (g.atoms[nb].sym === 'C') {
        c++
        if (isCarbonylC(g, nb)) nearCarbonyl = true
      }
    }
    if (c > 0 && !nearCarbonyl) return true
  }
  return false
}

function hasNitro(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym !== 'N') continue
    var o = 0
    for (var k = 0; k < a.nbr.length; k++) if (g.atoms[a.nbr[k].to].sym === 'O') o++
    if (o >= 2) return true
  }
  return false
}

function hasSulfonic(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym !== 'S') continue
    var dbl = 0
    var singleO = false
    for (var k = 0; k < a.nbr.length; k++) {
      var o = g.atoms[a.nbr[k].to]
      if (o.sym !== 'O') continue
      if (orderOf(g, a.nbr[k].bond) === 2) dbl++
      else singleO = true
    }
    if (dbl >= 2 && singleO) return true
  }
  return false
}

function hasBond(g, s1, s2, ord) {
  for (var b = 0; b < g.bonds.length; b++) {
    var bd = g.bonds[b]
    if (bd.order === 1.5) continue
    var o = orderOf(g, b)
    if (o !== ord) continue
    var a = g.atoms[bd.a].sym
    var b2 = g.atoms[bd.b].sym
    if ((a === s1 && b2 === s2) || (a === s2 && b2 === s1)) return true
  }
  return false
}

function hasHalogen(g, sym) {
  for (var i = 0; i < g.atoms.length; i++) if (g.atoms[i].sym === sym) return true
  return false
}

// 烯醇片段 C=C-OH（非芳香）：酮-烯醇互变的烯醇式。
// 苯酚的 O-C 是芳香键不算；维生素C 的烯醇是真实结构，只有名称规则用到它。
function hasEnol(g) {
  for (var i = 0; i < g.atoms.length; i++) {
    var o = g.atoms[i]
    if (o.sym !== 'O' || o.h < 1 || o.charge) continue
    for (var k = 0; k < o.nbr.length; k++) {
      var bi = o.nbr[k].bond
      if (orderOf(g, bi) !== 1) continue
      var c = g.atoms[o.nbr[k].to]
      if (c.sym !== 'C' || c.arom) continue
      for (var m = 0; m < c.nbr.length; m++) {
        var nb = c.nbr[m]
        if (nb.to === o.nbr[k].to) continue
        var cc = g.atoms[nb.to]
        if (cc.sym === 'C' && !cc.arom && orderOf(g, nb.bond) === 2) return true
      }
    }
  }
  return false
}

// ---------------- 名称 → 官能团 ----------------

var NAME_RULES = [
  { re: /酚/, fn: hasPhenol, msg: '名称含「酚」，但结构里没有芳香环上的羟基' },
  { re: /酰胺/, fn: hasAmide, msg: '名称含「酰胺」，但结构里没有 C(=O)-N' },
  { re: /酯/, fn: hasEster, msg: '名称含「酯」，但结构里没有酯基 C(=O)-O-C' },
  { re: /醛/, fn: hasAldehyde, msg: '名称含「醛」，但结构里没有醛基 CHO' },
  { re: /酮/, fn: hasKetone, msg: '名称含「酮」，但结构里没有羰基 C=O（连两个碳）' },
  { re: /醇/, fn: hasAlcohol, msg: '名称含「醇」，但结构里没有醇羟基' },
  { re: /胺/, fn: hasAmine, msg: '名称含「胺」，但结构里没有氨基' },
  { re: /硝基/, fn: hasNitro, msg: '名称含「硝基」，但结构里没有 -NO2' },
  { re: /磺酸/, fn: hasSulfonic, msg: '名称含「磺酸」，但结构里没有 -SO3H' },
  { re: /苯|芳环|芳香/, fn: hasAromaticRing, msg: '名称含苯/芳环，但结构里没有芳香环' },
  { re: /烯醇/, fn: hasEnol, msg: '名称含「烯醇」，但结构里没有 C=C-OH 烯醇片段' },
  { re: /烯/, fn: function (g) { return hasBond(g, 'C', 'C', 2) }, msg: '名称含「烯」，但结构里没有 C=C' },
  { re: /炔/, fn: function (g) { return hasBond(g, 'C', 'C', 3) }, msg: '名称含「炔」，但结构里没有 C≡C' }
]

function nameChecks(g, name) {
  var out = []
  var n = String(name || '')
  if (!n) return out
  for (var i = 0; i < NAME_RULES.length; i++) {
    var r = NAME_RULES[i]
    if (!r.re.test(n)) continue
    if (!r.fn(g)) out.push(r.msg)
  }
  // 羧酸单独判：排除无机酸和磺酸，避免「苯磺酸」被要求有羧基
  if (/酸$/.test(n) && !/磺酸|硫酸|硝酸|碳酸|磷酸|盐酸|氢硫酸/.test(n)) {
    if (!hasCarboxyl(g)) out.push('名称含「酸」，但结构里没有羧基 COOH')
  }
  if (/氯/.test(n) && !hasHalogen(g, 'Cl')) out.push('名称含「氯」，但结构里没有 Cl')
  if (/溴/.test(n) && !hasHalogen(g, 'Br')) out.push('名称含「溴」，但结构里没有 Br')
  if (/碘/.test(n) && !hasHalogen(g, 'I')) out.push('名称含「碘」，但结构里没有 I')
  if (/氟/.test(n) && !hasHalogen(g, 'F')) out.push('名称含「氟」，但结构里没有 F')
  if (/环/.test(n) && !/苯环|芳环|芳香/.test(n) && !g.rings.length) {
    out.push('名称含「环」，但结构里没有环')
  }
  return out
}

// ---------------- 对外入口 ----------------

function addUnique(arr, msg) {
  if (!msg) return
  for (var i = 0; i < arr.length; i++) if (arr[i] === msg) return
  arr.push(msg)
}

/**
 * 汇总一次结构图的所有可判定问题。
 * @param {object} info molInfo() 的返回（含 formula/issues/graph）
 * @param {string} label 中文名（可能为空）
 * @param {string} stated 模型声明的分子式（可能为空）
 * @param {boolean} fromLib 是否来自结构库（库命中时跳过名称规则，库本身可信）
 */
export function auditMolecule(info, label, stated, fromLib) {
  var issues = []
  if (!info) return { ok: false, issues: ['结构无法解析'], formula: '' }
  var own = info.issues || []
  for (var i = 0; i < own.length; i++) addUnique(issues, own[i])

  var f = info.formula || ''
  var sf = normalizeFormula(stated)
  if (sf && f && sf !== f) {
    addUnique(issues, '分子式不一致：给出 ' + stated + '，按结构算是 ' + f)
  }
  if (!fromLib && info.graph && label) {
    var nc = nameChecks(info.graph, label)
    for (var j = 0; j < nc.length; j++) addUnique(issues, nc[j])
  }
  return {
    ok: issues.length === 0,
    issues: issues,
    formula: f,
    stated: sf
  }
}

export { nameChecks }
