// OpenAI 兼容接口封装
import fs from 'fs'
import { beautify } from './fmt.js'
import { DEFAULTS, MODELS, RELEASE } from './store.js'

var TIMEOUT = 180000

// ===== 请求时间基准 =====
// 每次发请求都把设备当前完整时间注入 system，模型才知道「今天」是哪天。
// 不依赖系统时区配置：UTC 时间戳 +8 小时后一律用 UTC 取值，输出恒为北京时间。
var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

export function nowText() {
  var d = new Date(Date.now() + 8 * 3600 * 1000)
  function p2(n) { return (n < 10 ? '0' : '') + n }
  return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 星期' +
    WEEK_CN[d.getUTCDay()] + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) +
    ':' + p2(d.getUTCSeconds()) + '（北京时间 UTC+8）'
}

// 浅拷贝 + 新建 system 对象：不能改原 messages（那是 chat.vue 的 lastAsk），
// 否则每次重试都会把时间段再追加一遍。
export function stampTime(messages) {
  var out = (messages || []).slice()
  var note = '[时间基准] 当前设备时间：' + nowText() +
    '。涉及「今天 / 现在 / 最新 / 最近 / 今年 / 本周」等时间词时以此为准；与问题无关时不要主动复述时间。'
  if (out.length && out[0] && out[0].role === 'system' && typeof out[0].content === 'string') {
    out[0] = { role: 'system', content: out[0].content + '\n\n' + note }
  } else {
    out.unshift({ role: 'system', content: note })
  }
  return out
}

export function endpoint(baseUrl) {
  var b = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!b) return ''
  if (/\/chat\/completions$/i.test(b)) return b
  if (/\/v\d+$/i.test(b)) return b + '/chat/completions'
  if (/\/api\/paas\/v\d+$/i.test(b)) return b + '/chat/completions'
  return b + '/v1/chat/completions'
}

/**
 * 个别模型的参数约束（2026-11-15 逐个实测，不处理会直接 400）：
 * · Sage-A1.5-Taiyi：拒绝 enable_thinking / thinking_mode
 *   （报 "Unsupported chat parameter"），必须整条不传
 * · kimi-k3.1-pro：只接受 temperature=1
 *   （报 "`temperature` only 1 is allowed for this model"）
 * 其余模型都按用户设置下发。
 */
export function modelTraits(model) {
  var m = String(model || '')
  return {
    noThinkParam: /^Sage-A1\.5-Taiyi$/i.test(m),
    forceTempOne: /^kimi-k3\.1-pro$/i.test(m)
  }
}

// ===== 多提供商 =====
// 每个提供商一套端点 + 一个内置密钥槽。模型表里的 prov 字段决定走哪家，
// 这样用户在设置里点 DeepSeek 的卡片时，请求真的会打到 api.deepseek.com，
// 而不是被智能选路劫持回书生。
export var PROVIDERS = {
  intern: { label: '书生', baseUrl: 'https://discovery-api.intern-ai.org.cn/v1', keyOf: 'discovery' },
  // 书生托管的 DeepSeek（1017）：端点/密钥与书生共用，但独立 prov，
  // 这样智能选路走通用分支保住用户选的模型，不会劫持成 intern-latest
  'intern-ds': { label: '书生·DeepSeek', baseUrl: 'https://discovery-api.intern-ai.org.cn/v1', keyOf: 'discovery' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyOf: 'deepseek' },
  aliyun: { label: '阿里云', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyOf: 'aliyun' }
}

// 只认模型表里的名字；用户手填的模型（自建端点）返回 ''，交给 baseUrl 判断
export function modelProv(model) {
  var m = String(model || '')
  for (var i = 0; i < MODELS.length; i++) {
    if (MODELS[i].name === m) return MODELS[i].prov || 'intern'
  }
  return ''
}

export function providerOf(conf) {
  if (!conf) return ''
  var mp = modelProv(conf.model)
  if (mp) return mp
  var b = conf.baseUrl || ''
  if (/intern-ai\.org\.cn/i.test(b)) return 'intern'
  if (/dashscope\.aliyuncs/i.test(b)) return 'aliyun'
  if (/api\.deepseek\.com/i.test(b)) return 'deepseek'
  return ''
}

// 发图前先问一句「这个模型收不收图」。表里标了纯文本的都不收：
// Atria-Dawn / GLM-5.3 / Taiyi / 通义千问 / DeepSeek-V4-Pro
var TEXT_ONLY = { 'atria-dawn': 1, 'glm-5.3': 1, 'sage-a1.5-taiyi': 1, 'qwen-plus': 1, 'deepseek-v4-pro': 1 }
export function canVision(model) {
  return !TEXT_ONLY[String(model || '').toLowerCase()]
}

// 把约束套到已经组装好的请求体上，返回 traits 供调用方决定是否跳过思考开关
export function applyModelTraits(body, conf) {
  var t = modelTraits((conf && conf.model) || body.model)
  if (t.forceTempOne) body.temperature = 1
  return t
}

// 按 baseUrl 自动选 key：手动填的 apiKey 优先，否则用内置 keys 映射
export function pickKey(conf) {
  if (conf.apiKey) return conf.apiKey
  var keys = conf.keys || {}
  if (/discovery-api\.intern-ai\.org\.cn/i.test(conf.baseUrl || '')) return keys.discovery || ''
  if (/intern-ai\.org\.cn/i.test(conf.baseUrl || '')) return keys.intern || ''
  if (/dashscope\.aliyuncs/i.test(conf.baseUrl || '')) return keys.aliyun || ''
  if (/api\.deepseek\.com/i.test(conf.baseUrl || '')) return keys.deepseek || ''
  return ''
}

function modelsUrl(baseUrl) {
  var e = endpoint(baseUrl)
  return e.replace(/\/chat\/completions$/i, '/models')
}

function parseBody(d) {
  if (d === undefined || d === null) return null
  if (typeof d === 'string') {
    try { return JSON.parse(d) } catch (e) { return null }
  }
  return d
}

function friendly(status, body) {
  var detail = ''
  try {
    if (body && body.error) {
      detail = body.error.message || body.error.code || body.error.type || ''
      if (typeof detail !== 'string') detail = JSON.stringify(detail)
    } else if (typeof body === 'string') {
      detail = body.slice(0, 120)
    }
  } catch (e) {}

  // status=0 表示请求没拿到 HTTP 响应，按 curl 错误码细分，
  // 不要一律报“网络不通”，否则用户无法判断是断网还是模型太慢
  var head = ''
  if (!status) return detail || '网络异常'
  if (status === 401 || status === 403) head = '密钥无效或无权限'
  else if (status === 404) head = '接口地址不对'
  else if (status === 429) head = '请求太频繁或额度用尽'
  else if (status === 400) head = '请求参数有误'
  else if (status >= 500) head = '服务端错误 ' + status
  else head = 'HTTP ' + status
  return detail ? head + '：' + detail : head
}

