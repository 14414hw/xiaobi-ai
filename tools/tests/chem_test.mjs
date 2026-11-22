// 化学式排版回归：有机物结构简式、连接键、离子电荷、SMILES 保护
// 用法：node tools/tests/chem_test.mjs
import fs from 'fs'
import { plainify } from '../../src/utils/api.js'

const cases = [
  // 有机物结构简式：下标必须转，连接键不能被当负电荷
  ['乙醇 CH3CH2OH、乙酸 CH3COOH', 'CH₃CH₂OH', 'CH₃COOH'],
  ['葡萄糖 CH2OH(CHOH)4CHO', 'CH₂OH(CHOH)₄CHO'],
  ['淀粉 (C6H10O5)n', '(C₆H₁₀O₅)n'],
  ['聚合物 n CH2=CH2 → [-CH2-CH2-]n', 'CH₂=CH₂', '[-CH₂-CH₂-]n'],
  ['氨基酸 H2N-CH2-COOH', 'H₂N-CH₂-COOH'],
  ['酯化 CH3COOH + C2H5OH ⇌ CH3COOC2H5 + H2O', 'CH₃COOC₂H₅'],
  // 连接键 vs 离子电荷
  ['四个相同的 -CHOH- 结构单元', '-CHOH- 结构单元'],
  ['乙基 CH3CH2- 基', 'CH₃CH₂- 基'],
  ['OH- 离子、Cl- 使溶液、CH3COO- 根', 'OH⁻ 离子', 'Cl⁻ 使溶液', 'CH₃COO⁻ 根'],
  ['Fe3+、Na+、Ca2+', 'Fe³⁺', 'Na⁺', 'Ca²⁺'],
  // 配离子
  ['[Cu(NH3)4]2+、[Fe(CN)6]3-', ']²⁺', ']³⁻'],
  // SMILES 不能被改
  ['苯环：c1ccccc1、C1=CC=CC=C1、C6H6', 'c1ccccc1', 'C1=CC=CC=C1', 'C₆H₆'],
  // 杂化轨道是上标
  ['甲烷 sp3 杂化、乙烯 sp2 杂化', 'sp³', 'sp²'],
  // 酸根括号
  ['H2SO4(浓)、Ca(OH)2、Fe2(SO4)3', 'H₂SO₄(浓)', 'Ca(OH)₂', 'Fe₂(SO₄)₃']
]

// 不能出现的坏结果
const bad = [
  ['-CHOH- 结构单元', '⁻'],
  ['CH3CH2- 基', '⁻'],
  ['[-CH2-CH2-]n', 'H²⁻'],
  ['C1=CC=CC=C1', 'C₁'],
  ['c1ccccc1', 'c₁']
]

// 从共用模块直接取 extractMols（2026-11-20 起实现已抽到 molsRender.js；
// 此前从 chat.vue 源码 eval，抽走后会 ReferenceError）
import { extractMols } from '../../src/utils/molsRender.js'

let fail = 0
function ok(name, cond, extra) {
  if (!cond) { fail++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}

for (const [input, ...wants] of cases) {
  const out = plainify(input)
  for (const w of wants) ok(input + ' 应含 ' + w, out.indexOf(w) >= 0, out)
}
for (const [input, forbidden] of bad) {
  const out = plainify(input)
  ok(input + ' 不应含 ' + forbidden, out.indexOf(forbidden) < 0, out)
}

const sample = '结构如下\n@//smiles/ CCO 乙醇\n@//smiles/ c1ccccc1 苯\n补充说明文字'
const r = extractMols(plainify(sample))
ok('提取 2 个分子', r.mols.length === 2, JSON.stringify(r.mols))
ok('文本里不留 @smiles', r.text.indexOf('smiles') < 0, r.text)
ok('保留说明文字', r.text.indexOf('补充说明文字') >= 0, r.text)

console.log(fail === 0 ? 'OK  chem_test 全部通过' : 'FAIL ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
