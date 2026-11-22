// 拼音输入引擎：数据来自 tools/gen_dict.py 生成的紧凑表
// 每行格式 "pinyin<TAB>词1,词2,..."，生成时已按拼音字典序排好。
//
// 内存策略：不预先把每个拼音的候选词 split 成数组（那会为上万条词各建一个
// 数组 + 字符串，QuickJS 堆只有 6 MB），只记录每行值在 RAW 里的起止位置，
// 选中哪个拼音再切片。KEYS 是有序的，二分查找照常可用。
import RAW from '../data/pinyin-data.js'
import TOP_RAW from '../data/pinyin-top.js'
import ASSOC from '../data/pinyin-assoc.js'

var KEYS = null
var VS = null
var VE = null

// 全局高频词组表（[[py, w], ...]）：前缀键扫描按拼音字典序，长尾键会挤掉
// 高频词组（ai 的 50+ 前缀键里爱国/爱好排 15+），先查这张表保证首屏。
var TOP = null

function buildTop() {
  if (TOP) return
  TOP = []
  var parts = TOP_RAW.split(',')
  for (var i = 0; i < parts.length; i++) {
    var c = parts[i].indexOf(':')
    if (c > 0) TOP.push([parts[i].slice(0, c), parts[i].slice(c + 1)])
  }
}

// 音节键集合（惰性构建）：该键下全是单字才算音节
var SYLS = null

function build() {
  if (KEYS) return
  var keys = []
  var vs = []
  var ve = []
  var pos = 0
  var len = RAW.length
  var syls = {}
  while (pos < len) {
    var nl = RAW.indexOf('\n', pos)
    if (nl < 0) nl = len
    var tab = RAW.indexOf('\t', pos)
    if (tab > pos && tab < nl) {
      keys.push(RAW.slice(pos, tab))
      vs.push(tab + 1)
      ve.push(nl)
      // 顺便判定音节键：所有逗号段都是单字（无 split 分配，O(行长)）
      var syl = true
      var p2 = tab + 1
      while (p2 < nl) {
        var comma = RAW.indexOf(',', p2)
        if (comma < 0 || comma > nl) comma = nl
        if (comma - p2 !== 1) { syl = false; break }
        p2 = comma + 1
      }
      if (syl) syls[RAW.slice(pos, tab)] = true
    }
    pos = nl + 1
  }
  KEYS = keys
  VS = vs
  VE = ve
  SYLS = syls
}

// 按需取出某一行（某个拼音）的候选词
function valsAt(i) {
  if (i < 0 || i >= KEYS.length) return []
  return RAW.slice(VS[i], VE[i]).split(',')
}

function lowerBound(s) {
  var lo = 0
  var hi = KEYS.length
  while (lo < hi) {
    var mid = (lo + hi) >> 1
    if (KEYS[mid] < s) lo = mid + 1
    else hi = mid
  }
  return lo
}

function indexOfKey(k) {
  var i = lowerBound(k)
  if (i < KEYS.length && KEYS[i] === k) return i
  return -1
}

// 贪心 + 最少词数切分，返回音节数组；无法完全切分时返回 null
// 含隔音符（xi'an）时先按 ' 分段，各段独立切分后拼接。
function segment(buf) {
  var n = buf.length
  if (!n) return null
  if (buf.indexOf("'") >= 0) {
    var parts = buf.split("'")
    var all = []
    for (var p = 0; p < parts.length; p++) {
      if (!parts[p]) continue
      var sub = segment(parts[p])
      if (!sub) return null
      all = all.concat(sub)
    }
    return all.length ? all : null
  }
  var best = new Array(n + 1)
  best[0] = []
  for (var i = 1; i <= n; i++) {
    for (var len = Math.min(24, i); len >= 1; len--) {
      var w = buf.slice(i - len, i)
      var idx = indexOfKey(w)
      if (idx < 0) continue
      var prev = best[i - len]
      if (!prev) continue
      var cand = prev.concat([idx])
      if (!best[i] || cand.length < best[i].length) best[i] = cand
    }
  }
  return best[n] || null
}

