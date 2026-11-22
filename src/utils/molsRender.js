/* 结构式渲染共用层：从回答文本里提取 @smiles 指令、构建结构图行。
 *
 * 抽出来的原因：对话页（chat.vue）与历史详情页（history.vue）必须用同一套
 * 解析与尺寸策略——否则同一段回答在两处显示不一致（历史页曾直接显示 SMILES 原文）。
 *
 * 尺寸策略（2026-11-20 按实测数据定）：
 *   原子 <= 14  小图三列/两列（196x96 / 300x108），屏幕占用小
 *   原子 >  14  单列大图 860x220（此前两列 300x108 把阿莫西林压到 4.5px 字高，
 *               用户实拍报「复杂有机物显示很小」；单列后约 9.2px，翻倍）
 */
import { molInfo, inspectSmiles } from './mol.js'
import { auditMolecule, normalizeFormula } from './chemAudit.js'
import { lookupMol } from './molLib.js'

// 从回答里抠出 @SMILES 指令：模型有时套 <SMILES> 标签、有时几个挤在一行、
// 有时写在句子末尾。这里只做"宽松提取"，提取失败就当普通文字留着。
var SMI_RE = /^[A-Za-z0-9@+\-\[\]\(\)=#$:\/\\\.%\*]+$/

export function looksLikeSmiles(tok) {
  if (!tok || tok.length < 2 || tok.length > 160) return false
  if (!SMI_RE.test(tok)) return false
  if (!/[A-Za-z]/.test(tok)) return false
  return true
}

// 分子式：交给 chemAudit 的正规解析器判断（含元素白名单、下标归一化）。
// 必须带数字——否则 "CCO" 这种三字母 SMILES 会被误当分子式从标签里抠走。
export function looksLikeFormula(tok) {
  if (!tok || tok.length < 2 || tok.length > 30) return false
  if (!/[0-9₀-₉]/.test(tok)) return false
  return normalizeFormula(tok) !== '' && tok.indexOf('C') >= 0
}

export function extractMols(text) {
  if (!text) return { text: text, mols: [] }
  var src = String(text).split('<SMILES>').join(' ').split('</SMILES>').join(' ')
  // 新提示词前缀 @//smiles/（可带尾斜杠）归一化为 @smiles，走同一条解析路径
  src = src.replace(/@\/\/\s*smiles\s*\/?/gi, '@smiles')
  var lines = src.split('\n')
  var keep = []
  var found = []

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (line.toLowerCase().indexOf('@smiles') < 0) { keep.push(line); continue }
    var buf = line
    var leftover = ''
    while (true) {
      var at = buf.toLowerCase().indexOf('@smiles')
      if (at < 0) { leftover += buf; break }
      leftover += buf.slice(0, at)
      buf = buf.slice(at + 7).replace(/^[:：\s]+/, '')
      var nxt = buf.toLowerCase().indexOf('@smiles')
      var chunk = nxt < 0 ? buf : buf.slice(0, nxt)
      buf = nxt < 0 ? '' : buf.slice(nxt)
      var parts = chunk.split(/\s+/)
      var p = 0
      while (p < parts.length) {
        var tok = parts[p]
        if (!tok) { p++; continue }
        // 分子式不是结构：CH3CH2OH / C2H6O 这类既符合 SMILES 字符集又带数字的
        // token 在方程式里全是分子式，不能当第二个结构截断（方程式实测 2026-11-21）。
        // 无碳分子式（H2O / O2）靠"带数字且能被分子式解析"识别；不带数字的
        // CCO、CCN 仍是合法 SMILES，不能误伤。
        var tokIsFormula = looksLikeFormula(tok) || (/[0-9]/.test(tok) && normalizeFormula(tok) !== '')
        if (!looksLikeSmiles(tok) || tokIsFormula) {
          p++
          continue
        }
        if (looksLikeSmiles(tok)) {
          var tail = []
          for (var q2 = p + 1; q2 < parts.length; q2++) {
            if (!parts[q2]) continue
            // 分子式本身也符合 SMILES 的字符集（C6H6O），不能在这里当第二个 SMILES 截断
            if (looksLikeSmiles(parts[q2]) && !looksLikeFormula(parts[q2])) break
            tail.push(parts[q2])
          }
          // 新约定：@//smiles/ SMILES 中文名 分子式。
          // 分子式是可选的，有就拿来和结构算出来的比对；没有就跳过这项检查。
          var formula = ''
          if (tail.length) {
            var last = tail[tail.length - 1].replace(/[，。；,.;：:]$/, '')
            if (looksLikeFormula(last)) { formula = last; tail.pop() }
          }
          var label = tail.join(' ').slice(0, 12)
          found.push({ smiles: tok, label: label, formula: formula })
          p += tail.length + 1 + (formula ? 1 : 0)
        } else {
          p++
        }
      }
    }
    if (leftover.replace(/\s/g, '').length > 0) keep.push(leftover.replace(/\s+$/, ''))
  }

  var rest = keep.join('\n')
  // 有的模型把 SMILES 塞进 ``` 代码块，或直接单起一行，也要认
  if (!found.length) {
    var fence = /```[a-zA-Z]*\n([^\n`]{2,160})\n```/.exec(rest)
    if (fence) {
      var f1 = fence[1].replace(/\s/g, '')
      if (looksLikeSmiles(f1) && !looksLikeFormula(f1)) found.push({ smiles: f1, label: '', formula: '' })
    }
  }
  if (!found.length) {
    var lines2 = rest.split('\n')
    for (var l2 = 0; l2 < lines2.length; l2++) {
      var ln = lines2[l2].replace(/[`\s]/g, '')
      if (!ln || ln.length > 160) continue
      if (looksLikeFormula(ln)) continue
      // 无碳分子式（O2 / H2O / NaCl）也是合法"分子式"，不能当结构画
      if (normalizeFormula(ln) !== '') continue
      if (!looksLikeSmiles(ln)) continue
      // 必须有环闭合数字或支链记号，避免把普通单词当结构式
      if (!/(=|#|\(|\d|c1|C1|n1|\*)/.test(ln)) continue
      found.push({ smiles: ln, label: '', formula: '' })
      break
    }
  }

  return {
    text: rest.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, ''),
    mols: found
  }
}