// curl 退出码 → 人话
export function curlReason(code) {
  var c = Number(code)
  if (c === 28) return '请求超时'
  if (c === 6) return '域名解析失败'
  if (c === 7) return '连不上服务器'
  if (c === 35 || c === 60) return '证书校验失败'
  if (c === 52) return '服务器无响应'
  if (c === 55 || c === 56) return '网络传输中断'
  return '网络异常'
}

/**
 * 历史消息瘦身：图片只在“本轮提问”里发送一次。
 * 之前每轮都把历史图 base64 一起重发，三四轮后请求体涨到 MB 级，
 * 设备端 curl 100 秒硬超时 → 表现为“问几次都网络不通”。
 */
export function slimMessages(list) {
  var out = []
  var last = list.length - 1
  for (var i = 0; i < list.length; i++) {
    var m = list[i]
    var c = m && m.content
    if (i === last || Object.prototype.toString.call(c) !== '[object Array]') {
      out.push({ role: m.role, content: c })
      continue
    }
    var buf = []
    for (var j = 0; j < c.length; j++) {
      var p = c[j]
      if (p && p.type === 'text') buf.push(p.text || '')
      else if (p && p.type === 'image_url') buf.push('[图片]')
    }
    out.push({ role: m.role, content: buf.join(' ') })
  }
  return out
}

// 粗估请求体大小（字符数），用于在过大时主动降级
export function payloadSize(messages) {
  var n = 0
  for (var i = 0; i < messages.length; i++) {
    var c = messages[i].content
    if (typeof c === 'string') n += c.length
    else if (c && c.length) {
      for (var j = 0; j < c.length; j++) {
        if (c[j].type === 'text') n += (c[j].text || '').length
        else if (c[j].image_url) n += (c[j].image_url.url || '').length
      }
    }
  }
  return n
}

// 设备 native curl 层对 UTF-8 中文 body 处理不可靠（实测 400），
// 把非 ASCII 字符全部转成 \uXXXX 转义，这是标准 JSON，服务器解析结果等价
function ensureAscii(s) {
  return s.replace(/[^\x20-\x7E]/g, function (ch) {
    var code = ch.charCodeAt(0)
    var h = code.toString(16)
    while (h.length < 4) h = '0' + h
    return '\\u' + h
  })
}

/**
 * 发一次对话请求
 * @param {object} conf 配置
 * @param {Array} messages OpenAI 格式消息数组
 * @returns {Promise<{ok:boolean, text:string, reasoning:string, error:string, usage:object}>}
 */
export async function chatOnce(conf, messages) {
  var url = endpoint(conf.baseUrl)
  if (!url) return { ok: false, error: '请先填写接口地址' }
  var KEY = pickKey(conf)
  if (!KEY) return { ok: false, error: '请先填写 API 密钥' }

  var body = {
    model: conf.model || 'intern-latest',
    messages: stampTime(messages),
    temperature: typeof conf.temperature === 'number' ? conf.temperature : 0.6,
    stream: false
  }
  // 书生 API 专属：只在关闭深度思考时传 thinking_mode=false；
  // 显式传 true 会导致服务端挂死（实测），默认即为开启
  var burl0 = conf.baseUrl || ''
  var mt0 = applyModelTraits(body, conf)
  if (/discovery-api\.intern-ai\.org\.cn/i.test(burl0)) {
    // discovery 端点用 enable_thinking；开启时不下发（服务端默认思考）
    // Taiyi 连这个参数都不认，传了直接 400
    if (conf.thinkingMode === false && !mt0.noThinkParam) body.enable_thinking = false
  } else if (/intern-ai\.org\.cn/i.test(burl0) && conf.thinkingMode === false && !mt0.noThinkParam) {
    body.thinking_mode = false
  } else if (/api\.deepseek\.com/i.test(burl0)) {
    // DeepSeek 官方：思考开关只认 thinking.type。实测 enable_thinking:false 被无视，
    // 仍会吐 reasoning_content 白烧 token；thinking:{type:'disabled'} 才会真正关掉。
    body.thinking = { type: conf.thinkingMode ? 'enabled' : 'disabled' }
  }
  // 阿里云百炼 qwen：联网搜索开关（searchOn 为按需强制搜索，见 needSearch）
  if (/dashscope\.aliyuncs/i.test(conf.baseUrl || '')) {
    if (conf.searchOn) {
      body.enable_search = true
      body.search_options = { forced_search: true, enable_source: true, search_strategy: 'standard' }
    } else if (conf.webSearch) {
      body.enable_search = true
    }
  }
  if (conf.maxTokens && conf.maxTokens > 0) body.max_tokens = conf.maxTokens

  // native 层对字符串 data 会再次 JSON 序列化（双重编码导致 400），
  // 直接传对象由 native 序列化
  var r
  try {
    r = await $falcon.jsapi.http.request({
      url: url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + KEY
      },
      data: body,
      timeout: TIMEOUT
    })
  } catch (e) {
    return { ok: false, error: '请求失败：' + (e && e.message ? e.message : String(e)) }
  }

  // 系统返回结构: { result: body字符串, error: 错误码/对象 }
  var bodyStr = r && r.result !== undefined ? r.result : r && r.data
  var parsed = parseBody(bodyStr)

  if (r && r.error) {
    // 设备 curl 层失败（含 HTTP 4xx/5xx），错误细节在 result.errorMessage
    var detail = ''
    var resCode = ''
    try {
      var eo = typeof r.result === 'string' ? JSON.parse(r.result) : r.result
      if (eo && eo.errorMessage) detail = String(eo.errorMessage)
      if (eo && eo.resCode) resCode = String(eo.resCode)
    } catch (e2) {}
    var code = typeof r.error === 'number' ? r.error : Number(r.error) || 0
    // 真正常见的形态是 error=3（通用失败），真正的 curl 码埋在 errorMessage 里
    var mcode = /errorCode:\s*(\d+)/.exec(detail)
    if (mcode) code = Number(mcode[1])
    var msg = curlReason(code) + (detail ? '：' + detail : '')
    if (resCode) msg = friendly(Number(resCode), null) + (detail ? '：' + detail : '')
    return {
      ok: false,
      error: msg,
      code: code,
      timeout: code === 28,
      httpStatus: resCode ? Number(resCode) : 0
    }
  }
  if (!parsed || !parsed.choices || !parsed.choices.length) {
    return { ok: false, error: '返回格式异常：' + String(bodyStr).slice(0, 120) }
  }

  var msg = parsed.choices[0].message || {}
  var text = msg.content
  if (Array.isArray(text)) {
    var acc = ''
    for (var i = 0; i < text.length; i++) {
      if (text[i] && text[i].text) acc += text[i].text
    }
    text = acc
  }
  if (!text && msg.reasoning_content) text = msg.reasoning_content
  var clean = plainify(text || '')
  // 空回答/纯空白不算成功，否则会往会话里塞一条空消息、用户以为软件卡了
  if (!clean || !String(clean).replace(/\s/g, '')) {
    return { ok: false, error: '模型返回了空回答（可能额度不足或服务端繁忙），点「重试」再发一次' }
  }
  return {
    ok: true,
    text: clean,
    reasoning: msg.reasoning_content || '',
    usage: parsed.usage || null,
    error: ''
  }
}

