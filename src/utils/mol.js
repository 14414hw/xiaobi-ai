/* PenAI 分子结构式渲染：SMILES 子集 → SVG
 *
 * 覆盖：直链、支链、单环、稠环（共边）、螺环、双键、叁键、芳香环、
 *       杂原子、形式电荷、末端 CH₃
 * 不支持：立体构型细节、配位化合物（金属配位）、聚合物
 *
 * 设计：先把分子摆成图（layout），产出"图元列表"（线段/圆/文字），
 *       再序列化成 SVG。图元列表可直接交给别的渲染器做预览。
 */

import { GLYPHS } from './glyphs.js'

var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
var SUBS = '₀₁₂₃₄₅₆₇₈₉'
var SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
var SUB_SCALE = 0.62
var LABEL_SPAN = 0.62
var PAD = 0.28

var VAL = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 }

var ELEM = {}
;(function () {
  var list = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
    'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn').split(' ')
  for (var i = 0; i < list.length; i++) ELEM[list[i]] = 1
})()

var METAL = {
  Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Mg: 1, Ca: 1, Sr: 1, Ba: 1, Al: 1,
  Fe: 1, Cu: 1, Zn: 1, Ag: 1, Pt: 1, Pd: 1, Ni: 1, Co: 1, Mn: 1, Cr: 1,
  Ti: 1, Sn: 1, Pb: 1, Hg: 1, Au: 1, Ir: 1, Rh: 1, Ru: 1, Os: 1, Mo: 1, W: 1, V: 1
}

// ---------------- base64（QuickJS 无 btoa） ----------------

function utf8Bytes(str) {
  var s = String(str)
  var out = ''
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c < 0x80) out += String.fromCharCode(c)
    else if (c < 0x800) {
      out += String.fromCharCode(0xc0 | (c >> 6))
      out += String.fromCharCode(0x80 | (c & 0x3f))
    } else {
      out += String.fromCharCode(0xe0 | (c >> 12))
      out += String.fromCharCode(0x80 | ((c >> 6) & 0x3f))
      out += String.fromCharCode(0x80 | (c & 0x3f))
    }
  }
  return out
}

export function b64(str) {
  var s = utf8Bytes(str)
  var out = ''
  var i = 0
  for (; i + 2 < s.length; i += 3) {
    var n = (s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8) | s.charCodeAt(i + 2)
    out += B64C.charAt((n >> 18) & 63) + B64C.charAt((n >> 12) & 63) +
      B64C.charAt((n >> 6) & 63) + B64C.charAt(n & 63)
  }
  var rest = s.length - i
  if (rest === 1) {
    var a = s.charCodeAt(i) << 16
    out += B64C.charAt((a >> 18) & 63) + B64C.charAt((a >> 12) & 63) + '=='
  } else if (rest === 2) {
    var b = (s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8)
    out += B64C.charAt((b >> 18) & 63) + B64C.charAt((b >> 12) & 63) +
      B64C.charAt((b >> 6) & 63) + '='
  }
  return out
}

// ---------------- SMILES 解析 ----------------

function parseSmiles(input) {
  var s = String(input || '').replace(/[\\/]/g, '')
  var atoms = []
  var bonds = []
  var ringOpen = {}
  var stack = []
  var prev = -1
  var pend = 0
  var i = 0

  function addBond(a, b, order, closure) {
    bonds.push({ a: a, b: b, order: order, closure: !!closure })
    var bi = bonds.length - 1
    atoms[a].nbr.push({ to: b, bond: bi })
    atoms[b].nbr.push({ to: a, bond: bi })
  }

  function push(atom) {
    atom.nbr = []
    atom.idx = atoms.length
    atoms.push(atom)
    if (prev >= 0) {
      var order = pend
      if (!order) order = (atoms[prev].arom && atom.arom) ? 1.5 : 1
      addBond(prev, atom.idx, order, false)
    }
    pend = 0
    prev = atom.idx
  }

  function closeRing(key) {
    if (prev < 0) return false
    var r = ringOpen[key]
    if (!r) {
      ringOpen[key] = { atom: prev, order: pend }
      pend = 0
      return true
    }
    var order = pend || r.order
    if (!order) order = (atoms[r.atom].arom && atoms[prev].arom) ? 1.5 : 1
    addBond(r.atom, prev, order, true)
    delete ringOpen[key]
    pend = 0
    return true
  }

  while (i < s.length) {
    var c = s.charAt(i)

    if (c === '(') { stack.push(prev); i++; continue }
    if (c === ')') {
      if (!stack.length) return null
      prev = stack.pop()
      i++
      continue
    }
    if (c === '-' || c === '=' || c === '#' || c === ':' || c === '~') {
      pend = c === '=' ? 2 : c === '#' ? 3 : c === ':' ? 1.5 : 1
      i++
      continue
    }
    if (c === '.') { prev = -1; i++; continue }
    if (c === '%') {
      if (!closeRing(s.substr(i + 1, 2))) return null
      i += 3
      continue
    }
    if (c >= '0' && c <= '9') {
      if (!closeRing(c)) return null
      i++
      continue
    }

    if (c === '[') {
      var j = i + 1
      // 同位素质量数（[13C] 的 13）：以前直接跳过，现在保留用于左上角标注
      var iso = 0
      while (j < s.length && s.charAt(j) >= '0' && s.charAt(j) <= '9') {
        iso = iso * 10 + (s.charCodeAt(j) - 48)
        j++
      }
      var sym = ''
      var arom = false
      var c1 = s.charAt(j)
      if (!c1) return null
      if (c1 >= 'a' && c1 <= 'z') {
        arom = true
        sym = c1.toUpperCase()
        j++
      } else {
        var two = s.substr(j, 2)
        if (ELEM[two]) { sym = two; j += 2 } else { sym = c1; j++ }
      }
      // 手性标记 @ / @@：解析存档，渲染成实楔/虚楔（不计算 CIP，教学场景够用）
      var chir = 0
      while (j < s.length && s.charAt(j) === '@') { chir++; j++ }
      var hcnt = 0
      if (s.charAt(j) === 'H') {
        j++
        var hn = ''
        while (j < s.length && s.charAt(j) >= '0' && s.charAt(j) <= '9') { hn += s.charAt(j); j++ }
        hcnt = hn ? parseInt(hn, 10) : 1
      }
      var charge = 0
      var cs = s.charAt(j)
      if (cs === '+' || cs === '-') {
        var sign = cs === '+' ? 1 : -1
        j++
        var cn = ''
        while (j < s.length && s.charAt(j) >= '0' && s.charAt(j) <= '9') { cn += s.charAt(j); j++ }
        if (cn) charge = sign * parseInt(cn, 10)
        else {
          charge = sign
          while (j < s.length && s.charAt(j) === cs) { charge += sign; j++ }
        }
      }
      while (j < s.length && s.charAt(j) !== ']') j++
      if (j >= s.length) return null
      i = j + 1
      if (!ELEM[sym]) return null
      push({ sym: sym, arom: arom, h: hcnt, charge: charge, bracket: true, iso: iso, chir: chir })
      continue
    }

    // 聚合物重复端点（*CC* 的星号）：当普通原子连接，渲染画星号
    if (c === '*') {
      push({ sym: '*', arom: false, h: 0, charge: 0, bracket: false })
      i++
      continue
    }

    var pair = s.substr(i, 2)
    if (pair === 'Cl' || pair === 'Br') {
      push({ sym: pair, arom: false, h: 0, charge: 0, bracket: false })
      i += 2
      continue
    }
    if ('BCNOPSFI'.indexOf(c) >= 0) {
      push({ sym: c, arom: false, h: 0, charge: 0, bracket: false })
      i++
      continue
    }
    if ('bcnops'.indexOf(c) >= 0) {
      push({ sym: c.toUpperCase(), arom: true, h: 0, charge: 0, bracket: false })
      i++
      continue
    }
    return null
  }

  if (!atoms.length) return null

  for (var kk in ringOpen) return null

  for (var m = 0; m < atoms.length; m++) {
    var a = atoms[m]
    a.deg = a.nbr.length
    if (a.bracket) continue
    var v = VAL[a.sym]
    if (!v) { a.h = 0; continue }
    var bs = 0
    for (var q = 0; q < a.nbr.length; q++) {
      var o = bonds[a.nbr[q].bond].order
      bs += o === 1.5 ? 1.5 : o
    }
    var h = Math.round(v - bs)
    // 2026-11-21：以前这里把负数/超价悄悄夹成 0~4，等于把"化学上不可能"
    // 抹平成正常结构。现在只夹用于绘制的值，同时记 badH，交给 audit 报警。
    // 芳香杂原子（呋喃的 o、噻吩的 s）两条 1.5 键会被算成 3，这是记法问题
    // 不是超价，跳过它们，等 Kekulé 化后用真实单双键审计。
    if (h < 0) { if (!a.arom && a.sym !== 'S' && a.sym !== 'P') a.badH = true; h = 0 }
    if (h > 4) { a.badH = true; h = 4 }
    a.h = h
  }

  return { atoms: atoms, bonds: bonds }
}

// ---------------- 环识别 ----------------

function shortestPath(g, a, b, skipBond) {
  var prev = {}
  var seen = {}
  var q = [a]
  seen[a] = 1
  prev[a] = -1
  while (q.length) {
    var cur = q.shift()
    if (cur === b) break
    var nb = g.atoms[cur].nbr
    for (var k = 0; k < nb.length; k++) {
      if (nb[k].bond === skipBond) continue
      var to = nb[k].to
      if (seen[to]) continue
      seen[to] = 1
      prev[to] = cur
      q.push(to)
    }
  }
  if (!seen[b]) return null
  var path = []
  var c = b
  var guard = 0
  while (c !== -1 && guard++ < 200) {
    path.unshift(c)
    c = prev[c]
  }
  return path
}

function bondBetween(g, a, b) {
  var nb = g.atoms[a].nbr
  for (var k = 0; k < nb.length; k++) if (nb[k].to === b) return nb[k].bond
  return -1
}

function findRings(g) {
  var rings = []
  var seen = {}
  // 对每根键求"包含它的最小环"。只看闭环键会漏掉稠环的另一半
  // （萘的两个闭环键可能落在同一个环上）
  for (var k = 0; k < g.bonds.length; k++) {
    var bd = g.bonds[k]
    var path = shortestPath(g, bd.a, bd.b, k)
    if (!path || path.length < 3 || path.length > 16) continue
    var key = path.slice().sort(function (x, y) { return x - y }).join(',')
    if (seen[key]) continue
    seen[key] = 1
    var bl = []
    for (var m = 0; m + 1 < path.length; m++) bl.push(bondBetween(g, path[m], path[m + 1]))
    bl.push(bondBetween(g, path[path.length - 1], path[0]))
    var ok = true
    for (var n = 0; n < bl.length; n++) if (bl[n] < 0) ok = false
    if (!ok) continue
    rings.push({ atoms: path, bonds: bl })
  }
  return rings
}

