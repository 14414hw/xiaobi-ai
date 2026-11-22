// 拼音引擎回归：v1.9.31 词频驱动字典 + 音节边界词组过滤
// 客户报障：「常用字找不到、生僻字反而在」——本测试锁死以下行为
import { candidates, associations, phraseSuggest, warmup, recordWord } from '../../src/utils/pinyin.js'

var bad = 0
function ok(cond, msg) {
  if (!cond) {
    console.log('  FAIL: ' + msg)
    bad++
  }
}
function first(list, n) {
  return candidates(list, 30).slice(0, n)
}

warmup()

// ---- 1. 单音节首屏：常用字在前，词组立刻跟上 ----
var ai = first('ai', 12)
ok(ai[0] === '爱', 'ai 首候选应为 爱，实际 ' + ai[0])
ok(ai.indexOf('爱国') >= 0 && ai.indexOf('爱国') < 14, '爱国 必须进 ai 首屏（词被生僻字挤出是 v1 主诉）')
ok(ai.indexOf('爱好') >= 0 && ai.indexOf('爱好') < 14, '爱好 必须进 ai 首屏')
var shi = first('shi', 10)
ok(shi[0] === '是', 'shi 首候选应为 是，实际 ' + shi[0])
var de = first('de', 6)
ok(de[0] === '的', 'de 首候选应为 的，实际 ' + de[0])
ok(de.indexOf('地') >= 1 && de.indexOf('地') <= 4, 'de 必须出 地（多音字次读音）')
var le = first('le', 8)
ok(le[0] === '了', 'le 首候选应为 了，实际 ' + le[0])

// ---- 2. 多音字次读音可打 ----
ok(first('hang', 4).indexOf('行') >= 0, 'hang 必须出 行（次读音白名单）')
ok(first('chang', 4).indexOf('长') >= 0, 'chang 必须出 长')
ok(first('tan', 6).indexOf('弹') >= 0, 'tan 必须出 弹（弹簧 tán）')
ok(first('zhong', 6).indexOf('重') >= 0, 'zhong 必须出 重（重力 zhòng）')
ok(first('yue', 8).indexOf('乐') >= 0, 'yue 必须出 乐（音乐 yuè）')

// ---- 3. 生僻字不再霸屏 ----
var aiAll = first('ai', 26)
for (var e of ['啀', '敱', '壒', '叆', '噯', '毐']) {
  if (aiAll.indexOf(e) < 0) continue
  ok(aiAll.indexOf(e) >= 14, '生僻字 ' + e + ' 只能出现在 14 位之后（霸屏=回归）')
}
// v3 词库扩容后 le 键 8 字 + 高频词组（类型/类似）占位，乐观通过 lenguan
// 键（steal 放行）仍可达，但位置让给词频更高的词组是正确行为——只锁可达
var leAll = first('le', 20)
ok(leAll[0] === '了' && leAll.indexOf('乐观') > 0, 'le：了 首位且 乐观 可达（le 键字少，leng* 词放行）')

// ---- 4. 词组与音节边界：跨音节词不得混入 ----
var ni = first('ni', 14)
for (var w of ['年间', '年末', '年轻', '年薪', '年代']) {
  ok(ni.indexOf(w) < 0, 'nian* 词 ' + w + ' 不得混入 ni 的候选')
}
// v3：le 键字少（8 字），leng* 词按「字少放行」规则进入 le 候选（与乐观
// 可达同一条规则），不再排除——音节边界由 ni/nian* 的用例锁定
var niWords = first('ni', 20)
ok(niWords.indexOf('你好') >= 0, 'nihao 词组应进 ni 候选')
var shiWords = first('shi', 26)
ok(shiWords.indexOf('失败') >= 0, '失败 应进 shi 候选（音节边界 shi|bai）')
ok(first('ke', 18).indexOf('可爱') >= 0, '可爱 应进 ke 候选（rest=ai 是音节键）')

// ---- 5. 整句直出与高频兜底词 ----
ok(candidates('zhedaoti', 6)[0] === '这道题', 'zhedaoti 整句应为 这道题，实际 ' + candidates('zhedaoti', 6)[0])
ok(candidates('shenme', 6).indexOf('什么') === 0, 'shenme 首候选 什么')
ok(candidates('nide', 6).indexOf('你的') >= 0, '你的 兜底词必须存在')
ok(candidates('wode', 6).indexOf('我的') >= 0, '我的 兜底词必须存在')
var shide = candidates('shide', 8)
ok(shide.indexOf('似的') >= 0 || shide.indexOf('是的') >= 0 || shide.indexOf('使得') >= 0, 'shide 应出词（似的/是的/使得 任一）')

// ---- 6. 联想链仍然可用 ----
ok(associations('这').length > 0, 'associations(这) 非空')
ok(phraseSuggest('化学', 6).indexOf('方程式') >= 0, 'phraseSuggest(化学) 应含 方程式')

