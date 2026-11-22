// 布局指标回归：把「观感」变成可量化的断言
// 覆盖：键交叉、标签重叠、非键原子最短距离、键长一致性、环角度、环系朝向、凯库勒双键数
import { metrics } from '../../tools/molmetrics.mjs'
import { buildPrimitives } from '../../src/utils/mol.js'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) { pass++; console.log('ok    ' + msg) }
  else { fail++; console.log('FAIL  ' + msg) }
}

// ---------- 1. 全语料不变量 ----------
// 阈值按实测留余量：偶氮苯两环最近 1.00，螺环 1.09
const corpus = [
  ['苯', 'c1ccccc1'],
  ['萘', 'c1ccc2ccccc2c1'],
  ['蒽', 'c1ccc2cc3ccccc3cc2c1'],
  ['菲', 'c1ccc2c(c1)ccc1ccccc12'],
  ['芘', 'c1cc2ccc3cccc4ccc(c1)c2c34'],
  ['薁', 'c1ccc2cccc2cc1'],
  ['吲哚', 'c1ccc2[nH]ccc2c1'],
  ['喹啉', 'c1ccc2ncccc2c1'],
  ['嘌呤', 'c1nc2[nH]cnc2c(=O)[nH]1'],
  ['尿酸', 'O=c1[nH]c(=O)c2[nH]cnc2[nH]1'],
  ['咖啡因', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C'],
  ['咪唑', 'c1cnc[nH]1'],
  ['环己烷', 'C1CCCCC1'],
  ['螺环', 'C1CCC2(CC1)CCCC2'],
  ['联苯', 'c1ccc(cc1)c1ccccc1'],
  ['偶氮苯', 'c1ccccc1N=Nc1ccccc1'],
  ['三苯甲烷', 'c1ccccc1C(c1ccccc1)c1ccccc1'],
  ['阿司匹林', 'CC(=O)Oc1ccccc1C(=O)O'],
  ['布洛芬', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'],
  ['葡萄糖', 'OCC1OC(O)C(O)C(O)C1O'],
  ['胆固醇', 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C'],
  ['阿莫西林', 'CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O']
]

for (const [name, smi] of corpus) {
  const m = metrics(smi)
  if (!m.ok) { ok(false, name + ' 可以构建'); continue }
  ok(m.crossings === 0, name + ' 无键交叉（实际 ' + m.crossings + '）')
  ok(m.overlap === 0, name + ' 无标签重叠（实际 ' + m.overlap + '）')
  ok(m.minNonBond >= 0.95, name + ' 非键原子不挤（最短 ' + m.minNonBond.toFixed(2) + '）')
  ok(m.cv <= 0.12, name + ' 键长一致（CV ' + m.cv.toFixed(3) + '）')
  ok(m.maxAngDev <= 1.5, name + ' 环保持正多边形（角偏差 ' + m.maxAngDev.toFixed(1) + '°）')
}

// ---------- 1b. 拥挤体系（P4 扭转优化的靶子） ----------
// 四苯甲烷在 2D 里 4×120° 摆不下，四只苯环本来就会贴得很近，
// 只要「不叠、不交叉、不短于 0.88」就算合格。
const crowded = [
  ['四苯甲烷', 'c1ccccc1C(c1ccccc1)(c1ccccc1)c1ccccc1', 0.88],
  ['三苯甲醇', 'OC(c1ccccc1)(c1ccccc1)c1ccccc1', 0.88],
  ['地西泮', 'CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21', 0.95],
  ['青霉素G', 'CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O', 0.95],
  ['樟脑', 'CC1(C)C2CCC1(C)C(=O)C2', 0.70]
]
for (const [name, smi, floor] of crowded) {
  const m = metrics(smi)
  ok(m.ok, name + ' 可以构建')
  if (!m.ok) continue
  ok(m.crossings === 0, name + ' 无键交叉（实际 ' + m.crossings + '）')
  ok(m.overlap === 0, name + ' 无标签重叠（实际 ' + m.overlap + '）')
  ok(m.minNonBond >= floor, name + ' 非键原子不叠（最短 ' + m.minNonBond.toFixed(2) + '）')
  ok(m.cv <= 0.12, name + ' 键长一致（CV ' + m.cv.toFixed(3) + '）')
}

// 扭转优化必须真的解决四苯甲烷（旧版 2 处交叉、最短 0.38）
const tpm = metrics('c1ccccc1C(c1ccccc1)(c1ccccc1)c1ccccc1')
ok(tpm.crossings === 0 && tpm.minNonBond >= 0.88,
  '四苯甲烷：交叉 ' + tpm.crossings + '、最短 ' + tpm.minNonBond.toFixed(2) + '（旧版 2 / 0.38）')

// 大环识别：12-冠-4 是 15 元环，旧版 path.length>12 直接不算环
const crown = metrics('C1COCCOCCOCCOCCO1')
ok(crown.ok && crown.rings.length === 1 && crown.rings[0] === 15,
  '12-冠-4 识别为 15 元环（实际 ' + JSON.stringify(crown.rings) + '）')
ok(crown.crossings === 0, '冠醚无键交叉')

// ---------- 2. 环系朝向：稠环必须摆平 ----------
function centersOf(smi) {
  const g = buildPrimitives(smi).graph
  return g.rings.map(r => {
    const ps = r.atoms.map(a => g.pos[a])
    return {
      n: r.atoms.length,
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      y: ps.reduce((s, p) => s + p.y, 0) / ps.length
    }
  })
}

const naft = centersOf('c1ccc2ccccc2c1')
ok(Math.abs(Math.abs(naft[0].y - naft[1].y)) < 0.02,
  '萘的两个环心同高（横排），差值 ' + Math.abs(naft[0].y - naft[1].y).toFixed(3))
ok(Math.abs(Math.abs(naft[0].x - naft[1].x) - Math.sqrt(3)) < 0.06,
  '萘的环心距 = √3 键长（稠合边共享），实际 ' + Math.abs(naft[0].x - naft[1].x).toFixed(3))

const ant = centersOf('c1ccc2cc3ccccc3cc2c1')
const antX = ant.map(c => c.x).sort((a, b) => a - b)
ok(Math.abs(ant[0].y - ant[1].y) < 0.02 && Math.abs(ant[1].y - ant[2].y) < 0.02,
  '蒽的三个环心共线且水平（旧版画成斜楼梯）')
ok(Math.abs((antX[1] - antX[0]) - (antX[2] - antX[1])) < 0.06,
  '蒽的环心等距，实际 ' + (antX[1] - antX[0]).toFixed(3) + ' / ' + (antX[2] - antX[1]).toFixed(3))

const phe = centersOf('c1ccc2c(c1)ccc1ccccc12')
// 菲是"弯"的三环：中间环与两个外侧环各成 60°，环心夹角 120°
const pv1 = { x: phe[0].x - phe[1].x, y: phe[0].y - phe[1].y }
const pv2 = { x: phe[2].x - phe[1].x, y: phe[2].y - phe[1].y }
const pn1 = Math.hypot(pv1.x, pv1.y)
const pn2 = Math.hypot(pv2.x, pv2.y)
const pcos = (pv1.x * pv2.x + pv1.y * pv2.y) / (pn1 * pn2)
ok(Math.abs(pn1 - Math.sqrt(3)) < 0.06 && Math.abs(pn2 - Math.sqrt(3)) < 0.06,
  '菲的相邻环心距都是 √3（稠合边共享），实际 ' + pn1.toFixed(3) + ' / ' + pn2.toFixed(3))
ok(Math.abs(pcos + 0.5) < 0.08, '菲中间环与两侧环成 120°（弯而不直），cos=' + pcos.toFixed(3))

const ster = centersOf('CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C')
const sterW = Math.max(...ster.map(c => c.x)) - Math.min(...ster.map(c => c.x))
const sterH = Math.max(...ster.map(c => c.y)) - Math.min(...ster.map(c => c.y))
ok(sterW > sterH * 1.2, '甾体四环横向铺开（宽 ' + sterW.toFixed(2) + ' 高 ' + sterH.toFixed(2) + '）')

// ---------- 3. 凯库勒：双键数与圆圈 ----------
function kekule(smi) {
  const g = buildPrimitives(smi).graph
  return { dbl: g.order.filter(o => o === 2).length, circles: g.circles.length }
}
ok(kekule('c1ccccc1').dbl === 3, '苯 3 根双键')
ok(kekule('c1ccc2ccccc2c1').dbl === 5, '萘 5 根双键')
const kAnt = kekule('c1ccc2cc3ccccc3cc2c1')
ok(kAnt.dbl === 7, '蒽 7 根双键（旧版第三环退化成圆圈）')
ok(kAnt.circles === 0, '蒽不出现芳香圆圈（全环系统统一凯库勒）')
ok(kekule('c1ccc2c(c1)ccc1ccccc12').dbl === 7, '菲 7 根双键')
ok(kekule('c1nc2[nH]cnc2c(=O)[nH]1').dbl === 4, '嘌呤 4 根双键（含 [nH] 不带双键）')
ok(kekule('C1CCCCC1').dbl === 0, '环己烷没有双键')

// ---------- 4. 布局耗时（笔上 QuickJS 也按同一量级） ----------
const t0 = Date.now()
for (let i = 0; i < 20; i++) buildPrimitives('CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C')
const per = (Date.now() - t0) / 20
ok(per < 120, '胆固醇布局 ' + per.toFixed(1) + 'ms/次（上限 120ms）')

// 扭转优化会多跑几十次代价评估，难例也不能超时
const t1 = Date.now()
for (let i = 0; i < 10; i++) buildPrimitives('c1ccccc1C(c1ccccc1)(c1ccccc1)c1ccccc1')
const per2 = (Date.now() - t1) / 10
ok(per2 < 150, '四苯甲烷布局 ' + per2.toFixed(1) + 'ms/次（上限 150ms）')

console.log(fail === 0 ? '\nOK  layout_metrics_test ' + pass + ' 项全部通过' : '\nFAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
