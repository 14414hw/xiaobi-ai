// 化学审计 + 结构库测试（2026-11-21）
//
// 守住四件事：
//   1) 价态/芳香性审计不误报常见分子（呋喃、噻吩、吡咯、硫酸）
//   2) 真错误能报出来（五价碳、环戊二烯负离子式的 5π 环）
//   3) 分子式归一化与比对正确（下标、元素顺序）
//   4) 结构库里每一条 SMILES 的分子式都与表里写的一致，且能画出来
//
// 用法：node penai/tools/tests/chem_audit_test.mjs
import { inspectSmiles } from '../../src/utils/mol.js'
import { molInfo } from '../../src/utils/mol.js'
import { normalizeFormula, auditMolecule } from '../../src/utils/chemAudit.js'
import { MOL_LIB, lookupMol } from '../../src/utils/molLib.js'
import { buildMolRows, extractMols, looksLikeFormula } from '../../src/utils/molsRender.js'

let fail = 0
function ok(cond, msg) {
  if (cond) console.log('ok    ' + msg)
  else { fail++; console.log('FAIL  ' + msg) }
}

function infoOf(smiles) {
  var c = inspectSmiles(smiles)
  if (!c.ok) return null
  return { formula: c.formula, issues: c.issues, graph: c.graph, atoms: c.graph.atoms.length }
}

// ---- 1. 常见分子不应误报 ----
var clean = [
  ['c1ccccc1', 'C6H6', '苯'],
  ['Oc1ccccc1', 'C6H6O', '苯酚'],
  ['c1ccoc1', 'C4H4O', '呋喃'],
  ['c1ccsc1', 'C4H4S', '噻吩'],
  ['c1cc[nH]c1', 'C4H5N', '吡咯'],
  ['c1ccncc1', 'C5H5N', '吡啶'],
  ['c1c[nH]cn1', 'C3H4N2', '咪唑'],
  ['O=S(=O)(O)O', 'H2O4S', '硫酸'],
  ['CC(=O)O', 'C2H4O2', '乙酸'],
  ['O=[N+]([O-])c1ccccc1', 'C6H5NO2', '硝基苯'],
  ['CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O', 'C16H19N3O5S', '阿莫西林']
]
for (var i = 0; i < clean.length; i++) {
  var c = clean[i]
  var inf = infoOf(c[0])
  ok(!!inf, c[2] + ' 能解析')
  if (!inf) continue
  ok(inf.formula === c[1], c[2] + ' 分子式 ' + c[1] + '，实际 ' + inf.formula)
  ok(inf.issues.length === 0, c[2] + ' 无审计问题' + (inf.issues.length ? '：' + inf.issues.join('；') : ''))
}

// ---- 2. 真错误要报 ----
var bad1 = infoOf('C(C)(C)(C)(C)C') // 五价碳
ok(!!bad1 && bad1.issues.join('|').indexOf('价态异常') >= 0, '五价碳被报出来：' + (bad1 ? bad1.issues.join('；') : '解析失败'))

var bad2 = infoOf('c1cccc1') // 5 个碳的芳香环，5π
ok(!!bad2 && bad2.issues.join('|').indexOf('4n+2') >= 0, '5π 芳香环被报出来：' + (bad2 ? bad2.issues.join('；') : '解析失败'))

// ---- 3. 分子式归一化 ----
ok(normalizeFormula('C₆H₆O') === 'C6H6O', '下标归一化 C₆H₆O → C6H6O')
ok(normalizeFormula('H6C6O') === 'C6H6O', '元素顺序归一化 H6C6O → C6H6O')
ok(normalizeFormula('C6H6O·H2O') === 'C6H6O', '结晶水不参与比对')
ok(normalizeFormula('乱写') === '', '非法分子式返回空串')