// ---------------- 布局 ----------------

function setP(pos, idx, x, y) {
  pos[idx] = { x: x, y: y }
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function placeRingFree(pos, ring, cx, cy) {
  var n = ring.atoms.length
  var R = 1 / (2 * Math.sin(Math.PI / n))
  var a0 = -Math.PI / 2
  for (var k = 0; k < n; k++) {
    var ang = a0 + k * 2 * Math.PI / n
    setP(pos, ring.atoms[k], cx + R * Math.cos(ang), cy + R * Math.sin(ang))
  }
}

function tryPlaceRingEdge(pos, ring, ia, ib, side) {
  var n = ring.atoms.length
  var pa = pos[ring.atoms[ia]]
  var pb = pos[ring.atoms[ib]]
  if (!pa || !pb) return null
  var dx = pb.x - pa.x
  var dy = pb.y - pa.y
  var len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) return null
  var mx = (pa.x + pb.x) / 2
  var my = (pa.y + pb.y) / 2
  var nx = -dy / len * side
  var ny = dx / len * side
  var R = len / (2 * Math.sin(Math.PI / n))
  var ap = R * Math.cos(Math.PI / n)
  var cx = mx + nx * ap
  var cy = my + ny * ap
  var a0 = Math.atan2(pa.y - cy, pa.x - cx)
  var a1 = Math.atan2(pb.y - cy, pb.x - cx)
  var step = 2 * Math.PI / n
  var d = normAngle(a1 - a0)
  if (Math.abs(Math.abs(d) - step) > step * 0.45) return null
  var dir = d > 0 ? 1 : -1
  var out = []
  for (var k = 0; k < n; k++) {
    var idx = ring.atoms[(ia + k) % n]
    var ang = a0 + dir * k * step
    out.push({ idx: idx, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) })
  }
  return out
}

function scoreCand(pos, cand) {
  var min = 99
  for (var i = 0; i < pos.length; i++) {
    if (!pos[i]) continue
    for (var k = 0; k < cand.length; k++) {
      if (cand[k].idx === i) continue
      var dx = pos[i].x - cand[k].x
      var dy = pos[i].y - cand[k].y
      var d = Math.sqrt(dx * dx + dy * dy)
      if (d < min) min = d
    }
  }
  return min
}

/* 环与已放置部分之间只有一根单键（联苯、二苯甲酮这类），
 * 用锚原子把环挂上去：环的一个顶点落在键的末端，中心沿键轴外推 R。 */
function attachRingByBond(g, pos, ring) {
  var n = ring.atoms.length
  var anchor = null
  for (var k = 0; k < n && !anchor; k++) {
    var idx = ring.atoms[k]
    var nb = g.atoms[idx].nbr
    for (var m = 0; m < nb.length; m++) {
      var other = nb[m].to
      if (pos[other] && ring.atoms.indexOf(other) < 0) {
        anchor = { vi: k, from: other }
        break
      }
    }
  }
  if (!anchor) { placeRingFree(pos, ring, 0, 0); return }

  var q = pos[anchor.from]
  var dirs = []
  var nb2 = g.atoms[anchor.from].nbr
  for (var j = 0; j < nb2.length; j++) {
    if (!pos[nb2[j].to]) continue
    var vx = pos[nb2[j].to].x - q.x
    var vy = pos[nb2[j].to].y - q.y
    var l = Math.sqrt(vx * vx + vy * vy) || 1
    dirs.push({ x: vx / l, y: vy / l })
  }

  var cand = []
  if (dirs.length === 1) {
    cand.push(rot(dirs[0].x, dirs[0].y, 120))
    cand.push(rot(dirs[0].x, dirs[0].y, -120))
    cand.push(rot(dirs[0].x, dirs[0].y, 180))
  } else if (dirs.length >= 2) {
    var sx = 0, sy = 0
    for (var d = 0; d < dirs.length; d++) { sx += dirs[d].x; sy += dirs[d].y }
    var sl = Math.sqrt(sx * sx + sy * sy)
    var b = sl > 0.05 ? { x: -sx / sl, y: -sy / sl } : rot(dirs[0].x, dirs[0].y, 90)
    cand.push(b)
    cand.push(rot(b.x, b.y, 60))
    cand.push(rot(b.x, b.y, -60))
  } else {
    cand.push({ x: 1, y: 0 })
    cand.push({ x: -1, y: 0 })
  }

  var R = 1 / (2 * Math.sin(Math.PI / n))
  var best = null
  var bestScore = -1e9
  for (var c = 0; c < cand.length; c++) {
    var vx2 = q.x + cand[c].x
    var vy2 = q.y + cand[c].y
    var cx2 = vx2 + cand[c].x * R
    var cy2 = vy2 + cand[c].y * R
    var ang0 = Math.atan2(vy2 - cy2, vx2 - cx2)
    var set = []
    var minD = 99
    for (var k2 = 0; k2 < n; k2++) {
      var ang = ang0 + k2 * 2 * Math.PI / n
      var px = cx2 + R * Math.cos(ang)
      var py = cy2 + R * Math.sin(ang)
      set.push({ idx: ring.atoms[(anchor.vi + k2) % n], x: px, y: py })
      for (var i2 = 0; i2 < pos.length; i2++) {
        if (!pos[i2]) continue
        if (ring.atoms.indexOf(i2) >= 0) continue
        var dx = pos[i2].x - px
        var dy = pos[i2].y - py
        var dd = Math.sqrt(dx * dx + dy * dy)
        if (dd < minD) minD = dd
      }
    }
    if (minD > bestScore) { bestScore = minD; best = set }
    if (bestScore > 0.95) break
  }
  if (!best) { placeRingFree(pos, ring, 0, 0); return }
  for (var e = 0; e < best.length; e++) setP(pos, best[e].idx, best[e].x, best[e].y)
}

function attachRing(g, pos, ring) {
  var n = ring.atoms.length
  var fixed = []
  for (var k = 0; k < n; k++) if (pos[ring.atoms[k]]) fixed.push(k)

  if (fixed.length === 0) {
    attachRingByBond(g, pos, ring)
    return
  }

  if (fixed.length >= 2) {
    var ia = -1
    var ib = -1
    for (var a1 = 0; a1 < n; a1++) {
      for (var b1 = 0; b1 < n; b1++) {
        if (fixed.indexOf(a1) >= 0 && fixed.indexOf(b1) >= 0 && (a1 + 1) % n === b1) {
          ia = a1
          ib = b1
          break
        }
      }
      if (ia >= 0) break
    }
    if (ia < 0) { ia = fixed[0]; ib = fixed[1] }
    var best = null
    var bestScore = -1e9
    for (var s = -1; s <= 1; s += 2) {
      var cand = tryPlaceRingEdge(pos, ring, ia, ib, s)
      if (!cand) continue
      var sc = scoreCand(pos, cand)
      if (sc > bestScore) { bestScore = sc; best = cand }
    }
    if (best) {
      for (var q = 0; q < best.length; q++) setP(pos, best[q].idx, best[q].x, best[q].y)
      return
    }
  }

  // 螺环 / 兜底：绕共用原子找空位
  var anchorIdx = ring.atoms[fixed[0]]
  var anchor = pos[anchorIdx]
  var R2 = 1 / (2 * Math.sin(Math.PI / n))
  var best2 = null
  var bestScore2 = -1e9
  for (var t = 0; t < 16; t++) {
    var ang0 = t * Math.PI / 8
    var cx2 = anchor.x + R2 * Math.cos(ang0)
    var cy2 = anchor.y + R2 * Math.sin(ang0)
    var cand2 = []
    var phi = Math.atan2(anchor.y - cy2, anchor.x - cx2)
    for (var k2 = 0; k2 < n; k2++) {
      var idx2 = ring.atoms[(fixed[0] + k2) % n]
      var ang = phi + k2 * 2 * Math.PI / n
      cand2.push({ idx: idx2, x: cx2 + R2 * Math.cos(ang), y: cy2 + R2 * Math.sin(ang) })
    }
    var sc2 = scoreCand(pos, cand2)
    if (sc2 > bestScore2) { bestScore2 = sc2; best2 = cand2 }
  }
  if (best2) for (var q2 = 0; q2 < best2.length; q2++) setP(pos, best2[q2].idx, best2[q2].x, best2[q2].y)
}

function clearance(pos, x, y) {
  var min = 99
  for (var i = 0; i < pos.length; i++) {
    if (!pos[i]) continue
    var dx = pos[i].x - x
    var dy = pos[i].y - y
    var d = Math.sqrt(dx * dx + dy * dy)
    if (d < min) min = d
  }
  return min
}

