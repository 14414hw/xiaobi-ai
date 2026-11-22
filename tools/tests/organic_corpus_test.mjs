// 有机物语料回归：85+ 个分子，逐条比对「解析出的分子式 vs 已知分子式」。
// 这是最硬的化学正确性检查——解析器的隐式氢/芳香/电荷处理错一个，分子式就对不上。
// 顺带检查：审计误报、键交叉、标签重叠、布局耗时。
import { inspectSmiles, buildPrimitives } from '../../src/utils/mol.js'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) { pass++; console.log('ok    ' + msg) }
  else { fail++; console.log('FAIL  ' + msg) }
}

// [名称, SMILES, 已知分子式]
const corpus = [
  // ---- 烷烃 / 烯烃 / 炔烃 ----
  ['甲烷', 'C', 'CH4'],
  ['乙烷', 'CC', 'C2H6'],
  ['丙烷', 'CCC', 'C3H8'],
  ['异丁烷', 'CC(C)C', 'C4H10'],
  ['新戊烷', 'CC(C)(C)C', 'C5H12'],
  ['十六烷', 'CCCCCCCCCCCCCCCC', 'C16H34'],
  ['乙烯', 'C=C', 'C2H4'],
  ['丙烯', 'CC=C', 'C3H6'],
  ['2-甲基丙烯', 'C=C(C)C', 'C4H8'],
  ['1,3-丁二烯', 'C=CC=C', 'C4H6'],
  ['异戊二烯', 'C=C(C)C=C', 'C5H8'],
  ['乙炔', 'C#C', 'C2H2'],
  ['1-丁炔', 'CCC#C', 'C4H6'],
  ['2-丁炔', 'CC#CC', 'C4H6'],
  // ---- 脂环 / 桥环 ----
  ['环戊烷', 'C1CCCC1', 'C5H10'],
  ['环己烷', 'C1CCCCC1', 'C6H12'],
  ['环己烯', 'C1=CCCCC1', 'C6H10'],
  ['十氢萘', 'C1CCC2CCCCC2C1', 'C10H18'],
  ['降冰片烷', 'C1CC2CCC1C2', 'C7H12'],
  ['樟脑', 'CC1(C)C2CCC1(C)C(=O)C2', 'C10H16O'],
  ['螺[4.5]癸烷', 'C1CCC2(C1)CCCCC2', 'C10H18'],
  ['螺[5.5]十一烷', 'C1CCC2(CC1)CCCCC2', 'C11H20'],
  // ---- 芳烃 ----
  ['苯', 'c1ccccc1', 'C6H6'],
  ['甲苯', 'Cc1ccccc1', 'C7H8'],
  ['邻二甲苯', 'Cc1ccccc1C', 'C8H10'],
  ['苯乙烯', 'C=Cc1ccccc1', 'C8H8'],
  ['萘', 'c1ccc2ccccc2c1', 'C10H8'],
  ['联苯', 'c1ccc(cc1)c1ccccc1', 'C12H10'],
  ['蒽', 'c1ccc2cc3ccccc3cc2c1', 'C14H10'],
  ['菲', 'c1ccc2c(c1)ccc1ccccc12', 'C14H10'],
  // ---- 醌 / 酚 ----
  ['对苯二酚', 'Oc1ccc(O)cc1', 'C6H6O2'],
  ['苯醌', 'O=C1C=CC(=O)C=C1', 'C6H4O2'],
  ['萘醌', 'O=C1C=CC(=O)c2ccccc21', 'C10H6O2'],
  ['蒽醌', 'O=C1c2ccccc2C(=O)c2ccccc21', 'C14H8O2'],
  // ---- 卤代烃 ----
  ['氯乙烷', 'CCCl', 'C2H5Cl'],
  ['溴乙烷', 'CCBr', 'C2H5Br'],
  ['氯苯', 'Clc1ccccc1', 'C6H5Cl'],
  ['氯乙烯', 'C=CCl', 'C2H3Cl'],
  ['四氟乙烯', 'FC(F)=C(F)F', 'C2F4'],
  // ---- 醇 / 醚 ----
  ['甲醇', 'CO', 'CH4O'],
  ['乙醇', 'CCO', 'C2H6O'],
  ['乙二醇', 'OCCO', 'C2H6O2'],
  ['丙三醇', 'OCC(O)CO', 'C3H8O3'],
  ['苯酚', 'Oc1ccccc1', 'C6H6O'],
  ['苯甲醇', 'OCc1ccccc1', 'C7H8O'],
  ['环己醇', 'OC1CCCCC1', 'C6H12O'],
  ['乙醚', 'CCOCC', 'C4H10O'],
  ['苯甲醚', 'COc1ccccc1', 'C7H8O'],
  ['环氧乙烷', 'C1CO1', 'C2H4O'],
  ['四氢呋喃', 'C1CCOC1', 'C4H8O'],
  ['1,4-二氧六环', 'C1COCCO1', 'C4H8O2'],
  ['12-冠-4', 'C1COCCOCCOCCO1', 'C8H16O4'],
  ['15-冠-5', 'C1COCCOCCOCCOCCO1', 'C10H20O5'],
  // ---- 醛 / 酮 ----
  ['甲醛', 'C=O', 'CH2O'],
  ['乙醛', 'CC=O', 'C2H4O'],
  ['苯甲醛', 'O=Cc1ccccc1', 'C7H6O'],
  ['丙酮', 'CC(C)=O', 'C3H6O'],
  ['苯乙酮', 'CC(=O)c1ccccc1', 'C8H8O'],
  ['环己酮', 'O=C1CCCCC1', 'C6H10O'],
  // ---- 羧酸 ----
  ['甲酸', 'OC=O', 'CH2O2'],
  ['乙酸', 'CC(=O)O', 'C2H4O2'],
  ['苯甲酸', 'OC(=O)c1ccccc1', 'C7H6O2'],
  ['草酸', 'OC(=O)C(=O)O', 'C2H2O4'],
  ['丙烯酸', 'OC(=O)C=C', 'C3H4O2'],
  ['肉桂酸', 'O=C(O)C=Cc1ccccc1', 'C9H8O2'],
  ['邻苯二甲酸', 'OC(=O)c1ccccc1C(=O)O', 'C8H6O4'],
  ['水杨酸', 'Oc1ccccc1C(=O)O', 'C7H6O3'],
  ['柠檬酸', 'OC(=O)CC(O)(CC(=O)O)C(=O)O', 'C6H8O7'],
  // ---- 酯 / 酰胺 ----
  ['乙酸乙酯', 'CCOC(C)=O', 'C4H8O2'],
  ['甲基丙烯酸甲酯', 'C=C(C)C(=O)OC', 'C5H8O2'],
  ['乙酰胺', 'CC(N)=O', 'C2H5NO'],
  ['阿司匹林', 'CC(=O)Oc1ccccc1C(=O)O', 'C9H8O4'],
  ['对乙酰氨基酚', 'CC(=O)Nc1ccc(O)cc1', 'C8H9NO2'],
  ['青霉素G', 'CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O', 'C16H18N2O4S'],
  ['阿莫西林', 'CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O', 'C16H19N3O5S'],
  // ---- 胺 / 硝基 / 腈 ----
  ['苯胺', 'Nc1ccccc1', 'C6H7N'],
  ['乙二胺', 'NCCN', 'C2H8N2'],
  ['多巴胺', 'NCCc1ccc(O)c(O)c1', 'C8H11NO2'],
  ['烟碱', 'CN1CCCC1c1cccnc1', 'C10H14N2'],
  ['硝基甲烷', 'C[N+](=O)[O-]', 'CH3NO2'],
  ['硝基苯', '[O-][N+](=O)c1ccccc1', 'C6H5NO2'],
  ['TNT', 'Cc1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]', 'C7H5N3O6'],
  ['苦味酸', 'Oc1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]', 'C6H3N3O7'],
  ['丙烯腈', 'C=CC#N', 'C3H3N'],
  ['尿素', 'NC(N)=O', 'CH4N2O'],
  // ---- 杂环 ----
  ['吡啶', 'c1ccncc1', 'C5H5N'],
  ['吡咯', 'c1cc[nH]c1', 'C4H5N'],
  ['呋喃', 'c1ccoc1', 'C4H4O'],
  ['噻吩', 'c1ccsc1', 'C4H4S'],
  ['咪唑', 'c1cnc[nH]1', 'C3H4N2'],
  ['嘧啶', 'c1cncnc1', 'C4H4N2'],
  ['吲哚', 'c1ccc2[nH]ccc2c1', 'C8H7N'],
  ['喹啉', 'c1ccc2ncccc2c1', 'C9H7N'],
  ['嘌呤', 'c1ncnc2[nH]cnc12', 'C5H4N4'],
  ['次黄嘌呤', 'c1nc2[nH]cnc2c(=O)[nH]1', 'C5H4N4O'],
  ['黄嘌呤', 'O=c1[nH]c(=O)c2[nH]cnc2[nH]1', 'C5H4N4O2'],
  ['尿酸', 'O=c1[nH]c(=O)c2[nH]c(=O)[nH]c2[nH]1', 'C5H4N4O3'],
  ['咖啡因', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'C8H10N4O2'],
  // ---- 氨基酸 ----
  ['甘氨酸', 'NCC(=O)O', 'C2H5NO2'],
  ['丙氨酸', 'CC(N)C(=O)O', 'C3H7NO2'],
  ['苯丙氨酸', 'N[C@@H](Cc1ccccc1)C(=O)O', 'C9H11NO2'],
  ['色氨酸', 'N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O', 'C11H12N2O2'],
  ['谷氨酸', 'N[C@@H](CCC(=O)O)C(=O)O', 'C5H9NO4'],
  ['赖氨酸', 'NCCCCC(N)C(=O)O', 'C6H14N2O2'],
  ['甘氨酸两性离子', '[NH3+]CC(=O)[O-]', 'C2H5NO2'],
  // ---- 糖 / 维生素 ----
  ['葡萄糖', 'OCC1OC(O)C(O)C(O)C1O', 'C6H12O6'],
  ['果糖', 'OCC(O)C(O)C(O)C(=O)CO', 'C6H12O6'],
  ['核糖', 'OCC1OC(O)C(O)C1O', 'C5H10O5'],
  ['维生素C', 'OCC(O)[C@H]1OC(=O)C(O)=C1O', 'C6H8O6'],
  ['胆固醇', 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', 'C27H46O'],
  ['布洛芬', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'C13H18O2'],
  // ---- 离子 / 多组分 ----
  ['水', 'O', 'H2O'],
  ['水二聚体', 'O.O', 'H4O2'],
  ['乙酸钠', 'CC(=O)[O-].[Na+]', 'C2H3NaO2'],
  ['铵根', '[NH4+]', 'H4N'],
  // ---- 扩展结构（2026-11-21）：手性楔形 / 同位素 / 配合物 / 聚合物 ----
  ['乳酸(手性@)', 'C[C@H](O)C(=O)O', 'C3H6O3'],
  ['乳酸(手性@@)', 'C[C@@H](O)C(=O)O', 'C3H6O3'],
  ['L-丙氨酸(手性)', 'C[C@@H](N)C(=O)O', 'C3H7NO2'],
  ['13C甲烷', '[13CH4]', 'CH4'],
  ['18O水', '[18O]([H])[H]', 'H2O'],
  ['四氨合铜', '[Cu](N)(N)(N)N', 'H12CuN4'],
  ['氢氧化铜', '[Cu](O)(O)', 'H2CuO2'],
  ['聚乙烯片段', '*CC*', 'C2H4'],
  ['聚苯撑', '*c1ccccc1*', 'C6H4'],
  ['聚苯乙烯', '*CC(c1ccccc1)*', 'C8H8']
]

// ---------- 结构库全量并入（自动同步，按名称去重） ----------
// molLib 每次扩容自动进入语料回归：分子式比对 + 渲染 + 几何指标。
// 库条目以 (name, smiles, formula) 形式并入；手写语料优先（同名单词以手写为准）。
import { MOL_LIB } from '../../src/utils/molLib.js'
const seen = new Set(corpus.map(c => c[0]))
for (const e of MOL_LIB) {
  if (seen.has(e.name)) continue
  seen.add(e.name)
  corpus.push([e.name, e.smiles, e.formula])
}

// ---------- 分子式逐条比对 ----------
let issueHits = []
for (const [name, smi, want] of corpus) {
  const chk = inspectSmiles(smi)
  if (!chk.ok) { ok(false, name + ' 可以解析（' + chk.reason + '）'); continue }
  ok(chk.formula === want, name + ' 分子式 ' + chk.formula + '（应为 ' + want + '）')
  if (chk.issues.length) issueHits.push(name + ': ' + chk.issues.join('；'))
}

// ---------- 全语料渲染与几何指标 ----------
// 桥环（樟脑/降冰片烷）在 2D 画法里桥原子本来就贴得近，0.70 是合理下限
const FLOORS = { '樟脑': 0.70, '降冰片烷': 0.70 }
import { metrics } from '../../tools/molmetrics.mjs'
for (const [name, smi] of corpus) {
  const geo = buildPrimitives(smi)
  if (!geo) { ok(false, name + ' 可以渲染'); continue }
  const m = metrics(smi)
  if (!m.ok) continue
  const floor = FLOORS[name] || 0.85
  ok(m.crossings === 0, name + ' 无键交叉（' + m.crossings + '）')
  ok(m.overlap === 0, name + ' 无标签重叠（' + m.overlap + '）')
  ok(m.minNonBond >= floor, name + ' 非键不叠（' + m.minNonBond.toFixed(2) + '）')
  ok(m.cv <= 0.15, name + ' 键长一致（CV ' + m.cv.toFixed(3) + '）')
}

// ---------- 耗时 ----------
const t0 = Date.now()
for (let i = 0; i < 10; i++) {
  for (const [, smi] of corpus) buildPrimitives(smi)
}
const per = (Date.now() - t0) / (10 * corpus.length)
ok(per < 60, '平均布局 ' + per.toFixed(1) + 'ms/分子（上限 60ms）')

if (issueHits.length) {
  console.log('\n审计提示（可能是误报，逐条核对）：')
  for (const s of issueHits) console.log('  · ' + s)
}
console.log(fail === 0 ? '\nOK  organic_corpus_test ' + pass + ' 项全部通过' : '\nFAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
