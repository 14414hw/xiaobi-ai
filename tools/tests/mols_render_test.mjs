// 结构式渲染共用层回归：SMILES 提取、大分子单列放大、历史页清洗
// 用法：node tools/tests/mols_render_test.mjs
//
// 背景（用户实拍报障 2026-11-20）：
//   1) 复杂有机物（阿莫西林克拉维酸钾）结构图显示很小 —— 旧策略两列 300x108
//      把 25 原子的阿莫西林压到 4.5px 标签字高
//   2) 历史对话里结构简式直接显示成 SMILES 代码 —— 历史页只走 plainify，
//      plainify 按设计原样保留 @smiles 行
import { extractMols, buildMolRows } from '../../src/utils/molsRender.js'
import { buildPrimitives, molInfo } from '../../src/utils/mol.js'
import { plainify } from '../../src/utils/api.js'

let bad = 0
function ok(cond, msg) {
  if (!cond) { console.log('FAIL ' + msg); bad++ }
  else console.log('ok   ' + msg)
}

// 阿莫西林 / 克拉维酸（用户询问的两种药）
const AMOX = 'CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O'
const CLAV = 'CC1(C)[C@H]2CC(=O)N2[C@@H]1C(=O)O'

// ---- 1. 提示词格式提取 ----
const answer = [
  '阿莫西林克拉维酸钾是复方制剂，两个成分的结构如下。',
  '@//smiles/ ' + AMOX + ' 阿莫西林',
  '@//smiles/ ' + CLAV + ' 克拉维酸',
  '两者联用可扩大抗菌谱。'
].join('\n')
const ex = extractMols(answer)
ok(ex.mols.length === 2, '提取出 2 个结构，实际 ' + ex.mols.length)
ok(ex.mols[0].smiles === AMOX, '第一个结构是阿莫西林 SMILES')
ok(ex.mols[0].label === '阿莫西林', '标签取到中文名，实际 "' + ex.mols[0].label + '"')
ok(ex.text.indexOf('smiles') < 0, '正文里不再残留 @smiles 标记')
ok(ex.text.indexOf('CC1(C)S') < 0, '正文里不再残留 SMILES 代码')
ok(ex.text.indexOf('复方制剂') > 0, '正文说明文字保留')

// ---- 2. 历史页路径：extractMols 后再 plainify，不能还原出 SMILES ----
const hist = plainify(ex.text)
ok(hist.indexOf('CC1') < 0 && hist.indexOf('smiles') < 0, '历史页清洗后无 SMILES 代码/标记')

// ---- 3. 大分子走单列放大，标签像素达可读下限 ----
const rows = buildMolRows(ex.mols, 3)
ok(rows.cols === 1, '大分子单列渲染（旧版两列 300x108）')
// 高度硬约束：936x280 屏上顶栏58 + AI头25 + 输入栏60，消息区仅剩约 135px。
// 旧版 860x230 把分子下半（苯环）推到输入栏下方，看起来像「环丢失」。
ok(rows.boxW === 860 && rows.boxH <= 112, '复杂分子框宽 860、高不超 112（实际 ' + rows.boxW + 'x' + rows.boxH + '）')
ok(rows.rows.length === 2 && rows.rows[0].length === 1, '一行一个分子')
// 标签像素 = fs * 缩放比。用 molInfo 同参数反推屏幕上的标签高度
const geoA = buildPrimitives(AMOX, { color: '#fff' })
const infoA = molInfo(AMOX, '#fff', rows.boxW, rows.boxH)
const scaleA = Math.min(rows.boxW / (geoA.bbox.w + 0.56), rows.boxH / (geoA.bbox.h + 0.56))
const labelPx = geoA.fs * scaleA
ok(labelPx >= 8, '阿莫西林标签字高 ' + labelPx.toFixed(1) + 'px >= 8px（旧版 4.5px）')
ok(infoA && infoA.w <= rows.boxW && infoA.h <= rows.boxH, '结构图不超框')
ok(infoA.atoms === 25, '阿莫西林解析出 25 个原子，实际 ' + infoA.atoms)

// ---- 4. 简单分子不撑满屏宽 ----
const small = buildMolRows([{ smiles: 'c1ccccc1O', label: '苯酚' }], 3)
ok(small.boxW === 420 && small.boxH <= 110, '单个小分子用 420x<=110 中等框，实际 ' + small.boxW + 'x' + small.boxH)
const three = buildMolRows([
  { smiles: 'c1ccccc1O', label: '苯酚' },
  { smiles: 'CCO', label: '乙醇' },
  { smiles: 'CC(=O)O', label: '乙酸' }
], 3)
ok(three.cols === 3, '三个小分子仍走三列小图')

// ---- 4b. 所有分级高度都在 280px 屏可视区内 ----
// 顶栏 58 + AI 头 25 + 输入栏 60 = 143，消息区 137px；再留分子名 16px → 图卡 <=120px
const cases4b = [
  ['阿莫西林(>20原子)', buildMolRows([{ smiles: AMOX, label: '阿莫西林' }], 3)],
  ['胆固醇(>14原子)', buildMolRows([{ smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', label: '胆固醇' }], 3)],
  ['苯酚(小分子)', small],
  ['三分子', three],
  ['两分子', buildMolRows([{ smiles: 'CCO', label: '乙醇' }, { smiles: 'CC(=O)O', label: '乙酸' }], 3)]
]
for (const [nm, g] of cases4b) {
  ok(g.boxH <= 120, nm + ' 图卡高 ' + g.boxH + ' <= 120（可视区上限）')
  for (const row of g.rows) for (const cell of row) {
    const m = /height:\s*(\d+)px/.exec(cell.st || '')
    ok(m && parseInt(m[1], 10) <= 120, nm + ' 实际 image 高度不超可视区')
  }
}

// ---- 5. 兼容旧标记 ----
const legacy = extractMols('说明\n@SMILES c1ccccc1 苯\n结束')
ok(legacy.mols.length === 1 && legacy.mols[0].label === '苯', '旧 @SMILES 标记仍然识别')

// ---- 6. 放大入口：每个图格必须带 smiles，点击才能打开单分子大图页 ----
const zs = buildMolRows(extractMols('@//smiles/ CC(=O)O 乙酸 C2H4O2').mols, 1)
ok(!!(zs.rows[0] && zs.rows[0][0] && zs.rows[0][0].smiles), '图格带 smiles（放大按钮的数据来源）')
ok(zs.rows[0][0].smiles === zs.valid[0].smiles, '图格 smiles 与 valid 一致，放大后画的是同一结构')

console.log(bad ? 'FAIL mols_render_test 共 ' + bad + ' 处失败' : 'OK  mols_render_test 全部通过')
process.exit(bad ? 1 : 0)