function rot(dx, dy, deg) {
  var r = deg * Math.PI / 180
  var c = Math.cos(r)
  var s = Math.sin(r)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

function ringsOf(g, ringOf) {
  var set = []
  var seen = {}
  for (var i = 0; i < g.atoms.length; i++) {
    var r = ringOf ? ringOf[i] : undefined
    if (r === undefined || seen[r]) continue
    seen[r] = 1
    set.push(g.rings[r])
  }
  return set
}

function segDist(px, py, ax, ay, bx, by) {
  var vx = bx - ax
  var vy = by - ay
  var wx = px - ax
  var wy = py - ay
  var L2 = vx * vx + vy * vy
  var t = L2 > 0 ? (wx * vx + wy * vy) / L2 : 0
  if (t < 0) t = 0
  if (t > 1) t = 1
  var dx = px - (ax + vx * t)
  var dy = py - (ay + vy * t)
  return Math.sqrt(dx * dx + dy * dy)
}

function inPoly(pts, x, y) {
  var inside = false
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i].x
    var yi = pts[i].y
    var xj = pts[j].x
    var yj = pts[j].y
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/* 候选点撞到环内部、或贴着已有键，都要重罚——(点位, 环列表) */
function ringPenalty(g, pos, rings, x, y) {
  var pen = 0
  for (var r = 0; r < rings.length; r++) {
    var ra = rings[r].atoms
    var pts = []
    var ok = true
    for (var k = 0; k < ra.length; k++) {
      if (!pos[ra[k]]) { ok = false; break }
      pts.push(pos[ra[k]])
    }
    if (!ok) continue
    if (inPoly(pts, x, y)) pen += 1.5
    // 贴着环边也算撞
    for (var m = 0; m < pts.length; m++) {
      var a = pts[m]
      var b = pts[(m + 1) % pts.length]
      var d = segDist(x, y, a.x, a.y, b.x, b.y)
      if (d < 0.66) pen += (0.66 - d) * 2.0
    }
  }
  return pen
}

/* p 与 q 之间那条键的键级；找不到按单键算 */
function bondOrder(g, p, q) {
  for (var i = 0; i < g.bonds.length; i++) {
    var bd = g.bonds[i]
    if ((bd.a === p && bd.b === q) || (bd.a === q && bd.b === p)) return bd.order || 1
  }
  return 1
}

/* 在 p 已定位的前提下，把邻居 q 放出去；sg 控制锯齿方向
   拥挤中心（季碳、三取代氮）允许把键拉长，否则标签会压在一起 */
function placeSingle(g, pos, p, q, sg, inRing) {
  var nb = g.atoms[p].nbr
  var dirs = []
  for (var k = 0; k < nb.length; k++) {
    var r = nb[k].to
    if (r === q || !pos[r]) continue
    var vx = pos[r].x - pos[p].x
    var vy = pos[r].y - pos[p].y
    var l = Math.sqrt(vx * vx + vy * vy) || 1
    dirs.push({ x: vx / l, y: vy / l })
  }
  var cand = []
  if (dirs.length === 1) {
    var base = dirs[0]
    cand.push(rot(base.x, base.y, 120 * sg))
    cand.push(rot(base.x, base.y, -120 * sg))
    // 180° 只有双键/叁键才合理（乙炔、CO2）；单键拉直会把乙醇画成一根棍子
    var opp = rot(base.x, base.y, 180)
    opp.pen = bondOrder(g, p, q) >= 2 ? 0 : 1.2
    cand.push(opp)
    var p90a = rot(base.x, base.y, 90 * sg)
    p90a.pen = 0.35
    cand.push(p90a)
    var p90b = rot(base.x, base.y, -90 * sg)
    p90b.pen = 0.35
    cand.push(p90b)
  } else if (dirs.length >= 2) {
    var sx = 0
    var sy = 0
    for (var d2 = 0; d2 < dirs.length; d2++) { sx += dirs[d2].x; sy += dirs[d2].y }
    var sl = Math.sqrt(sx * sx + sy * sy)
    var b2 = sl > 0.05 ? { x: -sx / sl, y: -sy / sl } : rot(dirs[0].x, dirs[0].y, 90)
    cand.push(b2)
    cand.push(rot(b2.x, b2.y, 60))
    cand.push(rot(b2.x, b2.y, -60))
    cand.push(rot(b2.x, b2.y, 120))
    cand.push(rot(b2.x, b2.y, -120))
    cand.push(rot(b2.x, b2.y, 180))
  } else {
    cand.push({ x: 1, y: 0 })
    cand.push(rot(1, 0, 60))
    cand.push(rot(1, 0, -60))
  }

  // q 自己带标签（CH3/OH/NH2…）时，跟邻居的标签要留出字宽
  var qLab = atomLabel(g.atoms[q]).length > 0
  var best = null
  var bestC = -1e9
  var radii = [1, 1.26, 1.52]
  for (var ri = 0; ri < radii.length; ri++) {
    var rad = radii[ri]
    for (var c2 = 0; c2 < cand.length; c2++) {
      var px = pos[p].x + cand[c2].x * rad
      var py = pos[p].y + cand[c2].y * rad
      // 只跟「不是父原子」的已定位原子比距离
      var near = 99
      for (var t = 0; t < pos.length; t++) {
        if (t === p || !pos[t]) continue
        var ddx = pos[t].x - px
        var ddy = pos[t].y - py
        var dd = Math.sqrt(ddx * ddx + ddy * ddy)
        if (qLab && atomLabel(g.atoms[t]).length > 0) dd -= LABEL_SPAN
        if (dd < near) near = dd
      }
      if (near > 1.35) near = 1.35
      var sc = near - (rad - 1) * 0.55
      // 键角惩罚：直线单键、直角都要让位给 120° 锯齿
      sc -= (cand[c2].pen || 0)
      // 不许钻进环里、不许贴到别人的键上
      sc -= ringPenalty(g, pos, ringsOf(g, inRing), px, py)
      for (var bi2 = 0; bi2 < g.bonds.length; bi2++) {
        var bd2 = g.bonds[bi2]
        if (bd2.a === p || bd2.b === p) continue
        var pa2 = pos[bd2.a]
        var pb2 = pos[bd2.b]
        if (!pa2 || !pb2) continue
        var sd2 = segDist(px, py, pa2.x, pa2.y, pb2.x, pb2.y)
        if (sd2 < 0.60) sc -= (0.60 - sd2) * 2.2
      }
      if (sc > bestC) { bestC = sc; best = { x: px, y: py } }
    }
  }
  setP(pos, q, best.x, best.y)
}

function components(g) {
  var seen = {}
  var out = []
  for (var i = 0; i < g.atoms.length; i++) {
    if (seen[i]) continue
    var comp = []
    var q = [i]
    seen[i] = 1
    while (q.length) {
      var cur = q.shift()
      comp.push(cur)
      var nb = g.atoms[cur].nbr
      for (var k = 0; k < nb.length; k++) {
        if (!seen[nb[k].to]) { seen[nb[k].to] = 1; q.push(nb[k].to) }
      }
    }
    out.push(comp)
  }
  return out
}

function bounds(pos, comp) {
  var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9
  var any = false
  for (var i = 0; i < pos.length; i++) {
    if (!pos[i]) continue
    if (comp && comp.indexOf(i) < 0) continue
    any = true
    if (pos[i].x < minx) minx = pos[i].x
    if (pos[i].x > maxx) maxx = pos[i].x
    if (pos[i].y < miny) miny = pos[i].y
    if (pos[i].y > maxy) maxy = pos[i].y
  }
  if (!any) return { minx: 0, miny: 0, maxx: 0, maxy: 0, w: 1, h: 1 }
  return { minx: minx, miny: miny, maxx: maxx, maxy: maxy, w: maxx - minx, h: maxy - miny }
}

/* 环系规范化朝向：把环系的长轴转成水平。
   萘/蒽/菲/甾体这类稠环，逐环贴上去时落位角度取决于第一只环的顶点方向，
   经常整块斜 30° 画成"楼梯"，明明几何没错但看着不正规。
   旋转角吸附到 30° 的整数倍——六边形顶点本来就在这个格子上，吸附不引入畸变。 */
function canonicalize(g, pos, comp) {
  var inComp = {}
  for (var i = 0; i < comp.length; i++) inComp[comp[i]] = 1

  // 只用环上的原子求主轴：胆固醇的长尾会被整个分子的包围盒带偏
  var pts = []
  var seen = {}
  for (var r = 0; r < g.rings.length; r++) {
    var ra = g.rings[r].atoms
    var hit = false
    for (var k = 0; k < ra.length; k++) if (inComp[ra[k]]) { hit = true; break }
    if (!hit) continue
    for (var k2 = 0; k2 < ra.length; k2++) {
      var a = ra[k2]
      if (seen[a] || !pos[a]) continue
      seen[a] = 1
      pts.push(pos[a])
    }
  }
  if (pts.length < 6) return

  var cx = 0, cy = 0
  for (var p = 0; p < pts.length; p++) { cx += pts[p].x; cy += pts[p].y }
  cx /= pts.length
  cy /= pts.length

  var sxx = 0, syy = 0, sxy = 0
  for (var q = 0; q < pts.length; q++) {
    var dx = pts[q].x - cx
    var dy = pts[q].y - cy
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  // 各向同性（单个正六边形）没有长轴，保持顶点朝上
  if (Math.abs(sxy) < 1e-6 && Math.abs(sxx - syy) < 1e-6) return

  var rot = -0.5 * Math.atan2(2 * sxy, sxx - syy)
  var grid = Math.PI / 6
  var snap = Math.round(rot / grid) * grid
  // 离 30° 格子超过 8° 说明不是六边形晶格系，只按主轴摆平，不硬吸
  if (Math.abs(snap - rot) > 8 * Math.PI / 180) snap = rot
  if (Math.abs(snap) < 1e-4) return

  var ca = Math.cos(snap)
  var sa = Math.sin(snap)
  for (var m = 0; m < comp.length; m++) {
    var pp = pos[comp[m]]
    if (!pp) continue
    var vx = pp.x - cx
    var vy = pp.y - cy
    pp.x = cx + vx * ca - vy * sa
    pp.y = cy + vx * sa + vy * ca
  }
}

/* 两条线段严格相交（共享端点、共线重叠都不算） */
function segInt(p1, p2, p3, p4) {
  var d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (Math.abs(d) < 1e-9) return false
  var t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  var u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

/* 整张图的"难看程度"：键交叉最重，其次是非键原子挤在一起，最后轻微惩罚膨胀。
   扭转优化只比较这个数，不做真正的能量最小化（QuickJS 上不划算）。 */
function layoutCost(g, pos) {
  var cost = 0
  var n = g.atoms.length

  for (var i = 0; i < n; i++) {
    if (!pos[i]) continue
    for (var j = i + 1; j < n; j++) {
      if (!pos[j]) continue
      var bonded = false
      var nb = g.atoms[i].nbr
      for (var k = 0; k < nb.length; k++) if (nb[k].to === j) { bonded = true; break }
      if (bonded) continue
      var dx = pos[i].x - pos[j].x
      var dy = pos[i].y - pos[j].y
      var d = Math.sqrt(dx * dx + dy * dy)
      if (d < 1.05) cost += (1.05 - d) * 14
    }
  }

  var lines = []
  for (var b = 0; b < g.bonds.length; b++) {
    var pa = pos[g.bonds[b].a]
    var pb = pos[g.bonds[b].b]
    if (pa && pb) lines.push({ a: g.bonds[b].a, b: g.bonds[b].b, p1: pa, p2: pb })
  }
  for (var m = 0; m < lines.length; m++) {
    for (var q = m + 1; q < lines.length; q++) {
      var A = lines[m]
      var B = lines[q]
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue
      if (segInt(A.p1, A.p2, B.p1, B.p2)) cost += 12
    }
  }

  // 非环原子掉进环内：从环上原子出发的取代基会"合法地"伸进环里
  // （这条键与环共用端点，交叉检测抓不到），必须单独罚。
  for (var r = 0; r < g.rings.length; r++) {
    var ra = g.rings[r].atoms
    var poly = []
    var ok = true
    for (var pk = 0; pk < ra.length; pk++) {
      if (!pos[ra[pk]]) { ok = false; break }
      poly.push(pos[ra[pk]])
    }
    if (!ok || poly.length < 3) continue
    for (var a2 = 0; a2 < n; a2++) {
      if (!pos[a2]) continue
      if (ra.indexOf(a2) >= 0) continue
      if (inPoly(poly, pos[a2].x, pos[a2].y)) cost += 8
    }
  }

  var bb = bounds(pos, null)
  cost += (bb.w + bb.h) * 0.01
  return cost
}

/* 可旋转单键：不能是环内键（转了会把环拉变形），两端得不是一个原子 */
function rotatableBonds(g) {
  var inRing = {}
  for (var r = 0; r < g.rings.length; r++) {
    var rb = g.rings[r].bonds
    for (var k = 0; k < rb.length; k++) inRing[rb[k]] = 1
  }
  var out = []
  for (var b = 0; b < g.bonds.length; b++) {
    if (inRing[b]) continue
    if (g.bonds[b].order !== 1) continue
    out.push(b)
  }
  return out
}

/* 断开 a-b 后 b 一侧的原子集合（跨环键不会出现在这里，rotatableBonds 已排除） */
function subtree(g, from, block) {
  var out = []
  var seen = {}
  var q = [from]
  seen[from] = 1
  while (q.length) {
    var cur = q.shift()
    out.push(cur)
    var nb = g.atoms[cur].nbr
    for (var k = 0; k < nb.length; k++) {
      var t = nb[k].to
      if (t === block || seen[t]) continue
      seen[t] = 1
      q.push(t)
    }
  }
  return out
}

/* 离散扭转优化：绕锚原子把一侧片段整体旋转，12 个角度里挑代价最小的。
   四苯甲烷在 2D 里 4×120° 摆不下，四只苯环必然互相压住；靠这一步把它们掰开。
   旋转是刚体变换，键长和片段内部几何都不变。 */
var TORSION_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]

function optimizeTorsions(g, pos) {
  var rot = rotatableBonds(g)
  if (!rot.length) return
  var base = layoutCost(g, pos)

  for (var pass = 0; pass < 3; pass++) {
    var improved = false
    for (var k = 0; k < rot.length; k++) {
      var bd = g.bonds[rot[k]]
      var frag = subtree(g, bd.b, bd.a)
      if (frag.length < 2) continue
      var px = pos[bd.a].x
      var py = pos[bd.a].y
      var orig = []
      for (var f = 0; f < frag.length; f++) {
        orig.push({ x: pos[frag[f]].x, y: pos[frag[f]].y })
      }

      var applyAngle = function (deg) {
        var rad = deg * Math.PI / 180
        var ca = Math.cos(rad)
        var sa = Math.sin(rad)
        for (var m = 0; m < frag.length; m++) {
          var vx = orig[m].x - px
          var vy = orig[m].y - py
          pos[frag[m]].x = px + vx * ca - vy * sa
          pos[frag[m]].y = py + vx * sa + vy * ca
        }
      }

      var bestAng = 0
      var bestCost = base
      for (var a = 1; a < TORSION_ANGLES.length; a++) {
        applyAngle(TORSION_ANGLES[a])
        var c = layoutCost(g, pos)
        // 必须"明显变好"才转：纯粹为缩包围盒的微幅旋转会把乙酰基、羟甲基
        // 折到环边上去，看着比原来更乱
        if (c < bestCost - 0.8) {
          bestCost = c
          bestAng = TORSION_ANGLES[a]
        }
      }
      applyAngle(bestAng)
      if (bestAng !== 0) {
        base = bestCost
        improved = true
      }
    }
    if (!improved) break
  }
}

function layout(g) {
  var n = g.atoms.length
  var pos = new Array(n)
  for (var i = 0; i < n; i++) pos[i] = null

  // 原子 → 所属环
  var ringOf = {}
  for (var r0 = 0; r0 < g.rings.length; r0++) {
    var ra0 = g.rings[r0].atoms
    for (var k0 = 0; k0 < ra0.length; k0++) if (ringOf[ra0[k0]] === undefined) ringOf[ra0[k0]] = r0
  }

  var comps = components(g)
  var laid = []
  for (var ci = 0; ci < comps.length; ci++) {
    var comp = comps[ci]
    var inComp = {}
    for (var k = 0; k < comp.length; k++) inComp[comp[k]] = 1

    // 组件内最大的环作起点
    var firstRing = -1
    var bestLen = 0
    for (var ri = 0; ri < g.rings.length; ri++) {
      var rr = g.rings[ri]
      if (!inComp[rr.atoms[0]]) continue
      if (rr.atoms.length > bestLen) { bestLen = rr.atoms.length; firstRing = ri }
    }

    var cpos = new Array(n)
    for (var m = 0; m < n; m++) cpos[m] = null
    var ringUsed = {}
    var sign = {}
    var queue = []

    if (firstRing >= 0) {
      placeRingFree(cpos, g.rings[firstRing], 0, 0)
      ringUsed[firstRing] = 1
      var fa = g.rings[firstRing].atoms
      for (var f = 0; f < fa.length; f++) { sign[fa[f]] = 1; queue.push(fa[f]) }
    } else {
      setP(cpos, comp[0], 0, 0)
      sign[comp[0]] = 1
      queue.push(comp[0])
    }

    // 沿分子图逐原子推进：正常原子走锯齿，遇到未放置的环就整环贴上去
    var guard = 0
    while (queue.length && guard++ < 4000) {
      var p = queue.shift()
      var nb = g.atoms[p].nbr
      for (var e = 0; e < nb.length; e++) {
        var q = nb[e].to
        if (!inComp[q] || cpos[q]) continue
        var ri2 = ringOf[q]
        if (ri2 !== undefined && !ringUsed[ri2]) {
          attachRing(g, cpos, g.rings[ri2])
          ringUsed[ri2] = 1
          var ra2 = g.rings[ri2].atoms
          for (var k2 = 0; k2 < ra2.length; k2++) {
            if (cpos[ra2[k2]] && sign[ra2[k2]] === undefined) {
              sign[ra2[k2]] = 1
              queue.push(ra2[k2])
            }
          }
        } else {
          var sg = sign[p] || 1
          placeSingle(g, cpos, p, q, -sg, ringOf)
          sign[q] = -sg
          queue.push(q)
        }
      }
    }

    var bb = bounds(cpos, comp)
    laid.push({ comp: comp, cpos: cpos, bb: bb })
  }

  // 多组分排版（盐/水合物/离子对）：组件横向排；总宽超过最大高的 3.2 倍
  // 时折行（如 乙酸钠+Na++3H2O 横着一字排会把每个组分挤成邮票大）。
  // 行内组件按各自高度垂直居中，行间距固定 1.0 键长。
  var GAP = 1.15
  var totalW = 0
  var maxH = 0
  for (var li = 0; li < laid.length; li++) {
    totalW += laid[li].bb.w
    if (laid[li].bb.h > maxH) maxH = laid[li].bb.h
  }
  var rows = [[]]
  var rowW = 0
  var limit = laid.length > 1 ? maxH * 3.2 : 1e9
  for (var lk = 0; lk < laid.length; lk++) {
    var it = laid[lk]
    var cur = rows[rows.length - 1]
    var addW = cur.length ? GAP + it.bb.w : it.bb.w
    if (cur.length && rowW + addW > limit) { rows.push([it]); rowW = it.bb.w }
    else { cur.push(it); rowW += addW }
  }
  var yOffset = 0
  for (var lr = 0; lr < rows.length; lr++) {
    var row = rows[lr]
    var rowH = 0
    for (var lh = 0; lh < row.length; lh++) if (row[lh].bb.h > rowH) rowH = row[lh].bb.h
    var xOffset = 0
    for (var lc = 0; lc < row.length; lc++) {
      var it2 = row[lc]
      var dx = xOffset - it2.bb.minx
      var dy = yOffset + (rowH - it2.bb.h) / 2 - it2.bb.miny
      for (var q3 = 0; q3 < it2.comp.length; q3++) {
        var pp2 = it2.cpos[it2.comp[q3]]
        if (!pp2) continue
        pos[it2.comp[q3]] = { x: pp2.x + dx, y: pp2.y + dy }
      }
      xOffset += it2.bb.w + GAP
    }
    yOffset += rowH + 1.0
  }

  relax(g, pos, ringOf)

  // 摆平环系（必须在 relax 之后：松弛会把整体挪动，先摆平再松弛就白摆了）
  for (var ci2 = 0; ci2 < comps.length; ci2++) canonicalize(g, pos, comps[ci2])

  // 扭转优化：把挤在一起的取代基/芳环掰开（四苯甲烷这类）
  optimizeTorsions(g, pos)

  var all = bounds(pos, null)
  var mid = (all.miny + all.maxy) / 2
  for (var z = 0; z < n; z++) if (pos[z]) pos[z].y -= mid

  // 竖长的分子（长链、联苯）在笔上不如横着放省地方，整体转 90°
  if (all.h > all.w * 1.45) {
    for (var w2 = 0; w2 < n; w2++) {
      if (!pos[w2]) continue
      var px = pos[w2].x
      var py = pos[w2].y
      pos[w2].x = -py
      pos[w2].y = px
    }
  }

  return pos
}

/* 布局后松弛：环原子锁死，其余原子按「键长回弹 + 非键斥力」迭代，
   把标签挤在一起、键压到环上的情况自动推开 */
function relax(g, pos, ringOf) {
  var n = g.atoms.length
  var fixed = new Array(n)
  for (var i = 0; i < n; i++) fixed[i] = (pos[i] && ringOf[i] !== undefined) ? 1 : 0

  // 每个原子的「占地半径」：带标签的更大，且按标签字数算
  // （CH3 比 OH 宽得多，统一 0.78 会让甲基的边角压到键上）
  var rad = new Array(n)
  for (var r0 = 0; r0 < n; r0++) {
    if (!pos[r0]) { rad[r0] = 0; continue }
    var lb0 = atomLabel(g.atoms[r0])
    rad[r0] = lb0.length ? (0.34 + 0.16 * lb0.length) : 0.56
  }

  var ITER = 90
  for (var it = 0; it < ITER; it++) {
    var disp = []
    for (var a = 0; a < n; a++) disp.push({ x: 0, y: 0 })
    var moved = false

    // 斥力
    for (var u = 0; u < n; u++) {
      if (!pos[u]) continue
      for (var v = u + 1; v < n; v++) {
        if (!pos[v]) continue
        var dx = pos[u].x - pos[v].x
        var dy = pos[u].y - pos[v].y
        var d = Math.sqrt(dx * dx + dy * dy)
        if (d < 0.001) { dx = 0.01 * (u + 1); dy = 0.01; d = 0.02 }
        var need = rad[u] + rad[v]
        if (d >= need) continue
        var push = (need - d) * 0.5
        var ux = dx / d
        var uy = dy / d
        if (!fixed[u]) { disp[u].x += ux * push; disp[u].y += uy * push; moved = true }
        if (!fixed[v]) { disp[v].x -= ux * push; disp[v].y -= uy * push; moved = true }
      }
    }

    // 键长回弹
    for (var b = 0; b < g.bonds.length; b++) {
      var bd = g.bonds[b]
      var pa = pos[bd.a]
      var pb = pos[bd.b]
      if (!pa || !pb) continue
      var bx = pb.x - pa.x
      var by = pb.y - pa.y
      var bl = Math.sqrt(bx * bx + by * by)
      if (bl < 0.001) continue
      // 环内键本来就准，别动
      if (fixed[bd.a] && fixed[bd.b]) continue
      // 端点带标签的键稍微拉长，标签才不会贴到环或相邻键上
      var ideal = (rad[bd.a] > 0.6 || rad[bd.b] > 0.6) ? 1.18 : 1.0
      var err = bl - ideal
      var k = 0.5
      var mx = (bx / bl) * err * k
      var my = (by / bl) * err * k
      if (!fixed[bd.a] && !fixed[bd.b]) {
        disp[bd.a].x += mx; disp[bd.a].y += my
        disp[bd.b].x -= mx; disp[bd.b].y -= my
      } else if (!fixed[bd.a]) {
        disp[bd.a].x += mx * 2; disp[bd.a].y += my * 2
      } else {
        disp[bd.b].x -= mx * 2; disp[bd.b].y -= my * 2
      }
      moved = true
    }

    // 标签避让：带标签的可动原子别压在**别的**键上。
    // 胆固醇的角甲基 CH3 就经常压在 B/C 环的键上，字和线糊成一团。
    for (var lu = 0; lu < n; lu++) {
      if (!pos[lu] || fixed[lu] || rad[lu] < 0.7) continue
      for (var lb = 0; lb < g.bonds.length; lb++) {
        var lbd = g.bonds[lb]
        if (lbd.a === lu || lbd.b === lu) continue
        var lA = pos[lbd.a]
        var lB = pos[lbd.b]
        if (!lA || !lB) continue
        var lvx = lB.x - lA.x
        var lvy = lB.y - lA.y
        var ll2 = lvx * lvx + lvy * lvy
        if (ll2 < 1e-6) continue
        var lt = ((pos[lu].x - lA.x) * lvx + (pos[lu].y - lA.y) * lvy) / ll2
        if (lt < 0.08 || lt > 0.92) continue
        var lqx = lA.x + lvx * lt
        var lqy = lA.y + lvy * lt
        var lex = pos[lu].x - lqx
        var ley = pos[lu].y - lqy
        var ldd = Math.sqrt(lex * lex + ley * ley)
        var lneed = rad[lu] * 0.92
        if (ldd >= lneed || ldd < 1e-4) continue
        var lpush = (lneed - ldd) * 0.55
        disp[lu].x += lex / ldd * lpush
        disp[lu].y += ley / ldd * lpush
        moved = true
      }
    }

    if (!moved) break
    var damp = it < 40 ? 0.85 : 0.5
    for (var q = 0; q < n; q++) {
      if (fixed[q] || !pos[q]) continue
      var lx = disp[q].x * damp
      var ly = disp[q].y * damp
      var lm = Math.sqrt(lx * lx + ly * ly)
      if (lm > 0.35) { lx = lx / lm * 0.35; ly = ly / lm * 0.35 }
      pos[q].x += lx
      pos[q].y += ly
    }
  }
  return pos
}

// ---------------- 凯库勒式 ----------------

/* 全局凯库勒：在芳香键上求"每个还缺双键的原子恰好配一根双键"的完美匹配。
   旧版是逐环贪心交替，蒽这种三环体系经常前两环成功、第三环失败 → 画个圆圈，
   同一张图里既有单双键又有圆圈，很难看。匹配法一次把整个环系排完。
   含环外双键的原子（咖啡因的 C=O）和吡咯型 N 价态已满，不参与匹配。 */
function kekulize(g) {
  var order = new Array(g.bonds.length)
  for (var i = 0; i < g.bonds.length; i++) order[i] = g.bonds[i].order

  var need = new Array(g.atoms.length)
  for (var a = 0; a < g.atoms.length; a++) {
    var at = g.atoms[a]
    var allow = allowedValence(at.sym, at.charge)
    need[a] = 0
    if (!allow) continue
    var val = at.h || 0
    var aromDeg = 0
    for (var n = 0; n < at.nbr.length; n++) {
      var o = g.bonds[at.nbr[n].bond].order
      if (o === 1.5) aromDeg++
      else val += o
    }
    if (aromDeg < 2) continue
    val += aromDeg
    // 「再加一根双键刚好落在允许价态」且「当前不在允许价态」才需要配双键
    if (allow.indexOf(val + 1) >= 0 && allow.indexOf(val) < 0) need[a] = 1
  }

  var byAtom = {}
  for (var b = 0; b < g.bonds.length; b++) {
    if (g.bonds[b].order !== 1.5) continue
    var A = g.bonds[b].a
    var B = g.bonds[b].b
    if (!need[A] || !need[B]) continue
    if (!byAtom[A]) byAtom[A] = []
    if (!byAtom[B]) byAtom[B] = []
    byAtom[A].push({ bond: b, to: B })
    byAtom[B].push({ bond: b, to: A })
  }

  var takeBond = {}   // atom -> 已占用的键
  var usedBond = {}
  var steps = 0
  var failed = false

  function dfs(list, i) {
    if (++steps > 60000) { failed = true; return false }
    if (i >= list.length) return true
    var at = list[i]
    if (takeBond[at] !== undefined) return dfs(list, i + 1)
    var opts = byAtom[at] || []
    for (var k = 0; k < opts.length; k++) {
      var ob = opts[k].bond
      var other = opts[k].to
      if (usedBond[ob] || takeBond[other] !== undefined) continue
      usedBond[ob] = 1
      takeBond[at] = ob
      takeBond[other] = ob
      if (dfs(list, i + 1)) return true
      delete usedBond[ob]
      delete takeBond[at]
      delete takeBond[other]
      if (failed) return false
    }
    return false
  }

  var todo = []
  for (var a2 = 0; a2 < g.atoms.length; a2++) if (need[a2]) todo.push(a2)
  // 先排选择最少的原子，回溯量小得多
  todo.sort(function (x, y) {
    return (byAtom[x] || []).length - (byAtom[y] || []).length
  })

  var ok = todo.length > 0 && todo.length % 2 === 0 && dfs(todo, 0)

  var circles = []
  if (ok) {
    for (var b2 = 0; b2 < order.length; b2++) if (order[b2] === 1.5) order[b2] = 1
    for (var kb in usedBond) if (usedBond[kb]) order[kb] = 2
  } else {
    // 排不出来（自由基、异常价态、超时）：整环改画芳香圆圈，
    // 并且只给「整环都是芳香键」的环画，避免半圈半线
    for (var ri = 0; ri < g.rings.length; ri++) {
      var r = g.rings[ri]
      var arom = true
      for (var k2 = 0; k2 < r.bonds.length; k2++) {
        if (g.bonds[r.bonds[k2]].order !== 1.5) { arom = false; break }
      }
      if (arom) circles.push(r)
    }
    for (var b3 = 0; b3 < order.length; b3++) if (order[b3] === 1.5) order[b3] = 1
  }

  return { order: order, circles: circles }
}

// ---------------- 图元生成 ----------------

/* 标签拆成 [字符, 模式]：0 正常、-1 下标、1 上标。
 * 不能用 Unicode 下标字符——设备 SVG 不支持 <text>，全得画成轮廓路径。 */
function atomLabel(a) {
  if (a.sym === '*') return []  // 聚合物端点：星号用线段图元画，不走字形
  var out = []
  // 同位素质量数标在左上角（核素记法 ¹³C）
  if (a.iso) {
    var is = String(a.iso)
    for (var q0 = 0; q0 < is.length; q0++) out.push([is.charAt(q0), 1])
  }
  if (a.sym === 'C') {
    if (a.charge) { out.push(['C', 0]); return out }
    if (a.deg === 1 && a.h === 3) { out.push(['C', 0]); out.push(['H', 0]); out.push(['3', -1]); return out }
    if (a.iso) return out  // 同位素碳至少要露出 ¹³C，否则看不出标记
    return []
  }
  for (var i = 0; i < a.sym.length; i++) out.push([a.sym.charAt(i), 0])
  if (a.h === 1) out.push(['H', 0])
  else if (a.h >= 2) { out.push(['H', 0]); out.push([String(a.h), -1]) }
  if (a.charge) {
    var m = a.charge < 0 ? -a.charge : a.charge
    if (m > 1) out.push([String(m), 1])
    out.push([a.charge > 0 ? '+' : '-', 1])
  }
  return out
}

function tokensWidth(toks, fs) {
  var w = 0
  for (var i = 0; i < toks.length; i++) {
    var g = GLYPHS[toks[i][0]]
    if (!g) continue
    w += g[0] * fs * (toks[i][1] ? SUB_SCALE : 1)
  }
  return w
}

/* 一组字形 → 一条 path 的 d（多子路径，非零环绕出镂空） */
function tokensToD(toks, cx, cy, fs) {
  var total = tokensWidth(toks, fs)
  var x = cx - total / 2
  var d = ''
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i]
    var g = GLYPHS[t[0]]
    if (!g) continue
    var s = fs * (t[1] ? SUB_SCALE : 1)
    var base = cy + fs * 0.36
    if (t[1] === -1) base += fs * 0.20
    else if (t[1] === 1) base -= fs * 0.40
    d += glyphD(g, x, base, s)
    x += g[0] * s
  }
  return d
}