// 扫题取件的结果判定。imgd 写的 .scan_result 只有三种可能，
// 判定逻辑抽成纯函数，免得页面里散落字符串比较、改一处漏一处。
//   'OK <源文件>' → attach
//   'ERR no_new'  → nonew   （用户中途退出/没拍）
//   'ERR ffmpeg' 等 → fail
export function scanResultAction(res) {
  var s = String(res || '').trim()
  if (!s) return 'wait'
  if (s.indexOf('OK') === 0) return 'attach'
  if (s.indexOf('no_new') >= 0) return 'nonew'
  return 'fail'
}

// 按任务能力选路：设备实测 文字走旧端点最快(2~26s)，图片走 discovery 的 Sage 最快(3~8s)
export var ROUTE_TEXT = {
  baseUrl: 'https://chat.intern-ai.org.cn/api/v1',
  model: 'intern-latest',
  keyOf: 'intern'
}
// 图片默认走旧端点的 VL 模型：实测 2.5~18s 返回；
// discovery 的 Sage 在笔上多次 100s 硬超时（2026-11-08 实测 3/3 全超时）
export var ROUTE_IMG = {
  baseUrl: 'https://chat.intern-ai.org.cn/api/v1',
  model: 'internvl3.5-latest',
  keyOf: 'intern'
}

/**
 * 智能选路。
 * 原来无脑把请求打回书生：文字走旧端点 intern-latest，图片走 internvl3.5。
 * 接进 DeepSeek 官方后这条规则会把「我明明选了 DeepSeek-Flash」劫持成书生模型，
 * 用户看到的回答和付的钱都对不上。所以改成按提供商分流：
 *   · 书生：保持原行为（文字快通道 / 图片视觉通道），它是这个产品的主通道
 *   · DeepSeek / 阿里云：模型是用户明确选的，只补端点与密钥，绝不换模型
 * 唯一例外是发图时选中了纯文本模型，此时就近换一个能看图的同家模型。
 */
export function routeConf(conf, hasImg) {
  // 发行版删除智选线路：用户选什么模型就走什么模型，不做任何改写
  if (RELEASE) return conf
  if (!conf || !conf.smartRoute) return conf
  var prov = providerOf(conf)
  if (!prov) return conf
  var keys = conf.keys || {}
  var out = Object.assign({}, conf)
  if (prov === 'intern') {
    var r = hasImg ? ROUTE_IMG : ROUTE_TEXT
    out.baseUrl = r.baseUrl
    out.model = r.model
    if (keys[r.keyOf]) out.apiKey = keys[r.keyOf]
    if (hasImg) out.thinkingMode = false
    return out
  }
  var p = PROVIDERS[prov]
  out.baseUrl = p.baseUrl
  if (keys[p.keyOf]) out.apiKey = keys[p.keyOf]
  if (hasImg && !canVision(out.model)) {
    out.model = prov === 'deepseek' ? 'deepseek-flash'
      : prov === 'intern-ds' ? 'Sage-A1.5'
        : 'qwen-vl-max'
  }
  return out
}

// 最后一条消息是否带图
function hasImage(messages) {
  if (!messages || !messages.length) return false
  var c = messages[messages.length - 1].content
  if (Object.prototype.toString.call(c) !== '[object Array]') return false
  for (var i = 0; i < c.length; i++) {
    if (c[i] && c[i].type === 'image_url') return true
  }
  return false
}

// 模型经常无视"不要 LaTeX"的指令，返回 $x^2$、\frac{a}{b}、**加粗**。
// 936×280 的屏幕上这些符号纯属噪声，统一转成可读文本。
// ===== 联网搜索 =====
// 只有阿里云百炼的 compatible-mode 支持 enable_search；书生端点没有实时检索，
// 实测直接回答「我的知识库截至2024年且无法访问实时数据」。
// 智能选路会把请求强制打回书生，所以搜索必须单独选路，不能只靠设置里的开关。
export var SEARCH_ROUTE = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  keyOf: 'aliyun'
}

// 强时效词：出现即认为需要现势信息
var SEARCH_HARD = /新闻|热搜|头条|快讯|股价|汇率|油价|金价|比分|赛程|赛果|票房|天气|气温|实时|发布会|上映|当选|卸任|逝世|地震|台风|新政|新规|限行|放假安排/
// 弱时效词：配合非做题场景才搜
var SEARCH_SOFT = /今天|今日|现在|目前|此刻|当前|最新|最近|近期|刚刚|刚才|本周|这周|本月|今年|昨天|明天/
// 做题场景排除：这些词出现时多半是题目，搜了反而拖慢
var EXAM_HINT = /已知|求证|求解|解方程|化简|计算|证明|求值|选择题|填空题|正确答案|我的答案|解析/

/**
 * 判断这条提问要不要联网。宁可漏搜也不要每题都搜：
 * 搜索通道首字要等 5~9 秒，普通题走快通道 1~3 秒。
 */
export function needSearch(text) {
  var t = String(text || '').trim()
  if (!t) return false
  if (t.length > 120) return false                 // 长材料多半是作文/阅读题
  if (/翻译|作文|造句|改写|续写|扩写|缩写|请以|字数|阅读下面/.test(t)) return false
  if (/^(请)?(帮我)?(查一下|查查|搜一下|搜搜|搜索|百度|谷歌)/.test(t)) return true
  if (SEARCH_HARD.test(t)) return true
  if (SEARCH_SOFT.test(t) && !EXAM_HINT.test(t)) return true
  return false
}

// 生成搜索用的配置；没有可用的阿里云 key 时返回 null（调用方回退普通通道）
// 发行版：联网搜索依赖具体提供商的检索能力（DeepSeek /v1/tools/search、
// 阿里云 enable_search），书生与自定义端点没有——先检测再允许开启。
export function searchSupported(conf) {
  var b = String((conf && conf.baseUrl) || '')
  if (/api\.deepseek\.com/i.test(b)) return true
  if (/dashscope\.aliyuncs/i.test(b)) {
    return /^qwen/i.test(String((conf && conf.model) || ''))
  }
  return false
}

export function searchConf(conf) {
  if (!conf || !conf.webSearch) return null
  if (!searchSupported(conf)) return null
  var keys = conf.keys || {}
  // 旧配置可能缺 aliyun 槽位，从出厂默认值兜底，否则联网搜索永远不可用
  var key = keys.aliyun || (DEFAULTS.keys && DEFAULTS.keys.aliyun) || ''
  if (!key && !/dashscope\.aliyuncs/i.test(conf.baseUrl || '')) return null
  var out = Object.assign({}, conf)
  out.baseUrl = SEARCH_ROUTE.baseUrl
  out.model = SEARCH_ROUTE.model
  out.apiKey = key || conf.apiKey || ''
  if (!out.apiKey) return null
  out.thinkingMode = false
  out.searchOn = true
  return out
}