// 结构图按 SMILES + 尺寸 缓存，避免每次重算（一条回答可能被重绘很多次）。
// 无上限的缓存在长对话多分子场景会吃掉 QuickJS 内存：超 80 条整表清空。
// 命中是按 key 全等，清空只损失重算时间（布局 0.1~2ms/个），不损失正确性。
var MOL_CACHE = {}
var MOL_CACHE_MAX = 80

export function molFor(smiles, bw, bh) {
  var key = bw + 'x' + bh + '|' + smiles
  var hit = MOL_CACHE[key]
  if (!hit) {
    hit = MOL_CACHE[key] = molInfo(smiles, '#eef2fa', bw, bh)
    var n = 0
    for (var k in MOL_CACHE) n++
    if (n > MOL_CACHE_MAX) MOL_CACHE = {}
  }
  return hit
}

/**
 * 构建结构图行
 * @param {Array} mols extractMols 产出的 [{smiles,label,formula}]
 * @param {number} max 内联最多显示几个（默认 3）
 *
 * 2026-11-21 起多了三件事：
 *   - 名称命中结构库时以库为准（防止模型把苯酚画成苯甲醛这类错误）
 *   - 每个分子做化学审计（价态/芳香性/分子式/名称官能团），汇总 issues
 *   - 画不出来的不再静默丢掉，进 failed 并带可读原因，界面补一行原文
 */