function glyphD(g, x, y, s) {
  var out = ''
  for (var i = 1; i < g.length; i++) {
    var v = g[i]
    if (typeof v === 'string') { out += v; continue }
    out += r3(x + v * s) + ' ' + r3(y + g[i + 1] * s) + ' '
    i++
  }
  return out
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function r3(v) {
  return Math.round(v * 1000) / 1000
}

// ---------------- 化学审计（2026-11-21） ----------------
// 目标不是"证明结构正确"（那需要真正的化学引擎），而是把能判定的错误
// 挑出来并明确告知，避免"语法通过、化学错误"的图被当成正确答案。

// 允许价态。必须在 Kekulé 化之后用真实单双键算：
// 呋喃的 O 有两条芳香键，若按 1.5+1.5=3 会被误判超价，按单键 1+1=2 才对。
function allowedValence(sym, charge) {
  var c = charge || 0
  if (sym === 'C') return c === 0 ? [4] : [3]
  if (sym === 'N') return c > 0 ? [4] : (c < 0 ? [2] : [3])
  if (sym === 'O') return c > 0 ? [3] : (c < 0 ? [1] : [2])
  if (sym === 'S') return c < 0 ? [1] : (c > 0 ? [3, 5] : [2, 4, 6])
  if (sym === 'P') return [3, 5]
  if (sym === 'B') return [3]
  if (sym === 'Si') return [4]
  if (sym === 'F' || sym === 'Cl' || sym === 'Br' || sym === 'I') return [1]
  return null
}

function hillFormula(cnt) {
  var out = []
  if (cnt.C) out.push('C' + (cnt.C > 1 ? cnt.C : ''))
  if (cnt.H) out.push('H' + (cnt.H > 1 ? cnt.H : ''))
  var rest = []
  for (var k in cnt) if (k !== 'C' && k !== 'H' && cnt[k] > 0) rest.push(k)
  rest.sort()
  for (var i = 0; i < rest.length; i++) {
    out.push(rest[i] + (cnt[rest[i]] > 1 ? cnt[rest[i]] : ''))
  }
  return out.join('')
}

export function formulaOf(g) {
  var cnt = {}
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.sym === '*') continue  // 聚合物端点不计入分子式
    cnt[a.sym] = (cnt[a.sym] || 0) + 1
    if (a.h) cnt.H = (cnt.H || 0) + a.h
  }
  return hillFormula(cnt)
}

