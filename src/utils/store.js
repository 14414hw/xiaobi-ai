// 配置与会话持久化
import fs from 'fs'

// 发行版开关：唯一在源码里出现的一处。tools/make_release.mjs 构建发行包时
// 把它替换成 true，产出一个与调试版并存安装的独立应用（不同 appid、
// 不同存储目录、无诊断后门、公式/化学提示词强制锁定）。
// 调试版（本工程直构）永远是 false，行为与历史版本一致。
export var RELEASE = true

var CONF_KEY = 'penai_conf_v1'
// 存储目录必须按发行/调试分开：两版并存时共用 /userdisk/penai 会互相
// 读写对方的 session/history/stars，历史页直接串台。
export var SESSION_DIR = RELEASE ? '/userdisk/penair' : '/userdisk/penai'

// 版本号的唯一来源：界面左上角、诊断日志、安装包三处都读它。
// 以前界面里写死 'v1.9.18'，版本升到 1.9.20 后界面还显示旧号，
// 核对线上到底是哪一版时会直接误判，所以不再允许硬编码。
// tools/tests/version_test.mjs 会比对 package.json，防止再次漂移。
// 发行版走独立版本线（1.0.0 起），与调试版的 1.x.x 互不干扰。
// 发行分支由 tools/make_release.mjs 按 RELEASE_VERSION 自动改写，不要在此手工维护。
export var APP_VERSION = RELEASE ? '1.0.2' : '1.11.3'

// ---- 提示词分段 ----
// 发行版要求「公式、化学结构式的输出规范强制内置、用户改不掉」：
// 把默认提示词拆成四段，CORE（公式 + 化学）在任何情况下都参与合成，
// 用户在设置页写的只是「补充要求」。调试版行为不变（用户改整段）。
var P_ROLE = '你是一位耐心的高中老师，面向高三学生解答问题，默认用简体中文回答。'

// 核心规范：与客户端的渲染管线一一对应——
//   公式段 → frac.js 的分式识别、√ 与 ^ 的解析、禁 LaTeX（设备渲染不支持）
//   化学段 → molsRender 的 @//smiles/ 提取 + chemAudit 的分子式交叉校验
// 动这段必须同步跑 frac_test / chem_audit_test / organic_corpus_test。
export var CORE_PROMPT = '公式写法：一律用纯文本，不要用 LaTeX，不要出现 $ 符号。乘方写 x^2，根号写 √3，圆周率写 π，不等号写 ≤ ≥ ≠。分数写成 a/b（如 3/5）；分子或分母本身是式子时加括号，如 (x+1)/(x-1)。三角函数用 sin、cos、tan 小写英文，后面空一格，如 sin A、sin^2 A。化学反应式用 → ⇌ ↑ ↓。\n\n化学结构：不要用斜杠竖线拼画六边形之类的结构图，改用结构简式加文字说明，如 CH3CH2OH（乙醇）。回答中出现的有机物（题目里的、答案涉及的）都尽量另起一行单独写：@//smiles/ 该分子的SMILES 中文名 分子式，例如 @//smiles/ c1ccccc1O 苯酚 C6H6O。SMILES 支持手性标记 [C@H]/[C@@H]、同位素 [13C]、聚合物端点 *、金属配合物 [Cu] 等写法，涉及立体异构、同位素示踪、高分子时直接使用。分子式必须与 SMILES 一致，写完自己核对一遍；不确定就省略分子式，不要编。只对含碳骨架的有机物写这一行，离子和无机物用化学式文字表示即可。SMILES 必须化学正确，一次最多 3 个，不确定就不写。'

var P_FORMAT = '回答要求：不要用表格。解题类问题按以下格式输出，解析要具体、写出依据，不能只给结论：\n题目分析\n本题是......题型，考点包含......，解题关键是......\n分步解析\n解析内容\n答案\n非解题类问题直接回答，不必套用这个格式。长度按题目难度决定，简单问题讲清楚就行，复杂题该详细就详细。'