// ---- 4. 名称 ↔ 结构 ----
var phenol = infoOf('Oc1ccccc1')
var benzene = infoOf('c1ccccc1')
var ether = infoOf('COC')
ok(auditMolecule(phenol, '苯酚', 'C6H6O', false).ok, '苯酚：结构/分子式/名称一致')
var a1 = auditMolecule(benzene, '苯酚', 'C6H6', false)
ok(!a1.ok && a1.issues.join('|').indexOf('酚') >= 0, '苯环冒充苯酚被名称规则抓住：' + a1.issues.join('；'))
var a2 = auditMolecule(benzene, '苯酚', 'C6H6O2', false)
ok(!a2.ok && a2.issues.join('|').indexOf('分子式不一致') >= 0, '分子式不一致被报出：' + a2.issues.join('；'))
var a3 = auditMolecule(ether, '乙醇', '', false)
ok(!a3.ok && a3.issues.join('|').indexOf('醇') >= 0, '二甲醚冒充乙醇被抓住：' + a3.issues.join('；'))

// ---- 5. 结构库自检 ----
var libBad = 0
for (var j = 0; j < MOL_LIB.length; j++) {
  var e = MOL_LIB[j]
  var inf2 = infoOf(e.smiles)
  if (!inf2) { libBad++; console.log('FAIL  库 ' + e.name + ' 解析失败：' + e.smiles); continue }
  var want = normalizeFormula(e.formula)
  if (!want || inf2.formula !== want) {
    libBad++
    console.log('FAIL  库 ' + e.name + ' 分子式表里 ' + e.formula + '，按 SMILES 算是 ' + inf2.formula)
  }
  var mi = molInfo(e.smiles, '#eef2fa', 300, 110)
  if (!mi) { libBad++; console.log('FAIL  库 ' + e.name + ' 画不出来') }
}
ok(libBad === 0, '结构库 ' + MOL_LIB.length + ' 条全部通过分子式/可渲染自检')

ok(lookupMol('醋酸') && lookupMol('醋酸').name === '乙酸', '别名 醋酸 → 乙酸')
ok(lookupMol('苯') && lookupMol('苯').name === '苯', '「苯」精确命中苯，不会被苯甲酸抢走')
ok(!lookupMol('苯甲'), '不做前缀匹配')

// ---- 5b. 用户实拍报障（2026-11-21）：苄青霉素被标「分子式不一致」 ----
// 模型原样输出的 SMILES 把噻唑烷环写成了六元环（S 之后多一个 CH2），
// 所以按图算 C17H20N2O4S 是正确结论——校验没有误判，错的是模型的结构。
// 收进结构库后名称命中即以库为准，直接渲染标准结构、不再报警。
var PENI_WRONG = 'CC1(C)[C@H](C(=O)O)N2C(=O)[C@@H](NC(=O)Cc3ccccc3)C2SC1'
var pw = infoOf(PENI_WRONG)
ok(!!pw && pw.formula === 'C17H20N2O4S', '模型错写的苄青霉素按图算是 C17H20N2O4S（多一个 CH2），实际 ' + (pw ? pw.formula : '解析失败'))
var libPeni = lookupMol('青霉素G（苄青霉素）')
ok(!!libPeni && libPeni.name === '青霉素G', '组合标签「青霉素G（苄青霉素）」可命中结构库')
ok(!!libPeni && infoOf(libPeni.smiles).formula === 'C16H18N2O4S', '库里的苄青霉素 SMILES 算出 C16H18N2O4S')
ok(lookupMol('苄青霉素') && lookupMol('苄青霉素').name === '青霉素G', '别名 苄青霉素 → 青霉素G')
var gPeni = buildMolRows([{ smiles: PENI_WRONG, label: '青霉素G（苄青霉素）', formula: 'C16H18N2O4S' }], 1)
ok(gPeni.rows.length === 1 && gPeni.issues.length === 0, '库命中后不再报分子式不一致' + (gPeni.issues.length ? '：' + gPeni.issues.join('；') : ''))
ok(gPeni.rows[0][0].label === '青霉素G', '图注改用库里的标准名，实际 ' + (gPeni.rows[0][0] && gPeni.rows[0][0].label))