export function chargeOf(g) {
  var q = 0
  for (var i = 0; i < g.atoms.length; i++) q += g.atoms[i].charge || 0
  return q
}

function valenceAudit(g) {
  var out = []
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (a.badH) out.push(a.sym + ' 原子的氢数超出价态')
    var sum = 0
    var arom = false
    var hasDative = false
    for (var k = 0; k < a.nbr.length; k++) {
      var bi = a.nbr[k].bond
      if (g.bonds[bi].dative !== undefined) hasDative = true
      var o = g.order && g.order[bi] !== undefined ? g.order[bi] : g.bonds[bi].order
      if (o === 1.5) { arom = true; break }
      sum += o
    }
    // 芳香环没能 Kekulé 化（画圆圈）时，没有可靠的单双键，跳过该原子
    if (arom) continue
    var allow = allowedValence(a.sym, a.charge)
    if (!allow) continue
    var total = sum + (a.h || 0)
    // N 的 4 键配位样式（NH3→金属，3H+1配位）合法；无配位键的 N 4 键仍报
    if (hasDative && a.sym === 'N' && total === 4) continue
    if (allow.indexOf(total) < 0) {
      out.push(a.sym + ' 原子价态异常（' + total + ' 键）')
    }
  }
  return out
}

function aromaticAudit(g) {
  var out = []
  // 稠环（与其他环共享原子的环）不逐环数 π 电子：嘌呤两环各自不是 4n+2，
  // 但整个稠环体系是芳香的，逐环查只会误报。4n+2 只对孤立环有意义——
  // 模型最常见的错误（吡咯/呋喃写成 5π）恰恰都发生在孤立环上。
  var shared = {}
  for (var r0 = 0; r0 < g.rings.length; r0++) {
    var ra0 = g.rings[r0].atoms
    for (var k0 = 0; k0 < ra0.length; k0++) shared[ra0[k0]] = (shared[ra0[k0]] || 0) + 1
  }
  for (var r = 0; r < g.rings.length; r++) {
    var ring = g.rings[r]
    var fused = false
    for (var b0 = 0; b0 < ring.atoms.length; b0++) {
      if (shared[ring.atoms[b0]] > 1) { fused = true; break }
    }
    if (fused) continue
    // 芳香性看原子标记，不看键级：Kekulé 化后环键已经变成 1/2，
    // 旧版按 1.5 判断会永远跳过已成功 Kekulé 化的环（5π 环因此漏报）。
    var allArom = true
    for (var b = 0; b < ring.atoms.length; b++) {
      if (!g.atoms[ring.atoms[b]].arom) { allArom = false; break }
    }
    if (!allArom) continue
    var n = ring.atoms.length
    if (n < 5 || n > 7) { out.push('芳香环大小为 ' + n + '，不符合 5~7 元环'); continue }
    var pi = 0
    for (var k = 0; k < ring.atoms.length; k++) {
      var a = g.atoms[ring.atoms[k]]
      var contrib = (a.sym === 'O' || a.sym === 'S') ? 2
        : (a.sym === 'N' ? ((a.bracket && a.h > 0) ? 2 : 1) : 1)
      // 带电芳香原子（2026-11-21 复杂结构实测）：
      // 负离子多一对孤对进 p 轨道 → 2π（环戊二烯负离子 4×1+2=6）；
      // 正离子空 p 轨道 → 0π（环庚三烯正离子 6×1+0=6，吡啶鎓 5×1+1=6）。
      // 旧版一律按 1 计，把这几种正确的芳香体系误报成「不满足 4n+2」。
      if (a.charge < 0) contrib = 2
      else if (a.charge > 0 && contrib > 0) contrib = contrib - 1
      pi += contrib
    }
    if (pi % 4 !== 2) out.push('芳香环 π 电子数为 ' + pi + '，不满足 4n+2')
  }
  return out
}