// ===== 检索前置（DeepSeek 官方 /v1/tools/search） =====
// 和「整包交给 qwen-plus 开 enable_search」相比，这条路把检索与作答拆开：
// 检索只负责拿回结构化网页摘要（站点、发布时间、权威度、重排分），作答仍由
// 用户当前选中的模型完成。好处是换模型不影响联网能力，书生家的模型也能联网；
// 代价是多一次往返（实测 0.3~0.5 秒），以及摘要占 1~2K token。
export var SEARCH_API = 'https://api.deepseek.com/v1/tools/search'

function oneLine(v, n) {
  return String(v || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, n)
}

/**
 * @returns {Promise<{ok:boolean, n:number, block:string, error:string}>}
 * block 已经排好版，可直接拼进 system 提示词
 */
export async function searchWeb(q, key, count) {
  var k = key || (DEFAULTS.keys && DEFAULTS.keys.deepseek) || ''
  if (!k) return { ok: false, error: '没有可用的检索密钥' }
  var body = { query: oneLine(q, 120), count: count || 4 }
  var r
  try {
    r = await $falcon.jsapi.http.request({
      url: SEARCH_API,
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k },
      data: body,
      timeout: 20000
    })
  } catch (e) {
    return { ok: false, error: '检索请求失败：' + (e && e.message ? e.message : String(e)) }
  }
  if (r && r.error) {
    var detail = ''
    var resCode = ''
    try {
      var eo = typeof r.result === 'string' ? JSON.parse(r.result) : r.result
      detail = String((eo && eo.errorMessage) || '')
      if (eo && eo.resCode) resCode = String(eo.resCode)
    } catch (e2) {}
    var code = typeof r.error === 'number' ? r.error : Number(r.error) || 0
    var mcode = /errorCode:\s*(\d+)/.exec(detail)
    if (mcode) code = Number(mcode[1])
    var why = resCode ? friendly(Number(resCode), null) : curlReason(code)
    return { ok: false, error: why + (detail ? '：' + detail.slice(0, 80) : ''), code: code }
  }
  var p = parseBody(r && r.result !== undefined ? r.result : r && r.data)
  var list = p && p.results
  if (!list || !list.length) return { ok: false, error: '没有检索到结果' }
  var lines = []
  for (var i = 0; i < list.length && i < 4; i++) {
    var it = list[i] || {}
    var meta = []
    if (it.site_name) meta.push(it.site_name)
    if (it.date) meta.push(String(it.date).slice(0, 10))
    lines.push((i + 1) + '. ' + (meta.length ? '【' + meta.join(' · ') + '】' : '') +
      oneLine(it.title, 60) + '\n' + oneLine(it.summary || it.snippet, 420))
  }
  return { ok: true, n: lines.length, block: '【联网检索结果】\n' + lines.join('\n') }
}

// 把检索结果挂到 system 上。新建对象替换，不原地改（同 stampTime 的原因）
export function injectSearch(messages, block) {
  if (!block) return messages
  var out = (messages || []).slice()
  var note = '\n\n' + block +
    '\n\n以上是提问时刚抓到的网页摘要，可能夹带无关内容。涉及事实、数据、时间、价格、赛程、天气时优先采用，' +
    '并在句末用（来源：站点名）标注；摘要与问题无关或明显过时，就按你自己的知识回答，并说明信息可能不是最新。' +
    '不要复述这段检索说明本身。'
  if (out.length && out[0] && out[0].role === 'system' && typeof out[0].content === 'string') {
    out[0] = { role: 'system', content: out[0].content + note }
  } else {
    out.unshift({ role: 'system', content: note })
  }
  return out
}

// 搜索走的是纯文本模型，历史里的图片必须换成占位文字，否则 400
export function stripImages(messages) {
  return (messages || []).map(function (m) {
    var c = m && m.content
    if (Object.prototype.toString.call(c) !== '[object Array]') return m
    var txt = ''
    for (var i = 0; i < c.length; i++) {
      var it = c[i]
      if (it && it.type === 'text') txt += (txt ? '\n' : '') + it.text
    }
    return { role: m.role, content: txt || '[图片]' }
  })
}

var BS = String.fromCharCode(92)
var CMD_MAP = {
  times: '×', div: '÷', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  neq: '≠', ne: '≠', pi: 'π', pm: '±', infty: '∞', triangle: '△',
  angle: '∠', alpha: 'α', beta: 'β', theta: 'θ', gamma: 'γ', circ: '°',
  left: '', right: '', quad: ' ', qquad: ' ', '%': '%',
  int: '∫', iint: '∬', oint: '∮', sum: '∑', prod: '∏',
  partial: '∂', nabla: '∇', because: '∵', therefore: '∴',
  parallel: '∥', perp: '⊥', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
  leftrightarrow: '↔', degree: '°', prime: '′',
  delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', rho: 'ρ', sigma: 'σ',
  Sigma: 'Σ', omega: 'ω', Omega: 'Ω', phi: 'φ', Phi: 'Φ', eta: 'η', zeta: 'ζ',
  xi: 'ξ', psi: 'ψ', chi: 'χ', kappa: 'κ', nu: 'ν', tau: 'τ'
}

// 组合符号：ARROW 是字母上方的矢量箭头（U+20D7），MACRON 是平均值的上横线（U+0304）
var ARROW = String.fromCharCode(0x20d7)
var MACRON = String.fromCharCode(0x0304)
var BAR = 'bar'

// 希腊字母命令：映射成符号后，紧跟的排版空格要去掉（\Delta x 是 Δx，不是 "Δ x"）
var GREEK_CMD = {
  alpha: 1, beta: 1, theta: 1, gamma: 1, delta: 1, Delta: 1, lambda: 1, mu: 1,
  rho: 1, sigma: 1, Sigma: 1, omega: 1, Omega: 1, phi: 1, Phi: 1, eta: 1,
  zeta: 1, xi: 1, psi: 1, chi: 1, kappa: 1, nu: 1, tau: 1, pi: 1
}

function readGroup(t, i) {
  if (t.charAt(i) !== '{') return null
  var depth = 0
  var start = i + 1
  for (var j = i; j < t.length; j++) {
    var ch = t.charAt(j)
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { content: t.slice(start, j), next: j + 1 }
    }
  }
  return null
}

var ALPHA = /[a-zA-Z]/

// 扫描 \cmd{..}{..}，按语义替换，避免正则里反斜杠转义踩坑
// ---- 垂直分数：\frac{a}{b} → 三行块（分子居中 / ─分数线─ / 分母居中） ----
// 真机验证过 ─ (U+2500) 字形；nbsp (U+00A0) 行首不折叠，用于居中。
// 分子/分母过长或含换行时退化为横写 (a)/(b)，避免断行破坏对齐。
function fracW(s) {
  var w = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    w += c > 0x2e80 ? 2 : 0.62
  }
  return w
}