var P_EFFORT = '尽最大努力解答用户的问题，不要用「我无法回答」来回避可以解答的内容。'

// 调试版的默认整段提示词（历史行为：用户可在设置页整段编辑）
var FULL_PROMPT = P_ROLE + '\n\n' + CORE_PROMPT + '\n\n' + P_FORMAT + '\n\n' + P_EFFORT

/**
 * 合成实际发送的系统提示词。
 * 调试版：用户写了就用用户的，没写用默认整段（历史行为不变）。
 * 发行版：角色 + CORE 规范 + 格式 + 补充（用户写的），CORE 永远在，
 *         用户的补充以「教师补充要求」段落在最后（权重最高）。
 * settings.vue 与 chat.vue 的发送点都必须经过它，不许直接读 conf.systemPrompt。
 */
export function composePrompt(user) {
  var u = String(user || '').replace(/^\s+|\s+$/g, '')
  if (!RELEASE) return u || FULL_PROMPT
  return P_ROLE + '\n\n' + CORE_PROMPT + '\n\n' + P_FORMAT + '\n\n' + P_EFFORT +
    (u ? '\n\n【教师补充要求，优先级高于以上全部】' + u : '')
}

export var DEFAULTS = {
  // 发行版不预填任何接口地址（含书生网址）：全部由用户手工自填，避免
  // 「开箱即连我们家端点」的合规问题。调试版保留默认值方便开发。
  baseUrl: RELEASE ? '' : 'https://discovery-api.intern-ai.org.cn/v1',
  apiKey: '',
  keys: {
    discovery: '',
    intern: '',
    aliyun: '',
    deepseek: ''
  },
  model: RELEASE ? '' : 'Sage-A1.5',
  temperature: 0.6,
  maxTokens: 0,
  thinkingMode: false,
  showThink: true,
  // 调试版默认整段提示词；发行版里 systemPrompt 只承载「补充要求」，默认为空
  systemPrompt: RELEASE ? '' : FULL_PROMPT,
  historyRounds: 6,
  webSearch: true,
  smartRoute: true,
  selfTest: false,
  typingAnim: false,
  // 界面动效：0 关闭 / 1 标准 / 2 流畅。流畅档按屏幕刷新率（本机 60Hz）
  // 出帧，入场、旋转指示、扫描条都更顺，同时更耗电；关闭档不建任何动画定时器。
  animLevel: 1,
  studyMode: false,
  // 输入方式：system=系统键盘（startTextEdit，默认），custom=自研键盘页（理科符号页）
  kbMode: 'system',
  confRev: 9
}