/**
 * 配位键标记：金属-非金属之间的键按配位键画（虚线 + 箭头指向金属）。
 * 配体隐式 H 规则（教学图语义）：
 *   - N 配体：配位不占价态（NH3 的孤对给出后 N 仍是 3 个 H，铵样式），
 *     parseSmiles 按普通键扣掉的 1 个 H 加回去 → 显示 NH3。
 *   - 其他配体（O 等）：按标准价态扣减（OH、H2O 样式），不加回。
 * 金属自身价态多变（Fe2+/Fe3+ 都是 6 配位常见），跳过审计。
 */
function markDative(g) {
  for (var i = 0; i < g.bonds.length; i++) {
    var bd = g.bonds[i]
    var am = g.atoms[bd.a]
    var bm = g.atoms[bd.b]
    if (METAL[am.sym] && !METAL[bm.sym] && bm.sym !== '*') {
      bd.dative = bd.a
      if (bm.sym === 'N') bm.h = (bm.h || 0) + 1
    } else if (METAL[bm.sym] && !METAL[am.sym] && am.sym !== '*') {
      bd.dative = bd.b
      if (am.sym === 'N') am.h = (am.h || 0) + 1
    }
  }
}

/**
 * CIP 手性（2026-11-21）。目标不是完整 CIP 规则（假异构/伪手性/轴手性不管），
 * 只处理高中场景：一个手性碳连 4 个不同取代基。层序比较取代基：
 * 直接相连原子原子序数大者优先；相同则展开下一层（双键原子复制一份计入）。
 * 隐式/显式 H 优先级最低。返回 [最高, ..., 最低]，含 H（to=-1）。
 */
var CIP_Z = { H: 1, B: 5, C: 6, N: 7, O: 8, F: 9, Si: 14, P: 15, S: 16, Cl: 17, Br: 35, I: 53 }

function atomZ(sym) {
  return CIP_Z[sym] || (METAL[sym] ? 26 : 6)
}

function cipRank(g, root, start) {
  var key = []
  var visited = {}
  visited[root] = 1
  var cur = [{ a: start, dup: 0 }]
  visited[start] = 1
  var guard = 0
  while (cur.length && guard++ < 10) {
    var level = []
    var nxt = []
    for (var i = 0; i < cur.length; i++) {
      var node = cur[i]
      var a = g.atoms[node.a]
      level.push(atomZ(a.sym))
      if (node.dup) level.push(node.dup)
      var nb = a.nbr
      for (var k = 0; k < nb.length; k++) {
        var to = nb[k].to
        if (visited[to]) continue
        var bi = nb[k].bond
        var ord = (g.order && g.order[bi] !== undefined) ? g.order[bi] : g.bonds[bi].order
        visited[to] = 1
        nxt.push({ a: to, dup: 0 })
        if (ord === 2) nxt.push({ a: to, dup: atomZ(g.atoms[to].sym) })
        else if (ord === 3) {
          nxt.push({ a: to, dup: atomZ(g.atoms[to].sym) })
          nxt.push({ a: to, dup: atomZ(g.atoms[to].sym) })
        }
      }
    }
    level.sort(function (x, y) { return y - x })
    key = key.concat(level)
    cur = nxt
  }
  return key
}

function cipOrder(g, ci) {
  var a = g.atoms[ci]
  var list = []
  for (var k = 0; k < a.nbr.length; k++) {
    list.push({ to: a.nbr[k].to, key: cipRank(g, ci, a.nbr[k].to), bond: a.nbr[k].bond })
  }
  if (a.h > 0) list.push({ to: -1, key: [1], bond: -1 })
  list.sort(function (x, y) {
    var n = Math.min(x.key.length, y.key.length)
    for (var i = 0; i < n; i++) {
      if (x.key[i] !== y.key[i]) return y.key[i] - x.key[i]
    }
    return y.key.length - x.key.length
  })
  return list
}

/** SMILES @/@@ → R/S。
 * 邻居顺序（Daylight/RDKit 语义）：H（bracket 显式或隐式）排第一，
 * 之后 prev、branch、next 按出现顺序。SMILES 顺序转 CIP 名次的排列奇偶决定翻转。 */
function chirToRS(g, ci, chir, cip) {
  var order = []
  if (g.atoms[ci].h > 0) order.push(-1)
  for (var k = 0; k < g.atoms[ci].nbr.length; k++) order.push(g.atoms[ci].nbr[k].to)
  var rankOf = {}
  for (var r = 0; r < cip.length; r++) rankOf[cip[r].to] = r + 1
  var seq = []
  for (var s = 0; s < order.length; s++) seq.push(rankOf[order[s]] || 4)
  var inv = 0
  for (var i2 = 0; i2 < seq.length; i2++) {
    for (var j2 = i2 + 1; j2 < seq.length; j2++) {
      if (seq[i2] > seq[j2]) inv++
    }
  }
  var rs = (chir === 1) ? 'R' : 'S'
  if (inv % 2 === 1) rs = (rs === 'R') ? 'S' : 'R'
  return rs
}