function padCenter(s, w) {
  var left = Math.floor(Math.max(0, w - fracW(s)) / 2 / 0.62)
  var r = ''
  for (var i = 0; i < left; i++) r += '\u00a0'
  return r + s
}

function fracBlock(num, den) {
  num = String(num)
  den = String(den)
  if (!num || !den) return (num || '0') + '/' + (den || '1')
  if (num.length > 18 || den.length > 18 || num.indexOf('\n') >= 0 || den.indexOf('\n') >= 0) {
    return '(' + num + ')/(' + den + ')'
  }
  var w = Math.max(fracW(num), fracW(den))
  var bars = Math.max(3, Math.ceil(w / 1.24))
  var line = ''
  for (var k = 0; k < bars; k++) line += '\u2500'
  return '\n' + padCenter(num, w) + '\n' + line + '\n' + padCenter(den, w) + '\n'
}

// ---- 下标字形与数学函数名：\log_2 → log₂，\sin → sin ----
var SUB_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ',
  'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
}

// 这些是"函数名"，不是排版命令；直接保留文字，绝不能被当成未知命令丢掉
var MATH_WORDS = {
  sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1,
  arcsin: 1, arccos: 1, arctan: 1, sinh: 1, cosh: 1, tanh: 1,
  log: 1, ln: 1, lg: 1, lim: 1, max: 1, min: 1, det: 1, exp: 1, mod: 1
}

function mapSub(s) {
  var out = ''
  for (var i = 0; i < s.length; i++) {
    var g = SUB_MAP[s.charAt(i)]
    if (!g) return null
    out += g
  }
  return out || null
}

function readSub(t, i) {
  if (t.charAt(i) === '{') {
    var g = readGroup(t, i)
    if (!g) return null
    return { text: stripCommands(g.content), next: g.next }
  }
  // 连续字母整体作下标：F_net → Fₙₑₜ、v_avg → ᵥₐᵥɢ。
  // 只吃一个字符的话 F_net 会变成 Fₙet，物理里复合下标太常见，必须成串吃。
  var m = /^[A-Za-z]{2,6}/.exec(t.slice(i))
  if (m) return { text: m[0], next: i + m[0].length }
  var ch = t.charAt(i)
  if (!ch || !/[0-9a-zA-Z+\-=]/.test(ch)) return null
  return { text: ch, next: i + 1 }
}

// 行内分式：一律 a/b，含运算符的一侧加括号（横线渲染前由 frac.js 剥掉外层括号）。
// 不再替换成 ½ 这类单个字符：客户要求的是「分子/横线/分母」竖排，
// 单字符形式既不竖排、也看不出分子分母，笔屏上反而更难读。
function fracInline(num, den) {
  num = String(num || '0')
  den = String(den || '1')
  var needN = /[+\-×÷·=<>≤≥\s]/.test(num)
  var needD = /[+\-×÷·=<>≤≥\s]/.test(den)
  return (needN ? '(' + num + ')' : num) + '/' + (needD ? '(' + den + ')' : den)
}

function stripCommands(t) {
  // 30^\circ → 30°：否则 ^ 会残留成 "30^°"；保留命令后面的空格
  t = t.replace(/\^\s*\{?\s*\\circ\}?(\s*)/g, '°$1')
  var out = ''
  var i = 0
  while (i < t.length) {
    var cur = t.charAt(i)
    // 下标：x_1 / x_{n+1} / \log_2 → ₂ 之类；没有对应字形时保留原样
    if (cur === '_') {
      var sub = readSub(t, i + 1)
      if (sub) {
        var s = mapSub(sub.text)
        if (s !== null) { out += s; i = sub.next; continue }
        // 没有对应下标字形（如 lim_{x→0}）时退化成括号，避免漏出下划线和花括号
        out += '(' + sub.text + ')'
        i = sub.next
        continue
      }
      out += cur
      i++
      continue
    }
    if (cur !== BS) {
      out += cur
      i++
      continue
    }
    var j = i + 1
    var name = ''
    while (j < t.length && ALPHA.test(t.charAt(j))) {
      name += t.charAt(j)
      j++
    }
    if (!name) {
      var ch = t.charAt(j)
      if (ch === ',' || ch === ';' || ch === '!' || ch === ' ') {
        out += ' '
        i = j + 1
        continue
      }
      out += ch === undefined ? '' : ch
      i = j + 1
      continue
    }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      // 模型偶尔写成 \frac {1}{2}（命令和参数之间有空格），readGroup 只认紧邻的 {
      var jf = j
      while (jf < t.length && (t.charAt(jf) === ' ' || t.charAt(jf) === '\t')) jf++
      var g1 = readGroup(t, jf)
      var g2 = g1 ? readGroup(t, g1.next) : null
      if (g1 && g2) {
        // 分子/分母里的命令（比如 10^{-14} 前的 \times）也要一起转，否则会漏出反斜杠
        out += fracInline(stripCommands(g1.content), stripCommands(g2.content))
        i = g2.next
        continue
      }
    }
    if (name === 'sqrt') {
      // \sqrt[3]{8} 的 n 次根指数（可选 [..] 前缀）
      var rootIdx = ''
      var jj = j
      if (t.charAt(jj) === '[') {
        var rb = t.indexOf(']', jj)
        if (rb > jj && rb - jj <= 4) {
          rootIdx = t.slice(jj + 1, rb)
          jj = rb + 1
        }
      }
      var gs = readGroup(t, jj)
      if (gs) {
        var idx = ''
        if (rootIdx && /^[0-9]+$/.test(rootIdx)) {
          var sm = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
          for (var si = 0; si < rootIdx.length; si++) idx += sm[rootIdx.charAt(si)] || ''
        }
        out += idx + '√(' + stripCommands(gs.content) + ')'
        i = gs.next
        continue
      }
    }
    if (name === 'text' || name === 'mathrm' || name === 'mathbf') {
      var gt = readGroup(t, j)
      if (gt) {
        out += gt.content
        i = gt.next
        continue
      }
    }
    // 矢量/平均符：vec 命令 → 字母上加箭头，bar 命令 → 字母上加横线
    // 没有这个分支时 {F} 会原样漏到正文，变成 "{F}=m{a}" —— 物理受力题必踩。
    if (name === 'vec' || name === 'overrightarrow' || name === 'bar') {
      var gv = readGroup(t, j)
      if (gv) {
        out += stripCommands(gv.content) + (name === BAR ? MACRON : ARROW)
        i = gv.next
        continue
      }
      var cv = t.charAt(j)
      if (cv && ALPHA.test(cv)) {
        out += cv + (name === BAR ? MACRON : ARROW)
        i = j + 1
        continue
      }
    }
    if (MATH_WORDS[name] === 1) { out += name; i = j; continue }
    out += CMD_MAP.hasOwnProperty(name) ? CMD_MAP[name] : ''
    i = j
    // 希腊字母后的排版空格：\Delta t → Δt
    if (GREEK_CMD[name] === 1 && t.charAt(i) === ' ' && t.charAt(i + 1) !== ' ' &&
        t.charAt(i + 1) !== String.fromCharCode(10)) i++
  }
  return out
}