export function buildMolRows(mols, max) {
  var inline = max || 3
  var probe = []
  var failed = []
  var issues = []
  for (var i0 = 0; i0 < mols.length; i0++) {
    var raw = mols[i0] || {}
    var lib = lookupMol(raw.label)
    var smiles = lib ? lib.smiles : raw.smiles
    var label = lib ? lib.name : (raw.label || '')
    var stated = raw.formula || (lib ? lib.formula : '')
    var eff = { smiles: smiles, label: label, formula: stated, fromLib: !!lib }
    var inf0 = molFor(smiles, 300, 110)
    if (!inf0) {
      var chk = inspectSmiles(smiles)
      failed.push({
        smiles: smiles,
        label: label,
        reason: chk && chk.reason ? chk.reason : '布局失败（原子未能全部落位）'
      })
      continue
    }
    var au = auditMolecule(inf0, label, stated, !!lib)
    for (var q0 = 0; q0 < au.issues.length; q0++) {
      var msg = au.issues[q0]
      if (label) msg = label + '：' + msg
      if (issues.indexOf(msg) < 0) issues.push(msg)
    }
    probe.push({ m: eff, atoms: inf0.atoms || 0, info: inf0, audit: au })
  }
  if (!probe.length) {
    return { rows: [], more: 0, total: 0, valid: [], cols: 1, boxW: 420, boxH: 130, issues: issues, failed: failed }
  }

  var n = probe.length
  var wide = false
  // 原子多的分子在 164px 的三列格里根本看不清标签，直接改成单列大图
  var big = false
  for (var i1 = 0; i1 < n; i1++) {
    if (probe[i1].atoms > 20) big = true
    else if (probe[i1].atoms > 14) wide = true
  }

  var shown = probe.slice(0, inline)
  var cols = shown.length
  if (big || wide) cols = 1        // 中大分子：单列占满卡片，避免并排挤压
  if (cols > 3) cols = 3

  // 单列框按复杂度分级。高度上限是硬约束：936x280 屏上顶栏约 58px、AI 头约 25px、
  // 输入栏约 60px，消息区只剩约 135px。以前的 860x180 / 860x230 图卡把分子下半
  // （常常正好是苯环）推到输入栏以下——截图看起来像「环上半丢失」，实际是被挡住。
  // 真机 A/B 探针确认：SVG 的 line/path 全部正常渲染，纯粹是图卡太高。
  // 宽度继续给足（分子横向铺开），高度一律压到 110 以内，保证整图一屏可见。
  var boxH = 88
  var boxW = 196
  if (cols === 1) {
    if (big) { boxW = 860; boxH = 110 }     // >20 原子：宽图 + 受限高度
    else if (wide) { boxW = 860; boxH = 106 } // >14 原子
    else { boxW = 420; boxH = 104 }          // 小分子
  } else if (cols === 2) {
    boxW = 300
    boxH = 96
  }
  // 下面还要放一个「看全部」按钮，图压扁一点点
  if (n > shown.length) boxH = boxH - 10

  var rows = []
  for (var r0 = 0; r0 < shown.length; r0 += cols) {
    var row = []
    for (var c0 = r0; c0 < r0 + cols && c0 < shown.length; c0++) {
      var it = shown[c0]
      var info = molFor(it.m.smiles, boxW, boxH) || it.info
      row.push({
        uri: info.uri,
        label: it.m.label || '',
        // 带上 SMILES：点击内联图时用来打开单分子大图（放大/恢复原状）
        smiles: it.m.smiles,
        st: 'width: ' + info.w + 'px; height: ' + info.h + 'px;'
      })
    }
    rows.push(row)
  }
  var valid = []
  for (var v0 = 0; v0 < probe.length; v0++) valid.push(probe[v0].m)
  return {
    rows: rows,
    more: n - shown.length,
    total: n,
    valid: valid,
    cols: cols,
    boxW: boxW,
    boxH: boxH,
    issues: issues,
    failed: failed
  }
}

/** 打开「全部结构」大图页：写文件 → 跳页。chat / history 共用 */
export async function openMolsView(fs, falcon, list) {
  if (!list || !list.length) return false
  try { await fs.writeFile('/userdisk/penai_mols.json', JSON.stringify(list)) } catch (e) {}
  try { falcon.navTo('mols', {}) } catch (e2) { return false }
  return true
}
