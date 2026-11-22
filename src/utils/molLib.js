/* 高中高频分子结构库（2026-11-21）
 *
 * 作用有两个：
 *   1) 名称命中时以库里的结构为准。模型偶尔会把苯酚写成苯甲醛、把乙酸乙酯
 *      写成乙酸——这类错误靠语法校验抓不到，用一张可信的小表直接兜住。
 *   2) 给"名称 ↔ 结构"提供对照基准：库里同时存分子式，测试会按 SMILES 重算
 *      分子式并与表里比对，写错一个字符就会在 CI 里暴露。
 *
 * 收录原则：只收高中教材/题目里高频、且 SMILES 能确定写对的分子。
 * 有异构体歧义的名字（二甲苯、丁醇）不收，避免"以库为准"反而选错异构体。
 * 复杂天然产物（蔗糖、胆固醇、紫杉醇）暂不收。
 */

export var LIB_VERSION = 1

export var MOL_LIB = [
  // ---- 烃 ----
  { name: '甲烷', aliases: ['沼气'], smiles: 'C', formula: 'CH4' },
  { name: '乙烷', smiles: 'CC', formula: 'C2H6' },
  { name: '丙烷', smiles: 'CCC', formula: 'C3H8' },
  { name: '丁烷', smiles: 'CCCC', formula: 'C4H10' },
  { name: '乙烯', smiles: 'C=C', formula: 'C2H4' },
  { name: '丙烯', smiles: 'CC=C', formula: 'C3H6' },
  { name: '乙炔', smiles: 'C#C', formula: 'C2H2' },
  { name: '1,3-丁二烯', aliases: ['丁二烯'], smiles: 'C=CC=C', formula: 'C4H6' },
  { name: '异戊二烯', smiles: 'CC(=C)C=C', formula: 'C5H8' },
  { name: '2-丁烯', aliases: ['丁烯'], smiles: 'CC=CC', formula: 'C4H8' },
  { name: '异丁烯', aliases: ['2-甲基丙烯'], smiles: 'CC(=C)C', formula: 'C4H8' },
  { name: '新戊烷', aliases: ['2,2-二甲基丙烷'], smiles: 'CC(C)(C)C', formula: 'C5H12' },
  { name: '苯', smiles: 'c1ccccc1', formula: 'C6H6' },
  { name: '甲苯', smiles: 'Cc1ccccc1', formula: 'C7H8' },
  { name: '乙苯', smiles: 'CCc1ccccc1', formula: 'C8H10' },
  { name: '苯乙烯', smiles: 'C=Cc1ccccc1', formula: 'C8H8' },
  { name: '苯乙炔', smiles: 'C#Cc1ccccc1', formula: 'C8H6' },
  { name: '萘', smiles: 'c1ccc2ccccc2c1', formula: 'C10H8' },
  { name: '蒽', smiles: 'c1ccc2cc3ccccc3cc2c1', formula: 'C14H10' },
  { name: '菲', smiles: 'c1ccc2c(c1)ccc1ccccc12', formula: 'C14H10' },
  { name: '环己烷', smiles: 'C1CCCCC1', formula: 'C6H12' },
  { name: '环戊烷', smiles: 'C1CCCC1', formula: 'C5H10' },

  // ---- 卤代烃 ----
  { name: '氯甲烷', smiles: 'CCl', formula: 'CH3Cl' },
  { name: '溴乙烷', smiles: 'CCBr', formula: 'C2H5Br' },
  { name: '三氯甲烷', aliases: ['氯仿'], smiles: 'ClC(Cl)Cl', formula: 'CHCl3' },
  { name: '四氯化碳', smiles: 'ClC(Cl)(Cl)Cl', formula: 'CCl4' },
  { name: '氯苯', smiles: 'Clc1ccccc1', formula: 'C6H5Cl' },
  { name: '氯乙烯', smiles: 'C=CCl', formula: 'C2H3Cl' },
  { name: '1,2-二氯乙烷', aliases: ['二氯乙烷'], smiles: 'ClCCCl', formula: 'C2H4Cl2' },
  { name: '四氟乙烯', smiles: 'C(F)(F)=C(F)F', formula: 'C2F4' },
  { name: '三硝基甲苯', aliases: ['TNT'], smiles: 'Cc1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]', formula: 'C7H5N3O6' },

  // ---- 醇 / 酚 / 醚 ----
  { name: '甲醇', smiles: 'CO', formula: 'CH4O' },
  { name: '乙醇', aliases: ['酒精'], smiles: 'CCO', formula: 'C2H6O' },
  { name: '丙醇', smiles: 'CCCO', formula: 'C3H8O' },
  { name: '异丙醇', smiles: 'CC(C)O', formula: 'C3H8O' },
  { name: '乙二醇', smiles: 'OCCO', formula: 'C2H6O2' },
  { name: '丙三醇', aliases: ['甘油'], smiles: 'OCC(O)CO', formula: 'C3H8O3' },
  { name: '苯酚', aliases: ['石炭酸'], smiles: 'Oc1ccccc1', formula: 'C6H6O' },
  { name: '乙醚', smiles: 'CCOCC', formula: 'C4H10O' },
  { name: '甲醚', aliases: ['二甲醚'], smiles: 'COC', formula: 'C2H6O' },
  { name: '环氧乙烷', smiles: 'C1CO1', formula: 'C2H4O' },
  { name: '苯甲醇', aliases: ['苄醇'], smiles: 'OCc1ccccc1', formula: 'C7H8O' },

  // ---- 醛 / 酮 / 酸 / 酯 ----
  { name: '甲醛', smiles: 'C=O', formula: 'CH2O' },
  { name: '乙醛', smiles: 'CC=O', formula: 'C2H4O' },
  { name: '丙醛', smiles: 'CCC=O', formula: 'C3H6O' },
  { name: '丙烯醛', smiles: 'C=CC=O', formula: 'C3H4O' },
  { name: '苯甲醛', smiles: 'O=Cc1ccccc1', formula: 'C7H6O' },
  { name: '丙酮', smiles: 'CC(C)=O', formula: 'C3H6O' },
  { name: '丁酮', aliases: ['甲乙酮'], smiles: 'CCC(C)=O', formula: 'C4H8O' },
  { name: '环己酮', smiles: 'O=C1CCCCC1', formula: 'C6H10O' },
  { name: '甲酸', aliases: ['蚁酸'], smiles: 'O=CO', formula: 'CH2O2' },
  { name: '乙酸', aliases: ['醋酸'], smiles: 'CC(=O)O', formula: 'C2H4O2' },
  { name: '草酸', smiles: 'O=C(O)C(=O)O', formula: 'C2H2O4' },
  { name: '苯甲酸', smiles: 'OC(=O)c1ccccc1', formula: 'C7H6O2' },
  { name: '水杨酸', smiles: 'OC(=O)c1ccccc1O', formula: 'C7H6O3' },
  { name: '乳酸', smiles: 'CC(O)C(=O)O', formula: 'C3H6O3' },
  { name: '柠檬酸', smiles: 'OC(=O)CC(O)(CC(=O)O)C(=O)O', formula: 'C6H8O7' },
  { name: '硬脂酸', smiles: 'CCCCCCCCCCCCCCCCCC(=O)O', formula: 'C18H36O2' },
  { name: '软脂酸', aliases: ['棕榈酸'], smiles: 'CCCCCCCCCCCCCCCC(=O)O', formula: 'C16H32O2' },
  { name: '油酸', smiles: 'CCCCCCCCC=CCCCCCCCC(=O)O', formula: 'C18H34O2' },
  { name: '丙酸', smiles: 'CCC(=O)O', formula: 'C3H6O2' },
  { name: '丙烯酸', smiles: 'C=CC(=O)O', formula: 'C3H4O2' },
  { name: '己二酸', aliases: ['肥酸'], smiles: 'OC(=O)CCCCC(=O)O', formula: 'C6H10O4' },
  { name: '对苯二甲酸', smiles: 'OC(=O)c1ccc(cc1)C(=O)O', formula: 'C8H6O4' },
  { name: '甲酸甲酯', smiles: 'COC=O', formula: 'C2H4O2' },
  { name: '甲酸乙酯', smiles: 'CCOC=O', formula: 'C3H6O2' },
  { name: '乙酸甲酯', smiles: 'COC(C)=O', formula: 'C3H6O2' },
  { name: '乙酸乙酯', smiles: 'CCOC(C)=O', formula: 'C4H8O2' },
  { name: '苯甲酸乙酯', smiles: 'CCOC(=O)c1ccccc1', formula: 'C9H10O2' },

  // ---- 含氮 / 含硫 ----
  { name: '甲胺', smiles: 'CN', formula: 'CH5N' },
  { name: '乙胺', smiles: 'CCN', formula: 'C2H7N' },
  { name: '苯胺', smiles: 'Nc1ccccc1', formula: 'C6H7N' },
  { name: '尿素', smiles: 'NC(N)=O', formula: 'CH4N2O' },
  { name: '乙酰胺', smiles: 'CC(N)=O', formula: 'C2H5NO' },
  { name: '硝基苯', smiles: 'O=[N+]([O-])c1ccccc1', formula: 'C6H5NO2' },
  { name: '苯磺酸', smiles: 'OS(=O)(=O)c1ccccc1', formula: 'C6H6O3S' },
  { name: '乙二胺', smiles: 'NCCN', formula: 'C2H8N2' },
  { name: '己二胺', aliases: ['1,6-己二胺'], smiles: 'NCCCCCCN', formula: 'C6H16N2' },
  { name: '苯甲胺', aliases: ['苄胺'], smiles: 'NCc1ccccc1', formula: 'C7H9N' },
  { name: '三聚氰胺', smiles: 'Nc1nc(N)nc(N)n1', formula: 'C3H6N6' },

  // ---- 杂环 ----
  { name: '吡啶', smiles: 'c1ccncc1', formula: 'C5H5N' },
  { name: '呋喃', smiles: 'c1ccoc1', formula: 'C4H4O' },
  { name: '噻吩', smiles: 'c1ccsc1', formula: 'C4H4S' },
  { name: '吡咯', smiles: 'c1cc[nH]c1', formula: 'C4H5N' },
  { name: '咪唑', smiles: 'c1c[nH]cn1', formula: 'C3H4N2' },
  { name: '吲哚', smiles: 'c1ccc2[nH]ccc2c1', formula: 'C8H7N' },
  { name: '喹啉', smiles: 'c1ccc2ncccc2c1', formula: 'C9H7N' },

  // ---- 糖 / 氨基酸 ----
  { name: '葡萄糖', smiles: 'OCC(O)C(O)C(O)C(O)C=O', formula: 'C6H12O6' },
  { name: '果糖', smiles: 'OCC(=O)C(O)C(O)C(O)CO', formula: 'C6H12O6' },
  { name: '蔗糖', smiles: 'OCC1OC(OC2(CO)OC(O)C(O)C2CO)C(O)C(O)C1O', formula: 'C12H22O11' },
  { name: '麦芽糖', smiles: 'OCC1OC(OC2OC(CO)C(O)C(O)C2O)C(O)C(O)C1O', formula: 'C12H22O11' },
  { name: '甘氨酸', smiles: 'NCC(=O)O', formula: 'C2H5NO2' },
  { name: '丙氨酸', aliases: ['L-丙氨酸'], smiles: 'C[C@@H](N)C(=O)O', formula: 'C3H7NO2' },
  { name: '缬氨酸', aliases: ['L-缬氨酸'], smiles: 'CC(C)[C@@H](C(=O)O)N', formula: 'C5H11NO2' },
  { name: '亮氨酸', aliases: ['L-亮氨酸'], smiles: 'CC(C)C[C@@H](C(=O)O)N', formula: 'C6H13NO2' },
  { name: '异亮氨酸', aliases: ['L-异亮氨酸'], smiles: 'CC[C@H](C)[C@@H](C(=O)O)N', formula: 'C6H13NO2' },
  { name: '苯丙氨酸', aliases: ['L-苯丙氨酸'], smiles: 'N[C@@H](Cc1ccccc1)C(=O)O', formula: 'C9H11NO2' },
  { name: '脯氨酸', aliases: ['L-脯氨酸'], smiles: 'OC(=O)[C@@H]1CCCN1', formula: 'C5H9NO2' },
  { name: '半胱氨酸', aliases: ['L-半胱氨酸'], smiles: 'N[C@@H](CS)C(=O)O', formula: 'C3H7NO2S' },
  { name: '蛋氨酸', aliases: ['L-蛋氨酸', '甲硫氨酸'], smiles: 'CSCC[C@@H](C(=O)O)N', formula: 'C5H11NO2S' },
  { name: '丝氨酸', aliases: ['L-丝氨酸'], smiles: 'N[C@@H](CO)C(=O)O', formula: 'C3H7NO3' },
  { name: '苏氨酸', aliases: ['L-苏氨酸'], smiles: 'C[C@H](O)[C@@H](N)C(=O)O', formula: 'C4H9NO3' },
  { name: '天冬氨酸', aliases: ['L-天冬氨酸'], smiles: 'N[C@@H](CC(=O)O)C(=O)O', formula: 'C4H7NO4' },
  { name: '谷氨酸', aliases: ['L-谷氨酸'], smiles: 'N[C@@H](CCC(=O)O)C(=O)O', formula: 'C5H9NO4' },
  { name: '天冬酰胺', aliases: ['L-天冬酰胺'], smiles: 'N[C@@H](CC(=O)N)C(=O)O', formula: 'C4H8N2O3' },
  { name: '谷氨酰胺', aliases: ['L-谷氨酰胺'], smiles: 'N[C@@H](CCC(=O)N)C(=O)O', formula: 'C5H10N2O3' },
  { name: '精氨酸', aliases: ['L-精氨酸'], smiles: 'N[C@@H](CCCNC(=N)N)C(=O)O', formula: 'C6H14N4O2' },
  { name: '组氨酸', aliases: ['L-组氨酸'], smiles: 'N[C@@H](Cc1c[nH]cn1)C(=O)O', formula: 'C6H9N3O2' },

  // ---- 常见药物 / 生活物质 ----
  { name: '阿司匹林', aliases: ['乙酰水杨酸'], smiles: 'CC(=O)Oc1ccccc1C(=O)O', formula: 'C9H8O4' },
  { name: '对乙酰氨基酚', aliases: ['扑热息痛'], smiles: 'CC(=O)Nc1ccc(O)cc1', formula: 'C8H9NO2' },
  { name: '布洛芬', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', formula: 'C13H18O2' },
  { name: '咖啡因', smiles: 'Cn1c(=O)c2c(ncn2C)n(C)c1=O', formula: 'C8H10N4O2' },
  { name: '阿莫西林', smiles: 'CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O', formula: 'C16H19N3O5S' },
  // 2026-11-21：模型把青霉素G 的噻唑烷环写成六元环（S 后多一个 CH2），
  // 结构校验按图算出 C17H20N2O4S 并标了"分子式不一致"。校验是对的，
  // 但用户看到的是错图——收进库后名称命中即用下列标准结构。
  { name: '青霉素G', aliases: ['苄青霉素', '青霉素G钠', '青霉素G钾', '青霉素'], smiles: 'CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O', formula: 'C16H18N2O4S' },
  { name: '青霉素V', aliases: ['苯氧甲基青霉素'], smiles: 'CC1(C)S[C@@H]2[C@H](NC(=O)COc3ccccc3)C(=O)N2[C@H]1C(=O)O', formula: 'C16H18N2O5S' },
  { name: '维生素C', aliases: ['抗坏血酸'], smiles: 'OC[C@H](O)[C@H]1OC(=O)C(O)=C1O', formula: 'C6H8O6' },
  { name: '香草醛', aliases: ['香兰素'], smiles: 'COc1cc(C=O)ccc1O', formula: 'C8H8O3' }
]

// 名称归一化：去掉空格、括号、标点，只留中英文数字。
// 只做"整名匹配"，不做包含匹配——"苯" 绝不能命中"苯甲酸"。
export function normName(s) {
  return String(s || '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[（）()【】\[\]{}·、,，。.；;：:!！?？"'“”‘’]/g, '')
    .toLowerCase()
}