function stripRules(t) {
  var out = []
  var lines = t.split(String.fromCharCode(10))
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i]
    var s = raw.trim()
    var isRule = s.length >= 3
    var ch = s.charAt(0)
    if (isRule && ch !== '-' && ch !== '*' && ch !== '_') isRule = false
    if (isRule) {
      for (var j = 1; j < s.length; j++) {
        if (s.charAt(j) !== ch) {
          isRule = false
          break
        }
      }
    }
    if (!isRule) out.push(raw)
  }
  return out.join(String.fromCharCode(10))
}

export function plainify(s) {
  if (!s) return ''
  var t = String(s)
  // @//smiles/ 是新提示词约定的前缀，归一化成 @smiles 走同一条保护/解析路径
  t = t.replace(/@\/\/\s*smiles\s*\/?/gi, '@smiles')
  // @SMILES 行要原样保留：下标/箭头/公式美化会把 SMILES 改坏
  var hold = []
  t = t.split('\n').map(function (line) {
    if (line.toLowerCase().indexOf('@smiles') >= 0) {
      hold.push(line)
      // 占位符里的序号不能用阿拉伯数字：beautify 会把 SMILES0 的 0 当成化学下标，
      // 还原正则就再也匹配不上，整行变成 \u0001SMILES₀\u0001（实测踩过）
      return '\u0001SMILES' + String.fromCharCode(65 + hold.length - 1) + '\u0001'
    }
    return line
  }).join('\n')
  // markdown：标题、加粗、斜体、行内代码
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  t = t.replace(/__([^_\n]+)__/g, '$1')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
  t = t.replace(/`([^`\n]+)`/g, '$1')
  // 列表符号：* / + / - 后带空格的才是列表项；-CH3 这种结构简式开头不受影响
  t = t.replace(/^([ \t]*)[*+\-][ \t]+/gm, '$1· ')
  // 有序列表：去掉 **加粗** 后会残留 "1.  乙醇" 这样的双空格，在窄屏上白占一格
  t = t.replace(/^([ \t]*)([0-9]{1,2})\.[ \t]{1,}/gm, '$1$2. ')
  // LaTeX 分隔符
  t = t.split(BS + '(').join('').split(BS + ')').join('')
  t = t.split(BS + '[').join('').split(BS + ']').join('')
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, '$1')
  t = t.replace(/\$([^$\n]+)\$/g, '$1')
  // 命令
  t = stripCommands(t)
  // markdown 分隔线（--- / *** / ___）在小屏上只是噪声
  t = stripRules(t)
  // 引用块标记 > 在纯文本里只是噪声
  t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, '')
  // 化学式下标 / 幂次上标 / 离子电荷 / 反应箭头 / ASCII 结构图清理
  t = beautify(t)
  // 搜索结果里的长链接在 936 宽屏上要占三四行，笔上又点不开，只留域名
  t = t.replace(/https?:\/\/([^\s/)\]）]+)[^\s)\]）]*/g, '$1')
  t = t.replace(/\n{3,}/g, '\n\n')
  // 还原被保护的结构指令行
  t = t.replace(/\u0001SMILES([A-Z])\u0001/g, function (m, ch) {
    var v = hold[ch.charCodeAt(0) - 65]
    return v === undefined ? '' : v
  })
  return t.replace(/^\s+/, '').replace(/\s+$/, '')
}

/**
 * 书生平台限流预拦截（官方：全部 API Key 共享 50 次/分钟 + 200 万 Token/分钟）。
 * 本地滑动窗口计数，超限直接拒绝发请求并给出等待秒数，避免撞 429 白耗配额。
 * 页面重载后计数清零——只能防本应用自身的连发，属尽力而为的客户端保护。
 */
var RATE = { stamps: [], tok: [] }
var RATE_RPM = 50
var RATE_TPM = 2000000

export function rateGate(estTokens) {
  var now = Date.now()
  RATE.stamps = RATE.stamps.filter(function (t) { return now - t < 60000 })
  if (RATE.stamps.length >= RATE_RPM) {
    var waitS = Math.ceil((60000 - (now - RATE.stamps[0])) / 1000)
    return '已达接口调用上限（50 次/分钟），约 ' + waitS + ' 秒后可再发'
  }
  RATE.tok = RATE.tok.filter(function (p) { return now - p.t < 60000 })
  var used = 0
  for (var i = 0; i < RATE.tok.length; i++) used += RATE.tok[i].n
  if (used + estTokens > RATE_TPM) {
    return '已达 Token 上限（200 万/分钟），请约 1 分钟后再试'
  }
  RATE.stamps.push(now)
  RATE.tok.push({ t: now, n: estTokens })
  return ''
}

/**
 * 带自愈的提问：先按用户配置发；超时则自动降级重试一次
 * （关闭深度思考 + 只带本轮问题），避免用户反复看到失败。
 */
export async function chatAsk(conf, messages) {
  var slim = slimMessages(messages)
  var size = payloadSize(slim)
  var withImg = hasImage(slim)
  // 限流预拦截：请求字符数粗估 token（中文 1 字≈1 token，取 1.5 倍冗余），输出再留 2K 余量
  var est = Math.ceil(size / 1.5) + 2000
  var blocked = rateGate(est)
  if (blocked) {
    return { ok: false, error: blocked, timeout: false }
  }
  var r = await chatOnce(conf, slim)

  if (r.ok) {
    r.note = ''
    r.bytes = size
    return r
  }

  // 只在“超时/网络中断”时重试；鉴权、参数、额度类错误重试没意义
  if (!r.timeout) return r

  // 图片走的是视觉模型，超时通常是服务端排队；自动重试会让人多等一倍时间，
  // 交给用户点「重试」更可控
  if (withImg) {
    r.error = '图片识别超时了（书生视觉模型当前排队较慢），点「重试」再发一次'
    return r
  }

  var fast = Object.assign({}, conf)
  fast.thinkingMode = false
  var brief = []
  if (slim.length && slim[0].role === 'system') brief.push(slim[0])
  brief.push(slim[slim.length - 1])

  var r2 = await chatOnce(fast, brief)
  if (r2.ok) {
    r2.note = '首次请求超时，已自动用快速模式重答'
    r2.bytes = size
    return r2
  }
  r2.error = '两次都超时。' + r2.error + '（可把模型换成 qwen-plus 或关闭深度思考再试）'
  return r2
}

export async function testConnection(conf) {
  var url = modelsUrl(conf.baseUrl)
  if (!url) return { ok: false, msg: '接口地址为空' }
  try {
    var r = await $falcon.jsapi.http.request({
      url: url,
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + pickKey(conf) },
      timeout: 20000
    })
    if (r && r.error) return { ok: false, msg: curlReason(r.error) + '（code ' + r.error + '）' }
    var parsed = parseBody(r && r.result)
    if (parsed && parsed.data && parsed.data.length) {
      return { ok: true, msg: '连接正常，共 ' + parsed.data.length + ' 个模型' }
    }
    return { ok: true, msg: '连接正常' }
  } catch (e) {
    return { ok: false, msg: '连接失败：' + String(e) }
  }
}

/**
 * 拉取 OpenAI 兼容端点的模型列表（GET {baseUrl}/models）。
 * 发行版设置页的「拉取模型列表」走这里：用户填好接口地址和密钥后
 * 一键获取可选模型，点选写入 conf.model。列表随 conf 持久化，
 * 下次进设置页不用重新拉。
 * @returns {{ok:boolean, msg:string, models:Array<string>}}
 */
export async function listModels(conf) {
  var url = modelsUrl(conf.baseUrl)
  if (!url) return { ok: false, msg: '请先填写接口地址', models: [] }
  if (!pickKey(conf)) return { ok: false, msg: '请先填写 API 密钥', models: [] }
  try {
    var r = await $falcon.jsapi.http.request({
      url: url,
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + pickKey(conf) },
      timeout: 20000
    })
    if (r && r.error) return { ok: false, msg: curlReason(r.error) + '（code ' + r.error + '）', models: [] }
    var parsed = parseBody(r && r.result)
    var ids = []
    if (parsed && parsed.data && parsed.data.length) {
      for (var i = 0; i < parsed.data.length; i++) {
        var it = parsed.data[i]
        // 兼容三种返回：{id} / {model} / 纯字符串（个别自建网关）
        var id = it && (it.id || it.model || it)
        if (typeof id === 'string' && id.length <= 80) ids.push(id)
      }
    }
    if (!ids.length) {
      return { ok: true, msg: '连接正常，但该端点没有返回模型列表（可在「模型名」里手动填写）', models: [] }
    }
    ids.sort()
    return { ok: true, msg: '获取到 ' + ids.length + ' 个模型，点选即可切换', models: ids }
  } catch (e) {
    return { ok: false, msg: '获取失败：' + String(e), models: [] }
  }
}

// ================= token 估算 =================
// 口径与 PenChat 一致：ASCII 每个字符约 1/3 token，其他 Unicode 码点约 2 token，
// 每条消息加 16 个封装 token，每张图按 2048 估。这是本地调度用的近似值，
// 服务端返回真实 usage 时一律以 usage 为准。
export function estTokens(text) {
  var s = String(text || '')
  if (!s) return 0
  var ascii = 0
  var other = 0
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 128) ascii++
    else other++
  }
  var t = Math.ceil(ascii / 3) + other * 2
  return t
}

export function estMsgTokens(m) {
  if (!m) return 0
  var c = m.content
  var t = 16
  if (typeof c === 'string') {
    t += estTokens(c)
  } else if (Object.prototype.toString.call(c) === '[object Array]') {
    for (var i = 0; i < c.length; i++) {
      var p = c[i]
      if (p && p.type === 'text') t += estTokens(p.text)
      else if (p && p.type === 'image_url') t += 2048
    }
  }
  return t
}

export function estReqTokens(messages) {
  var sum = 0
  var arr = messages || []
  for (var i = 0; i < arr.length; i++) sum += estMsgTokens(arr[i])
  return sum
}

// ================= 真流式：依赖笔上 penai-streamd.sh =================
// 设备 jsapi 的 http.request 只能整包返回，没有分块回调。
// 这里改为：JS 写请求文件 → 常驻脚本用系统 curl 持 SSE 写文件 →
// JS 按行偏移轮询增量。streamd 不在时返回 noStream，调用方回退整包。

function streamSleep(ms) {
  return new Promise(function (res) { setTimeout(res, ms) })
}

// 导出供测试用：直接喂 SSE 增量验证解析（usage 抓取、思考与正文累积）
export function parseSSEBlock(part, acc) {
  var lines = String(part || '').split('\n')
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i]
    if (ln.length < 6 || ln.indexOf('data:') !== 0) continue
    var p = ln.slice(5).replace(/^\s+|\s+$/g, '')
    if (!p) continue
    if (p === '[DONE]') { acc.done = true; continue }
    try {
      var j = JSON.parse(p)
      var ch = j && j.choices && j.choices[0]
      var d = ch && ch.delta
      if (ch && ch.finish_reason) acc.fin = String(ch.finish_reason)
      // 部分服务商会在最后一个 chunk 里带真实 usage，抓到就用精确值
      if (j.usage && j.usage.prompt_tokens !== undefined) acc.usage = j.usage
      if (!d) continue
      if (d.reasoning_content) acc.think = acc.think + d.reasoning_content
      if (d.content) acc.text = acc.text + d.content
    } catch (e) {}
  }
}

/**
 * 流式提问
 * @param {object} conf
 * @param {Array} messages
 * @param {function} onDelta 收到新内容时回调 {text, think}（累积值）
 * @param {object} [abort] 终止信号 {v:boolean}：调用方把 v 置真即终止生成，
 *        已收到的部分内容仍会随返回值带回（stopped:true 标记）
 * @returns {Promise<{ok,text,reasoning,error,note,stream,noStream,stopped,usage}>}
 */
export async function askStream(conf, messages, onDelta, abort) {
  var dir = '/tmp/penai_stream'
  var alive = false
  try { alive = await fs.exists(dir) } catch (e0) {}
  if (!alive) return { ok: false, noStream: true, error: 'streamd 未运行' }

  var url = endpoint(conf.baseUrl)
  if (!url) return { ok: false, error: '请先填写接口地址' }
  var KEY = pickKey(conf)
  if (!KEY) return { ok: false, error: '请先填写 API 密钥' }

  var body = {
    model: conf.model || 'intern-latest',
    messages: stampTime(messages),
    temperature: typeof conf.temperature === 'number' ? conf.temperature : 0.6,
    stream: true
  }
  var burl = conf.baseUrl || ''
  var mt1 = applyModelTraits(body, conf)
  if (/discovery-api\.intern-ai\.org\.cn/i.test(burl)) {
    if (conf.thinkingMode === false && !mt1.noThinkParam) body.enable_thinking = false
  } else if (/intern-ai\.org\.cn/i.test(burl) && conf.thinkingMode === false && !mt1.noThinkParam) {
    body.thinking_mode = false
  } else if (/api\.deepseek\.com/i.test(burl)) {
    body.thinking = { type: conf.thinkingMode ? 'enabled' : 'disabled' }
  }
  if (/dashscope\.aliyuncs/i.test(burl)) {
    if (conf.searchOn) {
      body.enable_search = true
      body.search_options = { forced_search: true, enable_source: true, search_strategy: 'standard' }
    } else if (conf.webSearch) {
      body.enable_search = true
    }
  }
  if (conf.maxTokens && conf.maxTokens > 0) body.max_tokens = conf.maxTokens

  var id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36)
  var reqPath = dir + '/' + id + '.req'
  var outPath = dir + '/' + id + '.out'
  var errPath = dir + '/' + id + '.err'
  var donePath = dir + '/' + id + '.done'

  // 带图片时 body 里有 base64，先量一下体积；超过 3 MB 就交回整包请求，
  // 避免在笔上把几 MB 字符串反复写进 tmpfs。
  var payload = JSON.stringify(body)
  if (payload.length > 3000000) return { ok: false, tooBig: true }

  try {
    await fs.writeFile(reqPath, url + '\n' + KEY + '\n' + payload)
  } catch (e1) {
    return { ok: false, noStream: true, error: '写请求文件失败：' + (e1 && e1.message ? e1.message : e1) }
  }

  // 行为级探活：streamd 收到请求的第一步就是 mv .req → .run。
  // 只查目录存在不可靠（2026-11-20 事故：脚本被 adb push 覆盖丢执行权限，
  // 看护拉起秒死，但 /tmp/penai_stream 目录一直在）——JS 会空等 90 秒超时。
  // 这里 1.5 秒内 .req 没被消费就判定 streamd 不在，交回调用方回退整包。
  var runPath = dir + '/' + id + '.run'
  var consumed = false
  for (var iw = 0; iw < 10; iw++) {
    await streamSleep(150)
    var isRun = false
    try { isRun = await fs.exists(runPath) } catch (eW) {}
    if (isRun) { consumed = true; break }
    var stillReq = false
    try { stillReq = await fs.exists(reqPath) } catch (eW2) {}
    if (!stillReq) { consumed = true; break }
  }
  if (!consumed) {
    try { await fs.rm(reqPath) } catch (eW3) {}
    return { ok: false, noStream: true, error: 'streamd 无响应' }
  }

  var pos = 0
  var acc = { text: '', think: '', done: false }
  var stopped = false
  // 总时长上限 10 分钟；真正起作用的是空闲超时：90 秒没有任何新字节才放弃。
  // 深度思考 + 长回答可能持续几分钟，但只要有数据在流，就不该判超时。
  var hardDeadline = Date.now() + 600000
  var lastData = Date.now()
  var idleLimit = 90000

  while (Date.now() < hardDeadline) {
    // 终止：通知 streamd 杀掉 curl，已收到的部分照常带回
    if (abort && abort.v) {
      stopped = true
      try { await fs.writeFile(dir + '/' + id + '.stop', '1') } catch (eS) {}
      break
    }
    await streamSleep(140)
    var raw = ''
    try { raw = await fs.readFile(outPath) } catch (e3) {}
    if (raw) {
      var s = String(raw)
      var cut = s.lastIndexOf('\n')
      if (cut >= pos) {
        var part = s.slice(pos, cut)
        pos = cut + 1
        if (part) {
          lastData = Date.now()
          parseSSEBlock(part, acc)
          if (onDelta) onDelta({ text: acc.text, think: acc.think })
        }
      }
    }
    if (Date.now() - lastData > idleLimit) break

    var finished = false
    try { finished = await fs.exists(donePath) } catch (e4) {}
    if (finished) {
      // 收尾：最后一行可能没有换行符
      try {
        var lastRaw = String(await fs.readFile(outPath) || '')
        if (lastRaw.length > pos) {
          parseSSEBlock(lastRaw.slice(pos), acc)
          pos = lastRaw.length
          if (onDelta) onDelta({ text: acc.text, think: acc.think })
        }
      } catch (e6) {}
      break
    }
  }

  var errText = ''
  try { errText = String(await fs.readFile(errPath) || '') } catch (e7) {}

  try { await fs.rm(outPath) } catch (e8) {}
  try { await fs.rm(errPath) } catch (e9) {}
  try { await fs.rm(donePath) } catch (e10) {}
  try { await fs.rm(reqPath) } catch (e11) {}
  try { await fs.rm(dir + '/' + id + '.stop') } catch (e12) {}

  if (!acc.text && !acc.think) {
    if (stopped) return { ok: false, stopped: true, error: '已终止生成' }
    var why = errText ? errText.replace(/\s+/g, ' ').slice(0, 200) : '没有拿到内容'
    return { ok: false, error: '流式请求失败：' + why }
  }
  // 只有思考没有正文：多半是 max_tokens 被思考吃光（finish_reason=length）。
  // 直接返回空文本会在屏幕上留下一条空白回答，这里给可操作的提示。
  if (!acc.text && acc.think) {
    // 终止时只有思考没正文：把思考当作部分结果带回，页面自行取舍
    if (stopped) {
      return { ok: true, stream: true, text: '', reasoning: acc.think, usage: acc.usage || null, stopped: true, note: '已终止生成' }
    }
    var tip = acc.fin === 'length'
      ? '思考过程用完了本次长度上限，正文还没开始。到设置里把「最大长度」调到 2000 以上，或关闭「深度思考」再问'
      : '这次只返回了思考过程，没有正文。点「重试」再发一次，或关闭「深度思考」再问'
    return { ok: false, error: tip, reasoningOnly: true }
  }

  return {
    ok: true,
    stream: true,
    text: acc.text,
    reasoning: acc.think,
    usage: acc.usage || null,
    stopped: stopped,
    note: stopped ? '已终止生成，保留已生成的部分' : (acc.done ? '' : '流式响应未正常收尾，已显示收到的部分')
  }
}

export function buildUserContent(text, images) {
  if (!images || !images.length) return text
  var arr = [{ type: 'text', text: text || '请看图' }]
  for (var i = 0; i < images.length; i++) {
    arr.push({ type: 'image_url', image_url: { url: images[i] } })
  }
  return arr
}

// 按轮数截取历史；上限 100 轮。再按总字符量封顶（16 万字符 ≈ 8 万汉字），
// 防止 100 轮长对话把请求体撑爆导致超时/内存压力。
export function trimHistory(messages, rounds) {
  var r = parseInt(rounds, 10)
  if (isNaN(r) || r < 1) r = 6
  if (r > 100) r = 100
  var keep = r * 2
  var out = messages.length <= keep ? messages.slice(0) : messages.slice(messages.length - keep)
  var LIMIT = 160000
  var total = 0
  var i
  for (i = 0; i < out.length; i++) {
    var c = out[i] && out[i].content
    total += typeof c === 'string' ? c.length : (c && c.length ? c.length * 64 : 0) // 图按 64 字符估
  }
  while (out.length > 2 && total > LIMIT) {
    var dropped = out.shift()
    var c0 = dropped && dropped.content
    total -= typeof c0 === 'string' ? c0.length : (c0 && c0.length ? c0.length * 64 : 0)
  }
  return out
}