function pushUnique(out, arr, limit) {
  for (var i = 0; i < arr.length && out.length < limit; i++) {
    if (out.indexOf(arr[i]) < 0) out.push(arr[i])
  }
}

// ---- 用户词典 + 动态调频：选过的词按使用次数置顶 ----
// 存 storage（本机持久化），结构 { 词: { py: 拼音键, n: 次数 } }
var UD = null
var UD_MAX = 400

function udLoad() {
  if (UD) return UD
  UD = {}
  try {
    var s = $falcon.jsapi.storage.get('penai_pinyin_userdict')
    if (s) {
      var o = JSON.parse(s)
      if (o && typeof o === 'object') UD = o
    }
  } catch (e) {}
  return UD
}

function udSave() {
  try {
    $falcon.jsapi.storage.set('penai_pinyin_userdict', JSON.stringify(UD))
  } catch (e) {}
}

/** 用户选词时记录：词 + 当时的完整拼音串（用于下次同拼音直接置顶） */
export function recordWord(word, pinyin) {
  if (!word || !pinyin || word.length < 2) return
  var d = udLoad()
  var e = d[word]
  if (e) {
    e.n++
    if (pinyin && pinyin.indexOf(e.py) === 0) e.py = pinyin   // 越拼越完整，跟随更新
  } else {
    // 超上限：淘汰次数最少的词（简单遍历，词典 ≤400 条开销可忽略）
    var keys = Object.keys(d)
    if (keys.length >= UD_MAX) {
      var minK = keys[0]
      for (var i = 1; i < keys.length; i++) {
        if (d[keys[i]].n < d[minK].n) minK = keys[i]
      }
      delete d[minK]
    }
    d[word] = { py: pinyin, n: 1 }
  }
  udSave()
}

function udHits(buf) {
  var d = udLoad()
  var hits = []
  for (var w in d) {
    var e = d[w]
    if (e.py === buf || e.py.indexOf(buf) === 0) hits.push([w, e.n])
  }
  hits.sort(function (a, b) { return b[1] - a[1] })
  return hits
}

/**
 * 返回当前拼音串的候选词
 * @param {string} buf 拼音串（小写字母，可含隔音符 '，如 xi'an）
 * @param {number} limit 最多返回条数
 */