// 模型表（2026-11-15 按两家控制台核对；v1.9.27 应用户要求加回书生托管的 1017）
// meta 格式：类型 · 上下文 · 价格(基点/百万Token，输入/输出) [· 备注]
// prov 决定请求打到哪个端点：intern=书生托管，intern-ds=书生托管的 DeepSeek，
// deepseek=DeepSeek 官方，aliyun=阿里云百炼。
// 类型里带「图」表示支持图片输入，标「纯文本」的发图会失败。
// Decision-4B 是 SystemOne 协议，OpenAI 兼容层返回 404，故不列入可选表。
// 书生托管的 deepseek-v4.1-flash-1017（2026-11-19 实测已恢复 active，支持图文）：
// 官方直连同一模型便宜约 4~9 倍（闲时 110/430 vs 书生 1000/4000），但书生走
// discovery 端点月度有免费墨点，且官方版高峰价会翻倍，故两条通道并存供用户选。
// intern-ds 单列 prov 是因为智能选路对 intern 会强制切快通道模型（见 routeConf），
// 直接用 intern 会导致「选了 1017 实际跑 intern-latest」。
// 发行版不提供预设模型表：模型由用户从自己接口的 /models 列表里选。
export var MODELS = RELEASE ? [] : [
  { name: 'Sage-A1.5', label: 'Sage-A1.5', prov: 'intern', meta: '多模态 · 512K · 16/64 · 解题看图首选' },
  { name: 'Agents-A1', label: 'Agents-A1', prov: 'intern', meta: '多模态 · 256K · 16/64 · 深度思考' },
  { name: 'Sage-A1.5-Taiyi', label: 'Sage-A1.5-Taiyi', prov: 'intern', meta: '智能体 · 512K · 32/128 · 纯文本' },
  { name: 'Atria-Dawn', label: 'Atria-Dawn', prov: 'intern', meta: '纯文本 · 512K · 80/280 · 长文' },
  { name: 'intern-s2', label: '书生-S2', prov: 'intern', meta: '多模态 · 256K · 30/180' },
  { name: 'qwen3.8-27b', label: 'Qwen3.8-27B', prov: 'intern', meta: '多模态 · 256K · 800/2700' },
  { name: 'glm-5.3', label: 'GLM-5.3', prov: 'intern', meta: '纯文本 · 1M · 8000/28000' },
  { name: 'kimi-k3.1-pro', label: 'Kimi-K3.1-Pro', prov: 'intern', meta: '多模态 · 1M · 13000/68000 · 最贵' },
  { name: 'deepseek-v4.1-flash-1017', label: 'DeepSeek-V4.1-Flash', prov: 'intern-ds', meta: '多模态 · 1M · 1000/4000 · 书生托管' },
  { name: 'deepseek-flash', label: 'DeepSeek-Flash', prov: 'deepseek', meta: '多模态 · 1M · 110/430 · 官方直连，最便宜' },
  { name: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', prov: 'deepseek', meta: '纯文本 · 1M · 470/1400 · 官方直连，重推理' },
  { name: 'qwen-plus', label: '通义千问', prov: 'aliyun', meta: '纯文本 · 1M · 80/200 · 阿里云，可联网' }
]

// 发行版同样不提供服务商快捷预设（含书生端点），全部手工填写。
export var PRESETS = RELEASE ? [] : [
  { label: '书生(推荐)', baseUrl: 'https://discovery-api.intern-ai.org.cn/v1', model: 'Sage-A1.5', keyOf: 'discovery', thinking: false },
  { label: '书生(深思)', baseUrl: 'https://discovery-api.intern-ai.org.cn/v1', model: 'Agents-A1', keyOf: 'discovery', thinking: true },
  { label: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', keyOf: 'deepseek', thinking: false },
  { label: '阿里云(可联网)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyOf: 'aliyun', thinking: false },
  { label: '书生(旧端点)', baseUrl: 'https://chat.intern-ai.org.cn/api/v1', model: 'intern-latest', keyOf: 'intern' },
  { label: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '本地/自建', baseUrl: 'http://192.168.1.2:1234/v1', model: 'local' }
]

function hasStorage() {
  try {
    return !!($falcon.jsapi && $falcon.jsapi.storage)
  } catch (e) {
    return false
  }
}

// rev6：把旧提示词里"分数会变成上下结构"的错误承诺改成实际行为。
// 只动这一句，用户自定义的其余内容（学科约束、格式要求）一律保留。
var FRAC_PROMPT_NEW = '（分数例外：请用 \\frac{分子}{分母} 写法，显示时会转成 ½ 或 a/b 的紧凑形式，比 1/2x 这类写法更不容易看错）'

export function migrateFracPrompt(sp) {
  var s = String(sp || '')
  if (s.indexOf('上下结构') < 0 && s.indexOf('上下两行') < 0) return s
  var seg = /（分数例外[^）]*）/.exec(s)
  if (seg) return s.replace(seg[0], FRAC_PROMPT_NEW)
  return s.replace(/显示时[^，。；）]*上下结构[^，。；）]*/g, '显示时会转成 ½ 或 a/b 的紧凑形式')
}

export async function loadConf() {
  var conf = {}
  for (var k in DEFAULTS) conf[k] = DEFAULTS[k]
  try {
    if (hasStorage()) {
      var r = await $falcon.jsapi.storage.getStorage({ key: CONF_KEY })
      var raw = r && r.data
      if (raw) {
        var obj = typeof raw === 'string' ? JSON.parse(raw) : raw
        for (var k2 in obj) {
          if (obj[k2] !== undefined && obj[k2] !== null) conf[k2] = obj[k2]
        }
        // 注意：这里原来有一段"只要提示词不含「只对含碳骨架」就整段换回默认"的
        // 无条件迁移。它在每次 loadConf 都会执行，用户改过的提示词下次启动就被
        // 悄悄覆盖，等于「系统提示词」设置不可用。旧配置的升级已由下面的
        // rev<5 / rev<7 分支按版本处理，这段删除（2026-11-21）。
        // 一次性迁移到书生 discovery 端点（识图从 60~100s 降到 2s）
        // rev3：GLM-5.3 官方模型 ID 为小写 glm-5.3
        // rev4：提示词升级为高中老师版（@//smiles/ 前缀 + 题目解答固定格式）；旧默认提示词自动跟随，用户自定义（不含旧标记）保留
        // rev5：分数写法升级（\frac → 上下结构渲染）
        // rev6：显示口径修正。v1.4 起实现已是 ½ / a/b 行内显示，旧提示词却仍
        //       承诺"会自动变成上下结构"。只替换这一句，保留用户自定义的其余内容。
        var rev = parseInt(conf.confRev, 10)
        if (isNaN(rev)) rev = 1
        if (rev < 5) {
          if (/^https:\/\/chat\.intern-ai\.org\.cn/i.test(conf.baseUrl || '') || !conf.baseUrl) {
            conf.baseUrl = DEFAULTS.baseUrl
            conf.model = DEFAULTS.model
            conf.thinkingMode = false
          }
          if (conf.model === 'GLM-5.3') conf.model = 'glm-5.3'
          var sp = String(conf.systemPrompt || '')
          if (sp.indexOf('@SMILES') >= 0 || sp.indexOf('中学老师') >= 0 || sp.indexOf('高中老师') >= 0) {
            conf.systemPrompt = DEFAULTS.systemPrompt
          }
          var hr = parseInt(conf.historyRounds, 10)
          if (isNaN(hr) || hr < 1) conf.historyRounds = 6
          else if (hr > 100) conf.historyRounds = 100
          rev = 5
        }
        if (rev < 6) {
          conf.systemPrompt = migrateFracPrompt(conf.systemPrompt)
          rev = 6
        }
        if (rev < 7) {
          // rev7：提示词整体重写。旧版（含 rev6 迁移后的用户定制版）有两处硬伤：
          // ①「禁止使用 LaTeX」后面紧跟「分数例外：请用 \frac{分子}{分母} 写法」，
          //    自相矛盾。模型据此把所有分数都写成 \frac，实测 5/5 命中，虽然
          //    清洗层能转成 ⅗，但多耗输出 token，且复杂分母会膨胀成 (x²+1)/(x-1)。
          // ② 输出格式模板最后一行「答案」被追加文字污染成「答案用户是高三学生…」，
          //    模板结尾不再是干净的「答案」。
          // 新版把这些诉求（详细解析、高三定位、三角函数纯文本、SMILES 规范）
          // 全部并入且不冲突，因此整段替换而非逐句打补丁。
          // 温度不动：那是用户权衡过的参数，不在提示词范围内。
          conf.systemPrompt = DEFAULTS.systemPrompt
          rev = 7
        }
        if (rev < 8) {
          // rev8：接入 DeepSeek 官方直连。书生托管的 deepseek-v4.1-flash-1017 与
          // 老的 deepseek-chat 都已不在可选表里，用户之前选过就平滑换到官方 flash。
          // 只改模型名，端点交给智能选路按 prov 自动配，不动用户填的 baseUrl/apiKey
          // ——那是他自己搭的端点，贸然覆盖会把人家的自建服务弄坏。
          var om = String(conf.model || '')
          if (om === 'deepseek-v4.1-flash-1017' || om === 'deepseek-chat') conf.model = 'deepseek-flash'
          rev = 8
        }
        if (rev < 9) {
          // rev9：结构式输出多加一个分子式，客户端拿它和 SMILES 解析结果交叉校验。
          // 只改这一句，用户自定义的其余提示词内容一律保留；没写过 @//smiles/ 的
          // 完全自定义提示词不动。
          var sp9 = String(conf.systemPrompt || '')
          if (sp9.indexOf('@//smiles/') >= 0 && sp9.indexOf('分子式必须与 SMILES 一致') < 0) {
            sp9 = sp9.replace(
              /需要展示某个分子结构时[^\n]*?不确定就不写。/,
              '需要展示某个分子结构时，另起一行单独写：@//smiles/ 该分子的SMILES 中文名 分子式，例如 @//smiles/ c1ccccc1O 苯酚 C6H6O。分子式必须与 SMILES 一致，写完自己核对一遍；不确定就省略分子式，不要编。只对含碳骨架的有机物写这一行，离子和无机物用化学式文字表示即可。SMILES 必须化学正确，一次最多 3 个，不确定就不写。'
            )
            conf.systemPrompt = sp9
          }
          rev = 9
        }
        if (rev !== parseInt(conf.confRev, 10)) {
          conf.confRev = rev
          try { await saveConf(conf) } catch (e1) {}
        }
        // 每次加载补齐缺失的内置密钥槽：旧配置或用户手改可能只存了部分 keys，
        // 缺 aliyun 会让联网搜索通道直接不可用（真机回归 rev6 时发现）。
        // 只在槽位为空时补，用户明确填过的值一律保留。
        if (!conf.keys || typeof conf.keys !== 'object') conf.keys = {}
        var filled = false
        for (var dk in DEFAULTS.keys) {
          if (!conf.keys[dk]) { conf.keys[dk] = DEFAULTS.keys[dk]; filled = true }
        }
        if (filled) { try { await saveConf(conf) } catch (e2) {} }
      }
    }
  } catch (e) {
    console.log('loadConf failed: ' + e)
  }
  return conf
}

export async function saveConf(conf) {
  if (!hasStorage()) return false
  try {
    await $falcon.jsapi.storage.setStorage({ key: CONF_KEY, data: JSON.stringify(conf) })
    return true
  } catch (e) {
    console.log('saveConf failed: ' + e)
    return false
  }
}

// ---- 草稿：退出页面再进来不丢已经打好的问题 ----
var DRAFT_KEY = 'penai_draft_v1'

export async function loadDraft() {
  if (!hasStorage()) return ''
  try {
    var r = await $falcon.jsapi.storage.getStorage({ key: DRAFT_KEY })
    var v = r && r.data
    return typeof v === 'string' ? v : ''
  } catch (e) {
    return ''
  }
}

export async function saveDraft(t) {
  if (!hasStorage()) return false
  try {
    await $falcon.jsapi.storage.setStorage({ key: DRAFT_KEY, data: String(t || '') })
    return true
  } catch (e) {
    return false
  }
}

// ---- 会话（单条主线，落盘到 userdisk） ----

export async function loadSession() {
  try {
    var txt = await fs.readFile(SESSION_DIR + '/session.json')
    if (txt && typeof txt === 'string') return JSON.parse(txt)
    if (txt) return txt
  } catch (e) {}
  return { messages: [] }
}

// 会话落盘前把图片 base64 抹掉：否则 session.json 会随图片张数膨胀到几 MB，
// 每次冷启动解析都变慢。历史里的图反正也不会重发。
function stripImages(session) {
  var msgs = (session && session.messages) || []
  var out = []
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i]
    var c = m.content
    if (Object.prototype.toString.call(c) === '[object Array]') {
      var parts = []
      for (var j = 0; j < c.length; j++) {
        var p = c[j]
        if (p && p.type === 'text') parts.push(p.text || '')
        else if (p && p.type === 'image_url') parts.push('[图片]')
      }
      out.push({ role: m.role, content: parts.join(' '), ts: m.ts, cost: m.cost, reasoning: m.reasoning || '' })
    } else {
      out.push(m)
    }
  }
  return { messages: out }
}

export async function saveSession(session) {
  try {
    try { await fs.mkdir(SESSION_DIR) } catch (e) {}
    var slim = stripImages(session)
    // 本轮命名（chat 顶栏「命名」设置）随会话落盘，归档时再带进历史
    if (session && session.title) slim.title = String(session.title).slice(0, 30)
    await fs.writeFile(SESSION_DIR + '/session.json', JSON.stringify(slim))
    return true
  } catch (e) {
    console.log('saveSession failed: ' + e)
    return false
  }
}

// ---- 历史会话存档：点「新对话」时把旧会话滚进来，FIFO 最多 20 段 ----
var HISTORY_FILE = SESSION_DIR + '/history.json'

export async function loadArchive() {
  try {
    var txt = await fs.readFile(HISTORY_FILE)
    var arr = typeof txt === 'string' ? JSON.parse(txt) : txt
    if (Array.isArray(arr)) return arr
  } catch (e) {}
  return []
}

function archiveBrief(s) {
  var msgs = (s && s.messages) || []
  var firstUser = ''
  for (var i = 0; i < msgs.length; i++) {
    if (msgs[i] && msgs[i].role === 'user') {
      var c = msgs[i].content
      firstUser = typeof c === 'string' ? c : '[图片]'
      if (firstUser.length > 30) firstUser = firstUser.slice(0, 30) + '…'
      break
    }
  }
  var t = s && s.messages && s.messages.length ? (s.messages[s.messages.length - 1].ts || Date.now()) : Date.now()
  var d = new Date(t)
  var pad = function (x) { return x < 10 ? '0' + x : '' + x }
  var when = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  return { when: when, first: firstUser, count: msgs.length }
}

export async function archiveSession(session) {
  try {
    var msgs = (session && session.messages) || []
    var real = 0
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i]
      if (m && (m.role === 'user' || m.role === 'assistant')) {
        var c = m.content
        var len = typeof c === 'string' ? c.length : (c && c.length ? c.length : 0)
        if (len > 0) real++
      }
    }
    if (real < 2) return 'empty' // 空会话/无实质内容不占位
    var list = await loadArchive()
    var entry = stripImages(session)
    entry.brief = archiveBrief(session)
    // 本轮命名随归档带进历史列表（历史页可再改名）
    if (session.title) entry.title = String(session.title).slice(0, 30)
    list.unshift(entry)
    if (list.length > 20) list = list.slice(0, 20)
    try { await fs.mkdir(SESSION_DIR) } catch (e1) {}
    await fs.writeFile(HISTORY_FILE, JSON.stringify(list))
    return true
  } catch (e) {
    return false
  }
}

export async function deleteArchive(idx) {
  try {
    var list = await loadArchive()
    if (idx >= 0 && idx < list.length) {
      list.splice(idx, 1)
      await fs.writeFile(HISTORY_FILE, JSON.stringify(list))
    }
    return true
  } catch (e) {
    return false
  }
}

// 历史管理（重命名/置顶）需要改写整份存档后原样写回；
// 只有历史页在用，字段约定：title（用户起的标题）、pinned（置顶标记）
export async function saveArchive(list) {
  try {
    try { await fs.mkdir(SESSION_DIR) } catch (e0) {}
    await fs.writeFile(HISTORY_FILE, JSON.stringify(list || []))
    return true
  } catch (e) {
    return false
  }
}

export async function clearArchive() {
  try {
    await fs.writeFile(HISTORY_FILE, '[]')
  } catch (e) {}
  return true
}