/**
 * 手性原子登记：解析后调用（无需坐标）。算每个手性原子的 CIP 顺序与 R/S，
 * 存 g.chiOrder / g.chiRS；楔形键选哪根、实还是虚，等布局后在 fixChiWedges 定。
 */
function pickChiBonds(g) {
  g.chiBond = {}
  g.chiOrder = {}
  g.chiRS = {}
  g.hWedges = []
  for (var i = 0; i < g.atoms.length; i++) {
    var a = g.atoms[i]
    if (!a.chir) continue
    var cip = cipOrder(g, i)
    if (cip.length < 4) continue
    g.chiOrder[i] = cip
    g.chiRS[i] = chirToRS(g, i, a.chir, cip)
  }
}

/**
 * 布局后校正：按 R/S 与三个平面邻居的屏幕旋转方向，决定楔形键画在哪根、
 * 实还是虚。规则：最低优先级（p4）朝后时 p1→p2→p3 视觉顺时针 = R。
 * p4 是显式原子 → 直接在 p4 的键上画楔；p4 是 H → 楔形指向虚拟 H 位置
 * （从手性碳背向三邻居延伸，教材画法），三根显式键保持普通线。
 */
function fixChiWedges(g) {
  if (!g.chiOrder) return
  for (var ciStr in g.chiOrder) {
    var idx = parseInt(ciStr)
    var cip = g.chiOrder[idx]
    var rs = g.chiRS[idx]
    var pc = g.pos[idx]
    if (!pc) continue
    var p1 = cip[0].to >= 0 ? g.pos[cip[0].to] : null
    var p2 = cip[1].to >= 0 ? g.pos[cip[1].to] : null
    var p3 = cip[2].to >= 0 ? g.pos[cip[2].to] : null
    if (!p1 || !p2 || !p3) continue
    // 屏幕坐标 y 向下：signed area > 0 = 视觉顺时针
    var area = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
    var cw = area > 0
    var wantCW = (rs === 'R')
    var dashed = (cw === wantCW)  // 朝后=虚楔即可满足构型；否则朝前=实楔
    var wedgeVal = dashed ? 2 : 1
    var p4to = cip[3].to
    if (p4to >= 0 && g.pos[p4to]) {
      var bi = cip[3].bond
      if (bi >= 0) g.chiBond[bi] = wedgeVal
    } else {
      // p4 是 H：虚拟第四顶点 = 手性碳背向三邻居质心延伸
      var cx = (p1.x + p2.x + p3.x) / 3
      var cy = (p1.y + p2.y + p3.y) / 3
      var dx = pc.x - cx
      var dy = pc.y - cy
      var dl = Math.sqrt(dx * dx + dy * dy) || 1
      g.hWedges.push({
        ci: idx,
        x: pc.x + dx / dl * 1.15,
        y: pc.y + dy / dl * 1.15,
        val: wedgeVal
      })
    }
  }
}

/**
 * 只做解析/校验，不做布局。给"为什么画不出来"提供可读原因。
 * @returns {{ok:boolean, reason?:string, graph?:object, formula?:string, charge?:number, issues?:string[]}}
 */
export function inspectSmiles(smiles) {
  var g = parseSmiles(smiles)
  if (!g) return { ok: false, reason: 'SMILES 无法解析' }
  // 100 原子 / 16 环以内可画；再大不是画不了，是 936x280 屏上失去辨识度
  if (g.atoms.length > 100) return { ok: false, reason: '重原子 ' + g.atoms.length + ' 个，超过绘制上限 100' }
  g.rings = findRings(g)
  if (g.rings.length > 16) return { ok: false, reason: '环数 ' + g.rings.length + ' 个，超过上限 16' }
  var kk = kekulize(g)
  g.order = kk.order
  g.circles = kk.circles
  markDative(g)
  pickChiBonds(g)
  var issues = valenceAudit(g).concat(aromaticAudit(g))
  return {
    ok: true,
    graph: g,
    formula: formulaOf(g),
    charge: chargeOf(g),
    issues: issues
  }
}


export function buildPrimitives(smiles, opts) {
  var o = opts || {}
  var chk = inspectSmiles(smiles)
  if (!chk.ok) return null
  var g = chk.graph
  g.pos = layout(g)

  var unplaced = 0
  for (var u = 0; u < g.pos.length; u++) if (!g.pos[u]) unplaced++
  if (unplaced) return null

  var ringCenter = {}
  for (var ri = 0; ri < g.rings.length; ri++) {
    var r = g.rings[ri]
    var sx = 0, sy = 0, cnt = 0
    for (var m = 0; m < r.atoms.length; m++) {
      var pp = g.pos[r.atoms[m]]
      if (!pp) continue
      sx += pp.x; sy += pp.y; cnt++
    }
    if (!cnt) continue
    var ctr = { x: sx / cnt, y: sy / cnt }
    for (var b2 = 0; b2 < r.bonds.length; b2++) {
      // 一根键可能同时属于两个环（稠合边）：两个圆心都要留着，
      // 画双键时选离中点近的那个，否则内线会跑到环外侧去
      if (!ringCenter[r.bonds[b2]]) ringCenter[r.bonds[b2]] = []
      ringCenter[r.bonds[b2]].push(ctr)
    }
  }

  var bb = bounds(g.pos, null)
  var vw = bb.w || 1

  var fs = clamp(vw * 0.058, 0.42, 0.72)
  var lw = clamp(vw * 0.0125, 0.052, 0.115)

  var labels = []
  for (var i2 = 0; i2 < g.atoms.length; i2++) labels.push(atomLabel(g.atoms[i2]))

  // CIP 校正必须在布局之后（要读平面邻居的旋转方向）
  fixChiWedges(g)

  // 楔形图元：宽端 (xw,yw) 在手性原子侧，val 1=实楔（朝前）2=虚楔（朝后）
  function pushWedge(prims, xw, yw, xn, yn, nx, ny, fs, lw, val) {
    var hw = fs * 0.17
    if (val === 1) {
      prims.push({ t: 'w', x1: xw + nx * hw, y1: yw + ny * hw, x2: xw - nx * hw, y2: yw - ny * hw, x3: xn, y3: yn })
    } else {
      var vlines = []
      for (var s5 = 0; s5 < 5; s5++) {
        var tt = s5 / 4
        var px5 = xw + (xn - xw) * tt
        var py5 = yw + (yn - yw) * tt
        var hh5 = hw * (1 - tt * 0.9)
        if (hh5 < lw * 0.7) hh5 = lw * 0.7
        vlines.push({ x1: px5 + nx * hh5, y1: py5 + ny * hh5, x2: px5 - nx * hh5, y2: py5 - ny * hh5 })
      }
      prims.push({ t: 'ml', lines: vlines })
    }
  }

  var prims = []

  // H 用虚拟位置的楔形表达构型（p4=H 时画不出真键，指向虚拟第四顶点）
  if (g.hWedges && g.hWedges.length) {
    for (var hw = 0; hw < g.hWedges.length; hw++) {
      var ew = g.hWedges[hw]
      var epc = g.pos[ew.ci]
      if (!epc) continue
      var edx = ew.x - epc.x
      var edy = ew.y - epc.y
      var edl = Math.sqrt(edx * edx + edy * edy) || 1
      var enx = -edy / edl
      var eny = edx / edl
      pushWedge(prims, epc.x, epc.y, ew.x, ew.y, enx, eny, fs, lw, ew.val)
    }
  }

  for (var bi = 0; bi < g.bonds.length; bi++) {
    var bd = g.bonds[bi]
    var pa = g.pos[bd.a]
    var pb = g.pos[bd.b]
    if (!pa || !pb) continue
    var dx = pb.x - pa.x
    var dy = pb.y - pa.y
    var len = Math.sqrt(dx * dx + dy * dy) || 1
    var ux = dx / len
    var uy = dy / len
    var t1 = labels[bd.a].length ? tokensWidth(labels[bd.a], fs) / 2 + fs * 0.09 : 0
    var t2 = labels[bd.b].length ? tokensWidth(labels[bd.b], fs) / 2 + fs * 0.09 : 0
    var x1 = pa.x + ux * t1
    var y1 = pa.y + uy * t1
    var x2 = pb.x - ux * t2
    var y2 = pb.y - uy * t2

    var ord = g.order[bi]
    var nx = -uy
    var ny = ux

    // 手性楔形：宽端在手性原子侧；实/虚由 fixChiWedges 按 CIP 校正
    var chi = g.chiBond ? g.chiBond[bi] : 0
    if (chi && !bd.dative) {
      var wa = g.atoms[bd.a].chir ? true : false
      var xw = wa ? x1 : x2, yw = wa ? y1 : y2
      var xn = wa ? x2 : x1, yn = wa ? y2 : y1
      pushWedge(prims, xw, yw, xn, yn, nx, ny, fs, lw, chi)
    } else if (bd.dative) {
      // 配位键：虚线 + 箭头指向金属端（给电子对方向 配体→金属）
      var mIsA = bd.dative === bd.a
      var mx2 = mIsA ? x1 : x2, my2 = mIsA ? y1 : y2
      var ox2 = mIsA ? x2 : x1, oy2 = mIsA ? y2 : y1
      var ddx2 = mx2 - ox2, ddy2 = my2 - oy2
      var dl2 = Math.sqrt(ddx2 * ddx2 + ddy2 * ddy2) || 1
      var ux2 = ddx2 / dl2, uy2 = ddy2 / dl2
      var vx2 = -uy2, vy2 = ux2
      var dlines = []
      for (var s6 = 0; s6 < 4; s6++) {
        var t6a = 0.10 + (s6 + 0.10) / 4 * 0.72
        var t6b = 0.10 + (s6 + 0.55) / 4 * 0.72
        dlines.push({
          x1: ox2 + ddx2 * t6a, y1: oy2 + ddy2 * t6a,
          x2: ox2 + ddx2 * t6b, y2: oy2 + ddy2 * t6b
        })
      }
      var al = fs * 0.46
      dlines.push({ x1: mx2 - ux2 * al + vx2 * al * 0.5, y1: my2 - uy2 * al + vy2 * al * 0.5, x2: mx2, y2: my2 })
      dlines.push({ x1: mx2 - ux2 * al - vx2 * al * 0.5, y1: my2 - uy2 * al - vy2 * al * 0.5, x2: mx2, y2: my2 })
      prims.push({ t: 'ml', lines: dlines })
    } else if (ord === 1 || ord === 1.5) {
      prims.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2 })
    } else if (ord === 2) {
      var cands = ringCenter[bi]
      var ctr2 = null
      if (cands && cands.length) {
        var mdx = (pa.x + pb.x) / 2
        var mdy = (pa.y + pb.y) / 2
        var bestD = 1e9
        for (var cn = 0; cn < cands.length; cn++) {
          var ddx = cands[cn].x - mdx
          var ddy = cands[cn].y - mdy
          var dd2 = ddx * ddx + ddy * ddy
          if (dd2 < bestD) { bestD = dd2; ctr2 = cands[cn] }
        }
      }
      var off = 0.115
      if (ctr2) {
        var mx = (pa.x + pb.x) / 2 - ctr2.x
        var my = (pa.y + pb.y) / 2 - ctr2.y
        var sgn = (mx * nx + my * ny) > 0 ? -1 : 1
        prims.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2 })
        // 环内那条线：两头各缩 8.5%、向环心偏 0.13 键长，
        // 比例贴近课本（旧值缩 13%/偏 0.20，看起来像几段漂浮的短线）
        var sh = 0.085
        var ax = x1 + (x2 - x1) * sh + nx * off * sgn * 1.13
        var ay = y1 + (y2 - y1) * sh + ny * off * sgn * 1.13
        var bx = x2 - (x2 - x1) * sh + nx * off * sgn * 1.13
        var by = y2 - (y2 - y1) * sh + ny * off * sgn * 1.13
        prims.push({ t: 'l', x1: ax, y1: ay, x2: bx, y2: by })
      } else {
        prims.push({
          t: 'l', x1: x1 + nx * off, y1: y1 + ny * off,
          x2: x2 + nx * off, y2: y2 + ny * off
        })
        prims.push({
          t: 'l', x1: x1 - nx * off, y1: y1 - ny * off,
          x2: x2 - nx * off, y2: y2 - ny * off
        })
      }
    } else if (ord === 3) {
      prims.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2 })
      prims.push({ t: 'l', x1: x1 + nx * 0.16, y1: y1 + ny * 0.16, x2: x2 + nx * 0.16, y2: y2 + ny * 0.16 })
      prims.push({ t: 'l', x1: x1 - nx * 0.16, y1: y1 - ny * 0.16, x2: x2 - nx * 0.16, y2: y2 - ny * 0.16 })
    }
  }

  for (var ci2 = 0; ci2 < g.circles.length; ci2++) {
    var rc = g.circles[ci2]
    var sx2 = 0, sy2 = 0, c2 = 0
    for (var m2 = 0; m2 < rc.atoms.length; m2++) {
      var pp2 = g.pos[rc.atoms[m2]]
      if (!pp2) continue
      sx2 += pp2.x; sy2 += pp2.y; c2++
    }
    if (!c2) continue
    var rad = 1 / (2 * Math.sin(Math.PI / c2)) * Math.cos(Math.PI / c2) * 0.55
    prims.push({ t: 'c', x: sx2 / c2, y: sy2 / c2, r: rad })
  }

  for (var ai = 0; ai < g.atoms.length; ai++) {
    var a4 = g.atoms[ai]
    var lab = labels[ai]
    if (a4.sym === '*') {
      // 聚合物端点：三条过中心的线段画成星号
      var p5 = g.pos[ai]
      if (!p5) continue
      var sr = fs * 0.60
      var slines = []
      for (var sa = 0; sa < 3; sa++) {
        var ang = Math.PI / 2 + sa * Math.PI / 3
        var cxx = Math.cos(ang) * sr
        var cyy = Math.sin(ang) * sr
        slines.push({ x1: p5.x - cxx, y1: p5.y - cyy, x2: p5.x + cxx, y2: p5.y + cyy })
      }
      prims.push({ t: 'ml', lines: slines })
      // 星号占位也要进包围盒，否则贴边被裁
      if (p5.x - sr < bb.minx) bb.minx = p5.x - sr
      if (p5.x + sr > bb.maxx) bb.maxx = p5.x + sr
      if (p5.y - sr < bb.miny) bb.miny = p5.y - sr
      if (p5.y + sr > bb.maxy) bb.maxy = p5.y + sr
      continue
    }
    if (!lab.length) continue
    var p3 = g.pos[ai]
    if (!p3) continue
    prims.push({ t: 'g', x: p3.x, y: p3.y, toks: lab })
  }

  // 标签是以原子坐标为中心绘制的，包围盒必须把字宽算进去，
  // 否则最左/最右的 CH3、OH 会贴着边框被裁掉（阿司匹林、异丙醇实测）
  for (var la = 0; la < labels.length; la++) {
    if (!labels[la].length) continue
    var p4 = g.pos[la]
    if (!p4) continue
    var hw = tokensWidth(labels[la], fs) / 2
    if (p4.x - hw < bb.minx) bb.minx = p4.x - hw
    if (p4.x + hw > bb.maxx) bb.maxx = p4.x + hw
    // 竖直方向留 0.78em：CH3 的下标会往下探，0.62 时底边会被切掉一点
    if (p4.y - fs * 0.78 < bb.miny) bb.miny = p4.y - fs * 0.78
    if (p4.y + fs * 0.78 > bb.maxy) bb.maxy = p4.y + fs * 0.78
  }
  bb.w = bb.maxx - bb.minx
  bb.h = bb.maxy - bb.miny

  return {
    prims: prims,
    fs: fs,
    lw: lw,
    bbox: { x: bb.minx, y: bb.miny, w: bb.w || 1, h: bb.h || 1 },
    bonds: g.bonds.length,
    atoms: g.atoms.length,
    formula: chk.formula,
    charge: chk.charge,
    issues: chk.issues,
    graph: g,
    color: o.color || '#eef2fa'
  }
}