export function candidates(buf, limit) {
  build()
  buildTop()
  limit = limit || 24
  if (!buf) return []
  var out = []

  // 隔音符：xi'an 的键是纯字母（xi / an），精确与前缀匹配用最后一段；
  // 整句由 segment() 按 ' 分段递归处理。
  var hasApo = buf.indexOf("'") >= 0
  var lastSeg = hasApo ? buf.slice(buf.lastIndexOf("'") + 1) : buf
  var matchBuf = lastSeg || buf

  // 用户词典置顶（动态调频：选过的词按次数排最前）
  var ud = udHits(buf)
  for (var u = 0; u < ud.length && out.length < limit; u++) {
    if (out.indexOf(ud[u][0]) < 0) out.push(ud[u][0])
  }

  var i0 = lowerBound(matchBuf)
  var exactKey = i0 < KEYS.length && KEYS[i0] === matchBuf
  // 整串分词成多音节时给出整句组合（zhedaoti -> 这道题、xi'an -> 西安）。
  // 隔音符分段（xi'an）是用户明确意图，整句置顶；普通整串（zhedaoti）
  // 在精确行存在时让位给精确行（词频驱动比逐音节首选拼接更准：
  // benfen 的整句是「本分」，但精确行首选是「苯酚」）。
  var isApoSeg = buf.indexOf("'") >= 0
  var seg = segment(buf)
  if (seg && seg.length > 1) {
    var joined = ''
    var ok = true
    for (var k = 0; k < seg.length; k++) {
      var vv = valsAt(seg[k])
      if (!vv.length) { ok = false; break }
      joined += vv[0]
    }
    if (ok && out.indexOf(joined) < 0 && (isApoSeg || !exactKey)) {
      out.push(joined)
    }
  }
  var bufIsSyl = indexOfKey(matchBuf) >= 0
  var longer = []
  if (bufIsSyl) {
    var bufChars = 0
    var bufVals = valsAt(i0 >= 0 && KEYS[i0] === matchBuf ? i0 : indexOfKey(matchBuf))
    for (var bc = 0; bc < bufVals.length; bc++) {
      if (bufVals[bc].length === 1) bufChars++
    }
    if (bufChars >= 10) {
      for (var s in SYLS) {
        if (s.length > matchBuf.length && s.indexOf(matchBuf) === 0) longer.push(s)
      }
    }
  }

  // 精确匹配行：最常用 8 字直接上屏；9~16 位常用字暂存 midChars（前缀词第一
  // 轮之后再插入，保证「足够多的常用字」滚动可达又不挤掉高频词组）；16 位
  // 以外的生僻字垫底 restChars；键内词组紧跟首屏常用字（shide→似的/是的）。
  var restChars = []
  var midChars = []
  if (exactKey) {
    var exact = valsAt(i0)
    var charsSeen = 0
    var exactWords = []
    for (var c = 0; c < exact.length; c++) {
      var it = exact[c]
      if (out.indexOf(it) >= 0) continue
      if (it.length === 1) {
        if (charsSeen < 8) { out.push(it); charsSeen++ }
        else if (charsSeen < 16) { midChars.push(it); charsSeen++ }
        else restChars.push(it)
      } else exactWords.push(it)
    }
    for (var ew = 0; ew < exactWords.length; ew++) out.push(exactWords[ew])
  }

  // 全局高频词组（top 2000，按全局词频序）：爱国/爱好/你好这类高频词
  // 不受前缀键字典序影响，必进首屏。两字词优先占名额（三字/四字词组
  // 如爱因斯坦不挤占两字词位置）；steal 音节边界照常生效（ni 不混 nian*）。
  var tGot = 0
  var tLong = []
  for (var t = 0; t < TOP.length && tGot < 8; t++) {
    var tpy = TOP[t][0]
    if (!(tpy === buf || tpy.indexOf(buf) === 0 || (hasApo && tpy.indexOf(matchBuf) === 0))) continue
    var steal2 = false
    for (var s3 = 0; s3 < longer.length; s3++) {
      if (tpy.indexOf(longer[s3]) === 0) { steal2 = true; break }
    }
    if (steal2) continue
    var tw = TOP[t][1]
    if (out.indexOf(tw) >= 0) continue
    if (tw.length === 2) { out.push(tw); tGot++ }
    else if (out.length < limit) tLong.push(tw)
  }
  // tLong（三字以上高频词）延后到前缀词第一轮之后插入，避免长词挤占首屏

  // 前缀键只取词组（≥2 字）：shibai→失败、aiguo→爱国。
  // 第一轮每个前缀键只取头部词组（该键词频最高者），最多 6 个——词库扩容后
  // ai 这类前缀键有 30+ 个，若逐键灌满，aiguo 的「爱国」会被字典序靠前的
  // 键（爱尔兰/爱戴…）挤到 14 位开外；每键 1 个能让爱国/爱好都进首屏。
  // 第一轮结束后插入 9~16 位常用字与 tLong，再第二轮回填各键后续词组。
  var wordsGot = 0
  for (var round = 0; round < 2; round++) {
    var cap = round === 0 ? 6 : 12
    if (round === 1) {
      for (var m = 0; m < midChars.length && out.length < limit; m++) {
        if (out.indexOf(midChars[m]) < 0) out.push(midChars[m])
      }
      for (var tl = 0; tl < tLong.length && out.length < limit; tl++) {
        if (out.indexOf(tLong[tl]) < 0) out.push(tLong[tl])
      }
    }
    var j = i0
    while (j < KEYS.length && wordsGot < cap) {
      if (KEYS[j].indexOf(matchBuf) !== 0) break
      if (KEYS[j] !== matchBuf) {
        var steal = false
        for (var s2 = 0; s2 < longer.length; s2++) {
          if (KEYS[j].indexOf(longer[s2]) === 0) { steal = true; break }
        }
        if (!steal) {
          var vv2 = valsAt(j)
          var got = 0
          for (var w2 = 0; w2 < vv2.length && out.length < limit; w2++) {
            if (vv2[w2].length < 2 || out.indexOf(vv2[w2]) >= 0) continue
            if (got < round + 1) {   // 第一轮每键 1 个，第二轮每键 2 个
              out.push(vv2[w2])
              wordsGot++
              got++
            } else break
          }
        }
      }
      j++
    }
  }
  // 精确匹配剩下的单字垫底（点选生僻字仍可达，只是不再霸屏）
  for (var r = 0; r < restChars.length && out.length < limit; r++) {
    if (out.indexOf(restChars[r]) < 0) out.push(restChars[r])
  }
  return out.slice(0, limit)
}