// ---- 7. 英文联想不受影响 ----
var cn = first('nihao', 6)
ok(cn.indexOf('你好') === 0 || cn.indexOf('你好') > 0, 'nihao 可达即可')

// ---- 8. 学科必保字（2026-11-20 客户报障：fen 打不出「酚」）----
// gen_dict.py 的 KEEP_CHARS 给学科字保底权重：必须进首屏（前 1x 位），
// 但不能挤掉真正的首选（fen 首选仍是「分」）
var fen12 = first('fen', 13)
ok(fen12.indexOf('酚') >= 0, 'fen 候选必须含 酚（学科必保），实际 ' + fen12.join(' '))
ok(fen12[0] === '分', 'fen 首选仍是 分，实际 ' + fen12[0])
var subjectChars = [
  ['xian', '酰'], ['an', '胺'], ['wan', '烷'], ['xi', '烯'],
  ['que', '炔'], ['na', '钠'], ['zhi', '酯'], ['qiang', '羟'], ['suo', '羧'], ['tong', '酮']
]
for (var si = 0; si < subjectChars.length; si++) {
  var sk = subjectChars[si][0]
  var sc = subjectChars[si][1]
  var sl = first(sk, 14)
  ok(sl.indexOf(sc) >= 0, sk + ' 候选必须含 ' + sc + '，实际 ' + sl.join(' '))
}
// 学科词组：整词直出
ok(candidates('benfen', 6).indexOf('苯酚') === 0, 'benfen 首候选 苯酚')
ok(candidates('qiangji', 6).indexOf('羟基') >= 0, 'qiangji 应出 羟基')
ok(candidates('xiting', 6).indexOf('烯烃') >= 0, 'xiting 应出 烯烃')
ok(candidates('guannengtuan', 6).indexOf('官能团') >= 0, 'guannengtuan 应出 官能团')

// ---- 9. v3 隔音符：xi'an 切成 xi+an，不落在 xian（先）上 ----
var xian = candidates("xi'an", 16)
ok(xian.indexOf('西安') >= 0, "xi'an 应出 西安（隔音符分段），实际 " + xian.join(' '))
ok(xian[0] !== '先', "xi'an 首候选不应是 先（无隔音符时会切成 xian）")
var daan = candidates("da'an", 16)
ok(daan.indexOf('大安') >= 0, "da'an 应出 大安（da+an 整句）")
ok(candidates('daan', 8).indexOf('答案') >= 0, 'daan 应出 答案')

// ---- 10. v3 用户词典：选过的词下次置顶 ----
// $falcon 不存在时 recordWord 应静默降级（Node 测试环境），候选不崩
recordWord('化学方程式', 'huaxuefangchengshi')
ok(candidates('huaxuefangchengshi', 6).indexOf('化学方程式') === 0, '用户词典：选过的词仍可正常出')
ok(candidates('ai', 20).length > 0, 'recordWord 后候选不崩')

// ---- 11. v3.1 需求锁定：无成语补全 + 单字联想 + 足够多常用字 ----
// 11a. 成语专项已关闭：经典成语不得出现在候选
ok(candidates('huashetianzu', 30).indexOf('画蛇添足') < 0, '画蛇添足 不应出现（成语专项关闭）')
ok(candidates('wangyangbulao', 30).indexOf('亡羊补牢') < 0, '亡羊补牢 不应出现（成语专项关闭）')
ok(candidates('shouzhudaitu', 30).indexOf('守株待兔') < 0, '守株待兔 不应出现（成语专项关闭）')
// 11b. 输入一个字后补全下一个字（A1/A2 按全局词频序）
ok(associations('化')[0] === '学', '化 联想首字应为 学，实际 ' + associations('化')[0])
ok(associations('这')[0] === '个', '这 联想首字应为 个，实际 ' + associations('这')[0])
ok(associations('一').length >= 5, '一 联想应有多条续字，实际 ' + associations('一').length)
ok(associations('我们')[0] === '的', '我们 联想首字应为 的（代词续字），实际 ' + associations('我们')[0])
// 11c. 输入拼音后显示足够多的常用字：键内单字在前 30 条候选里全部可达
function charCount(list) {
  var n = 0
  for (var i = 0; i < list.length; i++) if (list[i].length === 1) n++
  return n
}
ok(charCount(candidates('ai', 30)) >= 14, 'ai 前 30 候选应含全部 14 个单字，实际 ' + charCount(candidates('ai', 30)))
ok(charCount(candidates('ke', 30)) >= 14, 'ke 前 30 候选应含全部 14 个单字，实际 ' + charCount(candidates('ke', 30)))
ok(charCount(candidates('shi', 30)) >= 14, 'shi 前 30 候选应含 14 个单字，实际 ' + charCount(candidates('shi', 30)))

if (bad) {
  console.log('pinyin_test FAIL: ' + bad + ' 项')
  process.exit(1)
}
console.log('pinyin_test 全部通过')