// 调试用：把布局坐标和标签暴露出来
export function debugLayout(smiles) {
  var g = parseSmiles(smiles)
  if (!g) return null
  g.rings = findRings(g)
  var pos = layout(g)
  var out = []
  for (var i = 0; i < g.atoms.length; i++) {
    if (!pos[i]) continue
    var lb = atomLabel(g.atoms[i])
    out.push({ i: i, sym: g.atoms[i].sym, x: pos[i].x, y: pos[i].y, label: lb.map(function (t) { return t[0] }).join('') })
  }
  return out
}

export function primsToSvg(geo, pw, ph) {
  var b = geo.bbox
  var cw = b.w + PAD * 2
  var ch = b.h + PAD * 2
  // 控件尺寸由外部给定；viewBox 必须与之同比，否则渲染器会拉伸变形
  var vw = cw
  var vh = ch
  var want = pw / ph
  if (cw / ch > want) vh = cw / want
  else vw = ch * want
  // 设备 image 组件对「负 viewBox 偏移」处理不可靠（真机实测：同样的 SVG，
  // Edge 完整、设备丢环上半），这里把内容平移到坐标原点，viewBox 恒从 0 0
  // 开始——这是最保守、兼容性最好的写法，浏览器与设备行为一致。
  var vx = b.x + b.w / 2 - vw / 2
  var vy = b.y + b.h / 2 - vh / 2

  var out = []
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + pw + '" height="' + ph +
    '" viewBox="0 0 ' + r3(vw) + ' ' + r3(vh) + '">')
  out.push('<g stroke="' + geo.color + '" stroke-width="' + r3(geo.lw) + '" fill="none">')
  for (var i = 0; i < geo.prims.length; i++) {
    var p = geo.prims[i]
    if (p.t === 'l') {
      out.push('<line x1="' + r3(p.x1 - vx) + '" y1="' + r3(p.y1 - vy) + '" x2="' + r3(p.x2 - vx) + '" y2="' + r3(p.y2 - vy) + '"/>')
    } else if (p.t === 'ml') {
      for (var m5 = 0; m5 < p.lines.length; m5++) {
        var ln = p.lines[m5]
        out.push('<line x1="' + r3(ln.x1 - vx) + '" y1="' + r3(ln.y1 - vy) + '" x2="' + r3(ln.x2 - vx) + '" y2="' + r3(ln.y2 - vy) + '"/>')
      }
    } else if (p.t === 'c') {
      out.push('<circle cx="' + r3(p.x - vx) + '" cy="' + r3(p.y - vy) + '" r="' + r3(p.r) + '"/>')
    }
  }
  out.push('</g>')
  out.push('<g fill="' + geo.color + '" stroke="none">')
  for (var j = 0; j < geo.prims.length; j++) {
    var q = geo.prims[j]
    if (q.t === 'g') {
      out.push('<path d="' + tokensToD(q.toks, q.x - vx, q.y - vy, geo.fs) + '"/>')
    } else if (q.t === 'w') {
      out.push('<polygon points="' + r3(q.x1 - vx) + ',' + r3(q.y1 - vy) + ' ' +
        r3(q.x2 - vx) + ',' + r3(q.y2 - vy) + ' ' + r3(q.x3 - vx) + ',' + r3(q.y3 - vy) + '"/>')
    }
  }
  out.push('</g></svg>')
  return out.join('')
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function svgUri(svg) {
  return 'data:image/svg+xml;base64,' + b64(svg)
}

/* 主入口：SMILES → data URI（失败返回 null） */
export function molUri(smiles, color, box) {
  var info = molInfo(smiles, color, box || 200, box || 200)
  return info ? info.uri : null
}

/* 带几何信息，便于按宽高比排版 */
export function molInfo(smiles, color, boxW, boxH) {
  var geo = buildPrimitives(smiles, { color: color })
  if (!geo) return null
  var cw = geo.bbox.w + PAD * 2
  var ch = geo.bbox.h + PAD * 2
  var scale = Math.min(boxW / cw, boxH / ch)
  var pw = Math.max(16, Math.round(cw * scale))
  var ph = Math.max(16, Math.round(ch * scale))
  return {
    uri: svgUri(primsToSvg(geo, pw, ph)),
    w: pw,
    h: ph,
    ar: cw / ch,
    bonds: geo.bonds,
    atoms: geo.atoms,
    formula: geo.formula,
    charge: geo.charge,
    issues: geo.issues,
    graph: geo.graph
  }
}

// ---------------- 兼容旧接口 ----------------

export function benzeneSvg(color, size) {
  var geo = buildPrimitives('c1ccccc1', { color: color })
  if (!geo) return ''
  return primsToSvg(geo, size || 200, size || 200)
}

export function needsBenzene(text) {
  if (!text) return false
  var t = String(text)
  var ring = (t.indexOf('苯环') >= 0 || t.indexOf('C₆H₆') >= 0 || t.indexOf('C6H6') >= 0)
  var shape = (t.indexOf('六边') >= 0 || t.indexOf('正六') >= 0 || t.indexOf('碳环') >= 0 ||
    t.indexOf('凯库勒') >= 0)
  return ring && shape
}