// ---- 6. 库优先 + 失败兜底 ----
var g1 = buildMolRows([{ smiles: 'c1ccccc1', label: '苯酚', formula: 'C6H6O' }], 1)
ok(g1.rows.length === 1 && g1.issues.length === 0, '名称命中库时以库为准（苯环 SMILES 被换成苯酚）')
var g2 = buildMolRows([{ smiles: 'C'.repeat(101), label: '某长链', formula: '' }], 1)
ok(g2.rows.length === 0 && g2.failed.length === 1, '超 100 原子进 failed 而不是静默消失')
ok(g2.failed[0].reason.indexOf('100') >= 0, '失败原因可读：' + (g2.failed[0] && g2.failed[0].reason))
var g2b = buildMolRows([{ smiles: 'C'.repeat(61), label: '长链61', formula: '' }], 1)
ok(g2b.rows.length === 1, '61 原子长链仍可画（上限已放宽到 100）')
var g3 = buildMolRows([{ smiles: 'Oc1ccccc1', label: '苯酚', formula: 'C6H6O2' }], 1)
ok(g3.rows.length === 1 && g3.issues.length > 0, '分子式写错时仍出图但带警告：' + g3.issues.join('；'))

// ---- 7. 提取器：分子式可选，且不吞普通词 ----
var ex1 = extractMols('说明\n@//smiles/ Oc1ccccc1 苯酚 C6H6O\n结束')
ok(ex1.mols.length === 1 && ex1.mols[0].label === '苯酚' && ex1.mols[0].formula === 'C6H6O',
  '@//smiles/ 四段式解析出 名称+分子式：' + JSON.stringify(ex1.mols[0]))
var ex2 = extractMols('@//smiles/ Oc1ccccc1 苯酚')
ok(ex2.mols.length === 1 && ex2.mols[0].label === '苯酚' && ex2.mols[0].formula === '',
  '分子式可省略，旧三段式仍然兼容：' + JSON.stringify(ex2.mols[0]))
ok(looksLikeFormula('C6H6O') && looksLikeFormula('C₆H₆O'), '合法分子式识别（含下标）')
ok(!looksLikeFormula('COX') && !looksLikeFormula('苯酚'), '缩写/中文不会被当成分子式')

// ---- 8. 提示行必须在结构图上方（280px 屏，图 130px 一放就折到下面） ----
import { readFileSync } from 'fs'
for (const pg of ['chat/chat.vue', 'history/history.vue']) {
  const src = readFileSync(new URL('../../src/pages/' + pg, import.meta.url), 'utf8')
  const iIss = src.indexOf('结构校验：{{ molWarnText(m) }}')
  const iFail = src.indexOf('未绘制：{{ molFailText(m) }}')
  const iRow = src.indexOf('in m.molRows', iIss > 0 ? iIss - 900 : 0)
  ok(iIss > 0 && iFail > 0, pg + ' 有结构校验/未绘制两行')
  ok(iIss < iRow || iRow < 0, pg + ' 校验提示排在结构图之前（否则会被输入栏挡住）')
}