var INDEX = null

function buildIndex() {
  INDEX = {}
  for (var i = 0; i < MOL_LIB.length; i++) {
    var e = MOL_LIB[i]
    INDEX[normName(e.name)] = e
    var al = e.aliases || []
    for (var j = 0; j < al.length; j++) INDEX[normName(al[j])] = e
  }
}

/** 按名称/别名精确查库，未命中返回 null
 *
 * 「主名（别名）」这种组合标签（青霉素G（苄青霉素）、阿司匹林(乙酰水杨酸)）
 * 整串归一化后与任何条目都不等，先按括号/分隔符拆段再逐段精确查。
 * 逐段仍然是整名匹配，不做包含匹配——「苯」依旧不会命中「苯甲酸」。
 */
export function lookupMol(name) {
  if (!INDEX) buildIndex()
  var raw = String(name || '')
  var k = normName(raw)
  if (!k) return null
  if (INDEX[k]) return INDEX[k]
  if (!/[（）()【】\[\]{}·、,，;；\/]/.test(raw)) return null
  var parts = raw.split(/[（）()【】\[\]{}·、,，;；\/]+/)
  for (var i = 0; i < parts.length; i++) {
    var pk = normName(parts[i])
    if (pk && INDEX[pk]) return INDEX[pk]
  }
  return null
}
