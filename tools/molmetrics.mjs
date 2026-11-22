// 结构式布局质量度量（开发工具 / 测试共用）
// 只依赖 buildPrimitives 的产出：prims（线段/字形）+ graph + fs
import { buildPrimitives } from '../src/utils/mol.js'

function segInt(p1, p2, p3, p4) {
  // 严格相交（共享端点、共线重叠不算）
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (Math.abs(d) < 1e-9) return false
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

function labelBox(toks, x, y, fs) {
  // 与 mol.js 的 tokensWidth 保持同量级：宽字符按 0.62em 估
  let w = 0
  for (const t of toks) w += (t[1] ? fs * 0.42 : fs * 0.62)
  return { x0: x - w / 2, x1: x + w / 2, y0: y - fs * 0.52, y1: y + fs * 0.52, w }
}

export function metrics(smiles) {
  const geo = buildPrimitives(smiles)
  if (!geo) return { ok: false }
  const g = geo.graph
  const pos = g.pos
  const fs = geo.fs
  const lines = geo.prims.filter(p => p.t === 'l')
  const glyphs = geo.prims.filter(p => p.t === 'g')

  // ---- 键长 / 变异系数（只算非环键，环内键由多边形几何决定）
  const ringBonds = new Set()
  for (const r of g.rings) for (const b of r.bonds) ringBonds.add(b)
  const blens = []
  for (let i = 0; i < g.bonds.length; i++) {
    if (ringBonds.has(i)) continue
    const a = pos[g.bonds[i].a], b = pos[g.bonds[i].b]
    if (!a || !b) continue
    blens.push(Math.hypot(a.x - b.x, a.y - b.y))
  }
  const mean = blens.length ? blens.reduce((s, v) => s + v, 0) / blens.length : 1
  const sd = blens.length ? Math.sqrt(blens.reduce((s, v) => s + (v - mean) ** 2, 0) / blens.length) : 0
  const cv = mean ? sd / mean : 0

  // ---- 非键原子最小距离（含标签半径：带标签的原子占地更大）
  let minNonBond = 99
  let minPair = null
  for (let i = 0; i < g.atoms.length; i++) {
    for (let j = i + 1; j < g.atoms.length; j++) {
      const a = pos[i], b = pos[j]
      if (!a || !b) continue
      const bonded = g.atoms[i].nbr.some(n => n.to === j)
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (!bonded && d < minNonBond) { minNonBond = d; minPair = [i, j] }
    }
  }

  // ---- 标签重叠
  const boxes = glyphs.map(p => labelBox(p.toks, p.x, p.y, fs))
  let overlap = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j]
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) overlap++
    }
  }

  // ---- 键交叉：跳过共享原子的键对
  let crossings = 0
  const bondLines = []
  for (const b of g.bonds) {
    const a = pos[b.a], c = pos[b.b]
    if (!a || !c) continue
    bondLines.push({ a: b.a, b: b.b, p1: a, p2: c })
  }
  for (let i = 0; i < bondLines.length; i++) {
    for (let j = i + 1; j < bondLines.length; j++) {
      const A = bondLines[i], B = bondLines[j]
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue
      if (segInt(A.p1, A.p2, B.p1, B.p2)) crossings++
    }
  }

  // ---- 环内角偏差（度）
  let maxAngDev = 0
  for (const r of g.rings) {
    const n = r.atoms.length
    const ideal = (n - 2) * 180 / n
    for (let k = 0; k < n; k++) {
      const p0 = pos[r.atoms[(k + n - 1) % n]]
      const p1 = pos[r.atoms[k]]
      const p2 = pos[r.atoms[(k + 1) % n]]
      if (!p0 || !p1 || !p2) continue
      const v1 = { x: p0.x - p1.x, y: p0.y - p1.y }
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y }
      const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
      const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
      maxAngDev = Math.max(maxAngDev, Math.abs(ang - ideal))
    }
  }

  const bb = geo.bbox
  return {
    ok: true, atoms: g.atoms.length, rings: g.rings.map(r => r.atoms.length),
    labels: boxes.length, overlap, crossings, minNonBond, minPair,
    cv, meanBond: mean, maxAngDev, aspect: bb.w / bb.h
  }
}

export function fmt(name, m) {
  if (!m.ok) return name + ': 无法构建'
  return name.padEnd(16) + ' 原子' + String(m.atoms).padStart(2) +
    ' 环[' + m.rings.join(',') + ']' +
    ' 交叉' + m.crossings +
    ' 标签重叠' + m.overlap +
    ' 非键最短' + m.minNonBond.toFixed(2) +
    ' 键长CV' + m.cv.toFixed(3) +
    ' 环角偏差' + m.maxAngDev.toFixed(1) + '°'
}