// ---- 9. 复杂结构回归（2026-11-21 实测两轮：稠环/笼状/大环/金属/带电） ----
// 断言口径与 App 一致：期望值先过 normalizeFormula，再与按图算出的分子式比对。
var CMPLX = [
  ['胆固醇', 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', 'C27H46O'],
  ['蔗糖', 'C(C1C(C(C(C(O1)OC2(C(C(C(O2)CO)O)O)CO)O)O)O)O', 'C12H22O11'],
  ['金刚烷', 'C1C2CC3CC1CC(C2)C3', 'C10H16'],
  ['立方烷', 'C12C3C4C1C5C2C3C45', 'C8H8'],
  ['降冰片烷(桥环)', 'C1CC2CCC1C2', 'C7H12'],
  ['18-冠-6', 'C1COCCOCCOCCOCCOCCO1', 'C12H24O6'],
  ['20元大环(%10环号)', 'C%10CCCCCCCCCCCCCCCCCCC%10', 'C20H40'],
  ['螺[4.5]癸烷', 'C1CCC2(CC1)CCCC2', 'C10H18'],
  ['睾酮', 'CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C', 'C19H28O2'],
  ['三硬脂酸甘油酯', 'CCCCCCCCCCCCCCCCCC(=O)OCC(OC(=O)CCCCCCCCCCCCCCCCC)COC(=O)CCCCCCCCCCCCCCCCC', 'C57H110O6'],
  ['纤维素重复单元', '*C1OC(CO)C(O)C(O)C1O*', 'C6H10O5'],
  ['甘氨酸两性离子', '[NH3+]CC(=O)[O-]', 'C2H5NO2'],
  ['三聚氰胺', 'Nc1nc(N)nc(N)n1', 'C3H6N6'],
  ['尿酸', 'O=C1NC(=O)C2=C(N1)NC(=O)N2', 'C5H4N4O3'],
  ['腺嘌呤', 'Nc1ncnc2[nH]cnc12', 'C5H5N5'],
  ['叠氮苯', '[N-]=[N+]=Nc1ccccc1', 'C6H5N3'],
  ['过氧乙酸', 'CC(=O)OO', 'C2H4O3'],
  ['13C标记乙酸', '[13CH3]C(=O)O', 'C2H4O2'],
  ['硫酸铵', '[NH4+].[NH4+].[O-]S(=O)(=O)[O-]', 'H8N2O4S'],
  ['重铬酸铵', '[NH4+].[NH4+].[O-][Cr](=O)(=O)O[Cr](=O)(=O)[O-]', 'H8Cr2N2O7']
]
var cmpBad = 0
for (var c9 = 0; c9 < CMPLX.length; c9++) {
  var nm = CMPLX[c9][0], sm = CMPLX[c9][1], exp = normalizeFormula(CMPLX[c9][2])
  var rr = inspectSmiles(sm)
  if (!rr || !rr.ok) { cmpBad++; console.log('FAIL  ' + nm + ' 解析失败'); continue }
  if (!exp || rr.formula !== exp) { cmpBad++; console.log('FAIL  ' + nm + ' 分子式 ' + rr.formula + '，期望 ' + exp); continue }
  if (rr.issues.length) { cmpBad++; console.log('FAIL  ' + nm + ' 误报：' + rr.issues.join('；')); continue }
  if (!molInfo(sm, '#eef2fa', 860, 110)) { cmpBad++; console.log('FAIL  ' + nm + ' 布局失败'); continue }
}
ok(cmpBad === 0, '复杂结构 ' + CMPLX.length + ' 例：分子式一致、无审计误报、可渲染')

// 9b. 带电芳香环的 π 计数（实测误报点：环戊二烯负离子被算成 5π）
ok(inspectSmiles('[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1').issues.length === 0, '二茂铁（两个环戊二烯负离子）不再误报 4n+2')
ok(inspectSmiles('[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1').formula === 'C10H10Fe', '二茂铁分子式 C10H10Fe')
ok(inspectSmiles('c1cc[nH+]cc1').issues.length === 0, '吡啶鎓 [nH+] 为 6π，不误报')
ok(inspectSmiles('[cH+]1cccccc1').issues.length === 0, '环庚三烯正离子为 6π，不误报')
ok(inspectSmiles('[cH-]1cccc1').issues.length === 0, '环戊二烯负离子为 6π，不误报')
// 9c. 带负电的硫（硫氰酸根 S-，只有 1 根键）
ok(inspectSmiles('[S-]C#N').issues.length === 0, '硫氰酸根 S- 不再误报价态')
// 9d. 元素表覆盖：含 Cr/Co/Ni 等的分子式必须能参与比对（旧表直接判非法）
ok(normalizeFormula('H8Cr2N2O7') === 'H8Cr2N2O7', '含 Cr 分子式可归一（配合物/重铬酸盐可校验）')
ok(normalizeFormula('C4H6CoO4') === 'C4H6CoO4', '含 Co 分子式可归一')
ok(normalizeFormula('NiCl2') === 'Cl2Ni', '含 Ni 分子式可归一（无碳按元素字母序）')
// 9e. 无碳化合物沿用教材口径（H 在前），与模型声明值比对不会误判
ok(normalizeFormula('Cl2H6N2Pt') === inspectSmiles('N.N.Cl[Pt]Cl').formula, '顺铂：教材写法和引擎写法归一到同一串')

console.log(fail === 0 ? 'OK  chem_audit_test 全部通过' : 'FAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