// 输入法数据是否已就绪（用于预热）
export function warmup() {
  build()
  return KEYS.length
}

// ---- 联想输入：字/词 -> 下一个高频字 ----
var A1 = null   // 单字 -> [下字...]
var A2 = null   // 双字 -> [第三字...]

function buildAssoc() {
  if (A1) return
  A1 = {}
  A2 = {}
  var lines = ASSOC.split('\n')
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (!line) continue
    var t = line.indexOf('\t')
    if (t <= 0) continue
    var key = line.slice(0, t)
    var val = line.slice(t + 1).split(',')
    if (key.length === 1) A1[key] = val
    else if (key.length === 2) A2[key] = val
  }
}

/**
 * 根据已上屏文本尾部联想下一个字
 * 优先两字词接续（我们 -> 的/是），退回单字联想（我 -> 们/的/是/家）
 */
export function associations(text) {
  buildAssoc()
  if (!text) return []
  var out = []
  if (text.length >= 2) {
    var b = text.slice(-2)
    if (A2[b]) {
      for (var i = 0; i < A2[b].length && out.length < 10; i++) {
        if (out.indexOf(A2[b][i]) < 0) out.push(A2[b][i])
      }
    }
  }
  var c = text.slice(-1)
  if (A1[c]) {
    for (var j = 0; j < A1[c].length && out.length < 10; j++) {
      if (out.indexOf(A1[c][j]) < 0) out.push(A1[c][j])
    }
  }
  return out
}

/**
 * 中文词组前缀联想：光标前 tail（2~4 字）命中的词组，返回其"后续部分"。
 * 例：tail="化学" → 返回 ["方程式","元素","键",...]（来自词组"化学方程式"等）。
 *
 * 词库扩到 8000 字 / 10000 词之后不能再逐行 split 全表（9000+ 行，每次联想
 * 都要建上万个临时数组，QuickJS 上会卡）。改为用原生 indexOf 直接定位到
 * 含 tail 的那几行，零额外索引内存，绝大多数调用只做一两次字符串查找。
 */
export function phraseSuggest(tail, limit) {
  build()
  var out = []
  if (!tail || tail.length < 2) return out
  limit = limit || 6
  var idx = RAW.indexOf(tail)
  while (idx >= 0 && out.length < limit) {
    var ls = RAW.lastIndexOf('\n', idx)
    ls = ls < 0 ? 0 : ls + 1
    var le = RAW.indexOf('\n', idx)
    if (le < 0) le = RAW.length
    var tab = RAW.indexOf('\t', ls)
    if (tab > ls && tab < le) {
      var vs = RAW.slice(tab + 1, le).split(',')
      for (var j = 0; j < vs.length && out.length < limit; j++) {
        var w = vs[j]
        if (w.length > tail.length && w.indexOf(tail) === 0) {
          var rem = w.slice(tail.length)
          if (out.indexOf(rem) < 0) out.push(rem)
        }
      }
    }
    idx = RAW.indexOf(tail, le)
  }
  return out
}
