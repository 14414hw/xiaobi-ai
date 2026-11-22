<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #12131a;">
    <!-- v1.9.30 改版：标题栏与预览行合并成一行（空文本时显示标题，否则显示编辑内容），
         省出的高度全部给按键区：keyH 38 → 45，候选条 34 → 38。 -->
    <div style="height: 40px; padding-left: 10px; padding-right: 10px; background-color: #161821; display: flex; flex-direction: row; align-items: center;">
      <div style="flex: 1; display: flex; flex-direction: row; align-items: center;">
        <text v-if="!text.length" style="font-size: 16px; color: #5c667c;">{{ title }}</text>
        <div v-if="text.length" style="display: flex; flex-direction: row; align-items: center;">
          <text v-if="prevView.head" @click="tapHead" style="font-size: 21px; color: #7c869c;">{{ prevView.head }}</text>
          <text v-for="(ch, i) in prevView.chars" :key="'p' + i" @click="tapAt(prevView.start + i)" :style="prevCharStyle(prevView.start + i)">{{ ch }}</text>
          <text @click="tapEnd(prevView.end)" :style="endStyle(prevView.end)">⌶</text>
          <text v-if="prevView.tail" @click="tapEnd(prevView.end)" style="font-size: 21px; color: #7c869c;">{{ prevView.tail }}</text>
        </div>
      </div>
      <text @click="cancelEdit" style="font-size: 15px; color: #ff9a9a; background-color: #3a2430; padding-left: 10px; padding-right: 10px; padding-top: 4px; padding-bottom: 4px; border-radius: 6px; margin-right: 6px;">取消</text>
      <text @click="moveLeft" style="font-size: 17px; color: #ffffff; background-color: #333849; padding-left: 11px; padding-right: 11px; padding-top: 4px; padding-bottom: 4px; border-radius: 6px; margin-right: 6px;">←</text>
      <text @click="moveRight" style="font-size: 17px; color: #ffffff; background-color: #333849; padding-left: 11px; padding-right: 11px; padding-top: 4px; padding-bottom: 4px; border-radius: 6px; margin-right: 8px;">→</text>
      <text style="font-size: 16px; color: #ffffff; background-color: #2a6df4; padding-top: 4px; padding-bottom: 4px; padding-left: 12px; padding-right: 12px; border-radius: 6px;" @click="done">完成</text>
    </div>

    <scroller style="height: 38px;" scroll-direction="horizontal" :show-scrollbar="false">
      <div style="display: flex; flex-direction: row; align-items: center; padding-top: 2px; padding-bottom: 2px; padding-left: 8px; padding-right: 8px;">
        <text v-if="pinyinBuf" style="font-size: 20px; color: #6ee7a8; margin-right: 10px;">{{ pinyinBuf }}</text>
        <text v-if="pinyinBuf && candidates.length" @click="commitRaw" style="font-size: 17px; color: #c8cfdd; background-color: #3a3f52; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; margin-right: 8px; border-radius: 8px;">原文</text>
        <text v-if="pinyinBuf && !candidates.length" style="font-size: 16px; color: #a9b7cf; margin-right: 10px;">无匹配·空格直出</text>
        <text v-for="(c, i) in candidates" :key="'c' + i" @click="pick(c)" @touchstart="candIn(i)" @touchend="candOut" :style="candStyle(i, i === candHot)">{{ c }}</text>
      </div>
    </scroller>

    <div style="background-color: #0d0e13;">
      <div v-for="(row, ri) in rows" :key="'r' + ri" style="display: flex; flex-direction: row;">
        <div v-for="(k, ki) in row" :key="'k' + ri + '_' + ki" :style="keyStyle(k, ri, ki)" @click="press(k)" @touchstart="touchIn(k, ri, ki)" @touchend="touchOut" @touchcancel="touchOut">
          <text :style="keyTextStyle(k)">{{ k.label }}</text>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { candidates, associations, phraseSuggest, warmup, recordWord } from '../../utils/pinyin.js'
import EN_RAW from '../../data/english-data.js'

// 英文前缀联想：词表按频率序，线性扫描（千余词，每键一次，开销可忽略）
var EN_WORDS = null
function enWords() {
  if (!EN_WORDS) EN_WORDS = EN_RAW.split(',')
  return EN_WORDS
}
function enSuggest(seg, limit) {
  var words = enWords()
  var out = []
  var low = seg.toLowerCase()
  if (!low) return out
  for (var i = 0; i < words.length && out.length < limit; i++) {
    var w = words[i]
    if (w.length > low.length && w.indexOf(low) === 0) out.push(w)
  }
  return out
}

var W = 280
var H = 280
try {
  if ($falcon.env && $falcon.env.deviceWidth) W = $falcon.env.deviceWidth
  if ($falcon.env && $falcon.env.deviceHeight) H = $falcon.env.deviceHeight
} catch (e) {}

var COLS = 10
var PAD = 2
// v1.9.30：顶栏（预览+按钮）40 + 候选 38 + 4 行键盘，压进 280 留余量
// 旧版标题栏/预览行分开占 80px，按键只有 38 高，客户反馈不如竞品舒适
var TOPBAR = 40
var PREVIEW = 0
var CANDS = 38
var keyH = 45
var keyW = (W - PAD * (COLS + 1)) / COLS
if (TOPBAR + PREVIEW + CANDS + (keyH + PAD * 2) * 4 > H - 4) {
  keyH = Math.floor((H - 4 - TOPBAR - PREVIEW - CANDS) / 4) - PAD * 2
}

var LETTER_ROWS = [
  [
    { l: 'q', s: 1 }, { l: 'w', s: 1 }, { l: 'e', s: 1 }, { l: 'r', s: 1 }, { l: 't', s: 1 },
    { l: 'y', s: 1 }, { l: 'u', s: 1 }, { l: 'i', s: 1 }, { l: 'o', s: 1 }, { l: 'p', s: 1 }
  ],
  [
    { l: 'a', s: 1 }, { l: 's', s: 1 }, { l: 'd', s: 1 }, { l: 'f', s: 1 }, { l: 'g', s: 1 },
    { l: 'h', s: 1 }, { l: 'j', s: 1 }, { l: 'k', s: 1 }, { l: 'l', s: 1 }
  ],
  [
    { l: '⇧', s: 1.4, k: 'shift' }, { l: 'z', s: 1 }, { l: 'x', s: 1 }, { l: 'c', s: 1 },
    { l: 'v', s: 1 }, { l: 'b', s: 1 }, { l: 'n', s: 1 }, { l: 'm', s: 1 },
    { l: '删', s: 1.4, k: 'back' }
  ],
  [
    { l: '123', s: 1.6, k: 'num' },
    { l: '中', s: 1.6, k: 'lang' },
    { l: '空格', s: 3.4, k: 'space' },
    { l: ',', s: 1, k: 'dot' },
    { l: '.', s: 1, k: 'dot' },
    { l: '?', s: 1.4, k: 'char' }
  ]
]

var NUM_ROWS = [
  [
    { l: '1', s: 1 }, { l: '2', s: 1 }, { l: '3', s: 1 }, { l: '4', s: 1 }, { l: '5', s: 1 },
    { l: '6', s: 1 }, { l: '7', s: 1 }, { l: '8', s: 1 }, { l: '9', s: 1 }, { l: '0', s: 1 }
  ],
  [
    { l: '@', s: 1 }, { l: '#', s: 1 }, { l: '$', s: 1 }, { l: '%', s: 1 }, { l: '&', s: 1 },
    { l: '*', s: 1 }, { l: '-', s: 1 }, { l: '_', s: 1 }, { l: '+', s: 1 }, { l: '=', s: 1 }
  ],
  [
    { l: '/', s: 1 }, { l: ':', s: 1 }, { l: ';', s: 1 }, { l: '(', s: 1 }, { l: ')', s: 1 },
    { l: '[', s: 1 }, { l: ']', s: 1 }, { l: '{', s: 1 }, { l: '}', s: 1 }, { l: '删', s: 1, k: 'back' }
  ],
  [
    { l: 'ABC', s: 1.6, k: 'num' },
    { l: '理科', s: 1.6, k: 'sym' },
    { l: '空格', s: 3.4, k: 'space' },
    { l: ',', s: 1, k: 'dot' },
    { l: '.', s: 1, k: 'dot' },
    { l: '!', s: 1.4, k: 'char' }
  ]
]

// 理科符号专页：只收录真机验证 PuHuiTi 有字形的字符。
// 明确无字形的 ∛ ∜ ↦ ⇄ ⇀ ⇅ ⇵ ⃗，以及会降级成拉丁字母的兼容单位 ㏄ ㎏ ㎝ ㎜ ㏒ ㏑ ℡
// 一律不收（分别用 ³√、→、cc/kg/cm 等已有写法代替）。
// 每页 3 行符号 × 10 键 + 1 行功能键，复用现有 4 行布局，不增加高度。
var SCI_FUNC_ROW = [
  { l: 'ABC', s: 1.6, k: 'num' },
  { l: '123', s: 1.6, k: 'page1' },
  { l: '空格', s: 3.4, k: 'space' },
  { l: '删', s: 1.4, k: 'back' },
  { l: '⇄', s: 2, k: 'symnext' }
]

function symRow(s) {
  var arr = s.split(' ')
  var out = []
  for (var i = 0; i < arr.length; i++) out.push({ l: arr[i], s: 1, k: 'char' })
  return out
}

var SCI_ROWS = [
  [ // 1/4 数学·几何与运算
    symRow('∠ ⊥ ∥ △ ≌ ∽ ≅ ≡ ≈ ≠'),
    symRow('≤ ≥ ± × ÷ ∝ ∞ ∴ ∵ √'),
    symRow('∑ ∏ ∫ ∮ ∂ ∇ π θ α β'),
    SCI_FUNC_ROW
  ],
  [ // 2/4 数学·集合逻辑与分数
    symRow('∈ ∉ ⊆ ⊇ ⊂ ⊃ ∪ ∩ ∅ ∀'),
    symRow('∃ ⇒ ⇔ → ← ↔ ↑ ↓ ↗ ↘'),
    symRow('½ ⅓ ⅔ ¼ ¾ ⅕ ⅛ ‰ ° ′'),
    SCI_FUNC_ROW
  ],
  [ // 3/4 物理·希腊字母与单位
    symRow('Ω μ ε Δ Φ ω λ ν ρ σ'),
    symRow('τ η κ Γ Λ Σ Ψ ℏ ℓ ℃'),
    symRow('℉ Å ⁻¹ ² ³ ⁿ ‖ · ⌒ ∼'),
    SCI_FUNC_ROW
  ],
  [ // 4/4 化学·反应与离子
    symRow('⇌ ⇋ ⇆ → ↑ ↓ △ Δ · ⇒'),
    symRow('⁺ ⁻ ²⁺ ³⁺ ²⁻ ³⁻ ₀ ₁ ₂ ₃'),
    symRow('₄ ⁿ (s) (l) (g) (aq) % mol ΔH pH'),
    SCI_FUNC_ROW
  ]
]
var SCI_PAGES = SCI_ROWS.length

// 空输入框时的快捷字：按汉语常用度排，点一下直接上屏
var QUICK_CN = [
  '的', '是', '不', '了', '在', '我', '有', '和', '就', '人',
  '这', '中', '你', '为', '上', '他', '时', '来', '用', '们'
]

export default {
  data() {
    return {
      title: '输入',
      text: '',
      pinyinBuf: '',
      cands: [],
      lang: 'cn',
      page: 0,
      shift: false,
      cur: 0,
      hotKey: '',
      hotCand: -1,
      repTimer: null,
      repDelay: null,
      repeatGuard: false,
      capsLock: false,
      originText: '',
      fullwidth: false
    }
  },

  computed: {
    // 预览区逐字符渲染：点任意字符把光标移到它前面，⌶ 表示窗口末尾插入点
    prevView() {
      var t = this.text || ''
      var c = this.cur
      if (c < 0) c = 0
      if (c > t.length) c = t.length
      var WIN = 38
      var start = 0
      if (t.length > WIN) {
        start = c - Math.round(WIN * 0.6)
        if (start < 0) start = 0
        if (start + WIN > t.length) start = Math.max(0, t.length - WIN)
      }
      var end = Math.min(t.length, start + WIN)
      return {
        start: start,
        end: end,
        head: start > 0 ? '…' : '',
        chars: t.slice(start, end).split(''),
        tail: end < t.length ? '…' : ''
      }
    },
    candidates() {
      return this.cands
    },
    rows() {
      // Falcon 跨页参数可能把数字序列化成字符串，统一先归一为整数再判断
      var p = parseInt(this.page, 10)
      if (isNaN(p)) p = 0
      var base
      if (p === 0) base = LETTER_ROWS
      else if (p === 1) base = NUM_ROWS
      else base = SCI_ROWS[p - 2] || SCI_ROWS[0]
      var out = []
      for (var i = 0; i < base.length; i++) {
        var row = []
        for (var j = 0; j < base[i].length; j++) {
          var k = base[i][j]
          var label = k.l
          if (p === 0 && (this.shift || this.capsLock) && label.length === 1 && label >= 'a' && label <= 'z') {
            label = label.toUpperCase()
          }
          if (k.k === 'lang') label = this.lang === 'cn' ? '中' : 'EN'
          if (k.k === 'num') label = p === 0 ? '123' : 'ABC'
          if (k.k === 'shift') label = this.capsLock ? '⇪' : '⇧'
          if (k.k === 'symnext') label = '理科 ' + (p - 1) + '/' + SCI_PAGES
          // 拼音缓冲期间空格键就是「选首选」，明示出来不用猜
          if (k.k === 'space' && this.pinyinBuf && this.cands.length) label = '选词'
          row.push({ label: label, span: k.s, action: k.k || 'char', raw: k.l })
        }
        out.push(row)
      }
      return out
    }
  },

  mounted() {
    // 词库有 9000+ 拼音键，首次建索引需要百余毫秒；放在页面打开时做，避免第一个字母卡顿
    try { warmup() } catch (e0) {}
    var opt = this.$page.loadOptions || {}
    this.title = opt.title || '输入'
    this.text = opt.data || ''
    this.originText = this.text
    this.cur = this.text.length
    this.lang = opt.lang === 'en' ? 'en' : 'cn'
    // 中文自由文本才做全角标点转换；settings 编辑数字/密钥/URL 时传 lang:'en' 或不带 fullwidth
    this.fullwidth = opt.fullwidth === true
    this.cands = []
    // 诊断用：调用方可指定初始页（0 字母 / 1 数字 / 2~5 理科）；正常调用不传则默认字母页
    if (opt.page !== undefined && opt.page !== null) {
      var pg = parseInt(opt.page, 10)
      if (!isNaN(pg) && pg >= 0 && pg <= 5) this.page = pg
    }
    // 空输入框直接摆一排高频字，键盘一打开就有内容可点
    this.refreshAssoc()
  },

  methods: {
    // 点选定位：点字符 → 光标到该字符前；拼音缓冲期间忽略
    tapAt(i) {
      if (this.pinyinBuf) return
      var c = i
      if (c < 0) c = 0
      if (c > this.text.length) c = this.text.length
      this.cur = c
      this.$forceUpdate()
    },
    tapHead() {
      this.tapAt(this.prevView.start)
    },
    tapEnd(end) {
      if (this.pinyinBuf) return
      this.cur = end < this.text.length ? end : this.text.length
      this.$forceUpdate()
    },
    prevCharStyle(i) {
      return {
        fontSize: '21px',
        color: i === this.cur ? '#7cc4ff' : '#e8ecf5',
        backgroundColor: i === this.cur ? '#23406e' : 'transparent',
        paddingTop: '2px',
        paddingBottom: '2px',
        paddingLeft: '1px',
        paddingRight: '1px'
      }
    },
    endStyle(end) {
      var atCur = this.cur === end
      return {
        fontSize: '21px',
        color: atCur ? '#7cc4ff' : '#7c869c',
        backgroundColor: atCur ? '#23406e' : 'transparent',
        paddingTop: '2px',
        paddingBottom: '2px',
        paddingLeft: '2px',
        paddingRight: '2px'
      }
    },
    insert(ch) {
      if (!ch) return
      var t = this.text
      var c = this.cur
      if (c < 0) c = 0
      if (c > t.length) c = t.length
      this.text = t.slice(0, c) + ch + t.slice(c)
      this.cur = c + ch.length
    },
    moveLeft() {
      if (this.pinyinBuf) return
      if (this.cur > 0) this.cur = this.cur - 1
      this.refreshAssoc()
    },
    moveRight() {
      if (this.pinyinBuf) return
      if (this.cur < this.text.length) this.cur = this.cur + 1
      this.refreshAssoc()
    },
    keyStyle(k, ri, ki) {
      var w = Math.round(keyW * k.span + PAD * (k.span - 1))
      var hot = this.hotKey === ri + '_' + ki
      return {
        width: w + 'px',
        height: keyH + 'px',
        margin: PAD + 'px',
        backgroundColor: hot ? '#3f4766' : this.keyBg(k),
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transitionProperty: 'background-color',
        transitionDuration: '60ms'
      }
    },
    keyBg(k) {
      if (k.action === 'shift' && this.capsLock) return '#2a6df4'
      if (k.action === 'shift' && this.shift) return '#3d5aa8'
      if (k.action === 'char') return '#262c3c'
      if (k.action === 'lang') return this.lang === 'cn' ? '#2a6df4' : '#3a3f52'
      return '#3a3f52'
    },
    keyTextStyle(k) {
      return {
        fontSize: k.raw && k.raw.length > 1 ? '16px' : '25px',
        color: '#ffffff',
        textAlign: 'center'
      }
    },
    candStyle(i, hot) {
      return {
        fontSize: '21px',
        color: '#ffffff',
        backgroundColor: hot ? '#4a7ce8' : (i === 0 ? '#2a6df4' : '#242836'),
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '16px',
        paddingRight: '16px',
        marginRight: '8px',
        borderRadius: '8px',
        height: '30px',
        transitionProperty: 'background-color',
        transitionDuration: '60ms'
      }
    },
    refresh() {
      if (!this.pinyinBuf) {
        this.cands = []
        return
      }
      // 30 条：8 常用字 + 12 词组 + 兜底单字，横向滚动全部可达
      this.cands = candidates(this.pinyinBuf, 30)
    },
    // 基于已上屏文本尾部的联想：中文=词组后续+单字接续，英文=单词前缀联想（不强制选择）
    refreshAssoc() {
      if (this.pinyinBuf) return
      if (this.lang === 'en') {
        var s = this.enSeg()
        this.cands = s.seg ? enSuggest(s.seg, 12) : []
        return
      }
      var out = []
      // 词组联想：光标前最多 4 字里取最长 2~4 字头，命中词组的"后半段"；
      // 单字也联想（输入一个字后补全下一个字：化 → 学/肥/合/工...）
      var t = this.text || ''
      var from = Math.max(0, this.cur - 4)
      var tail = t.slice(from, this.cur)
      if (tail.length >= 1) {
        var ph = phraseSuggest(tail, 6)
        for (var i = 0; i < ph.length; i++) if (out.indexOf(ph[i]) < 0) out.push(ph[i])
        if (out.length < 6 && tail.length > 2) {
          var ph2 = phraseSuggest(tail.slice(-2), 6)
          for (var j = 0; j < ph2.length; j++) if (out.indexOf(ph2[j]) < 0 && out.length < 6) out.push(ph2[j])
        }
      }
      var asso = associations(this.text)
      for (var k = 0; k < asso.length && out.length < 10; k++) {
        if (out.indexOf(asso[k]) < 0) out.push(asso[k])
      }
      // 全新空输入框：先摆一排高频字，点一下就能上屏，省得每个字都拼一遍
      if (!out.length && !this.text) out = QUICK_CN.slice(0)
      this.cands = out
    },
    // 光标前的连续英文字母段（联想与替换的基准）
    enSeg() {
      var t = this.text || ''
      var c = this.cur
      if (c > t.length) c = t.length
      var i = c
      while (i > 0) {
        var chCode = t.charCodeAt(i - 1)
        var isLetter = (chCode >= 65 && chCode <= 90) || (chCode >= 97 && chCode <= 122) || chCode === 39
        if (!isLetter) break
        i--
      }
      return { start: i, seg: t.slice(i, c) }
    },
    matchCase(input, word) {
      var c0 = input.charAt(0)
      if (c0 >= 'A' && c0 <= 'Z') return word.charAt(0).toUpperCase() + word.slice(1)
      return word
    },
    pick(word) {
      if (this.lang === 'en') {
        // 英文联想：把光标前的字母段整体替换为所选单词（首字母大小写跟随用户）
        var s = this.enSeg()
        if (s.seg) {
          var w = this.matchCase(s.seg, word)
          this.text = this.text.slice(0, s.start) + w + this.text.slice(this.cur)
          this.cur = s.start + w.length
        }
        this.cands = []
        this.hotCand = -1
        this.refreshAssoc()
        return
      }
      this.insert(word)
      // 动态调频：记录选词 + 当时的拼音串，下次同样拼音该词置顶
      recordWord(word, this.pinyinBuf)
      this.pinyinBuf = ''
      this.cands = []
      this.hotCand = -1
      this.refreshAssoc()
    },
    press(k) {
      // 长按连删进行中时，touch 结束后系统合成的 click 不再重复执行
      if (this.repeatGuard) {
        this.repeatGuard = false
        return
      }
      var a = k.action
      if (a === 'char') {
        this.typeChar(k.raw)
      } else if (a === 'back') {
        this.backspace()
      } else if (a === 'space') {
        this.space()
      } else if (a === 'dot') {
        this.typeChar(k.raw)
      } else if (a === 'shift') {
        // 单击：下一个字母大写；400ms 内双击：锁定大写（capsLock）；再按解除
        var now = Date.now()
        if (this.capsLock) {
          this.capsLock = false
          this.shift = false
        } else if (this.shift && this._lastShift && now - this._lastShift < 400) {
          this.capsLock = true
        } else {
          this.shift = !this.shift
        }
        this._lastShift = now
      } else if (a === 'lang') {
        this.flushPinyin()
        this.lang = this.lang === 'cn' ? 'en' : 'cn'
        this.cands = []
      } else if (a === 'num') {
        this.flushPinyin()
        this.page = this.page === 0 ? 1 : 0
      } else if (a === 'sym') {
        this.flushPinyin()
        this.shift = false
        this.capsLock = false
        this.page = 2
      } else if (a === 'symnext') {
        this.flushPinyin()
        this.page = this.page >= 1 + SCI_PAGES ? 2 : this.page + 1
      } else if (a === 'page1') {
        this.flushPinyin()
        this.page = 1
      }
    },
    // ---- 按压反馈 + 长按连删（touch 事件不可用时静默退回 click） ----
    touchIn(k, ri, ki) {
      this.hotKey = ri + '_' + ki
      if (k.action !== 'back') return
      var self = this
      this.repDelay = setTimeout(function () {
        self.repeatGuard = true
        self.repTimer = setInterval(function () {
          self.backspace()
        }, 80)
      }, 450)
    },
    touchOut() {
      this.hotKey = ''
      if (this.repDelay) {
        clearTimeout(this.repDelay)
        this.repDelay = null
      }
      if (this.repTimer) {
        clearInterval(this.repTimer)
        this.repTimer = null
        // 连删结束后立即释放 guard；若系统随后补发 click 也已被 press 首行吞掉
        var self = this
        setTimeout(function () { self.repeatGuard = false }, 120)
      }
    },
    candIn(i) {
      this.hotCand = i
    },
    candOut() {
      this.hotCand = -1
    },
    typeChar(ch) {
      // 中文自由文本标点转全角（数字符号页、settings 数值/密钥编辑保持半角）
      if (this.fullwidth && this.lang === 'cn' && this.page === 0) {
        var full = { ',': '，', '.': '。', '?': '？' }
        if (full[ch]) {
          this.insert(full[ch])
          this.refreshAssoc()
          return
        }
      }
      if (this.lang === 'cn' && this.page === 0 && ((ch >= 'a' && ch <= 'z') || ch === "'")) {
        // 隔音符：xi'an 的 ' 收进拼音串，引擎按它分段（但不能开头/连续）
        if (ch === "'" && (!this.pinyinBuf || this.pinyinBuf.charAt(this.pinyinBuf.length - 1) === "'")) {
          this.insert(ch)
          this.refreshAssoc()
          return
        }
        this.pinyinBuf += ch
        this.refresh()
        return
      }
      if ((this.shift || this.capsLock) && ch >= 'a' && ch <= 'z') {
        this.insert(ch.toUpperCase())
        if (!this.capsLock) this.shift = false
        this.refreshAssoc()
        return
      }
      this.insert(ch)
      // 理科符号页不做词联想：符号后弹中文候选词是噪声
      if (this.page >= 2) { this.cands = []; return }
      this.refreshAssoc()
    },
    // 放弃候选词，把拼音串原样上屏（对应「原文」键；PenChat 的回车上屏原文）
    commitRaw() {
      this.insert(this.pinyinBuf)
      this.pinyinBuf = ''
      this.cands = []
      this.hotCand = -1
      this.refreshAssoc()
    },
    // 切页前把未选的拼音串原样上屏，避免打了一半的字凭空消失
    flushPinyin() {
      if (!this.pinyinBuf) return
      this.insert(this.pinyinBuf)
      this.pinyinBuf = ''
      this.cands = []
    },
    backspace() {
      if (this.pinyinBuf) {
        this.pinyinBuf = this.pinyinBuf.slice(0, -1)
        this.refresh()
        return
      }
      var c = this.cur
      if (c <= 0) return
      var t = this.text
      this.text = t.slice(0, c - 1) + t.slice(c)
      this.cur = c - 1
      this.refreshAssoc()
    },
    space() {
      if (this.pinyinBuf) {
        if (this.cands.length) {
          this.pick(this.cands[0])
        } else {
          // 无匹配拼音直接原样上屏，避免"打的字消失"
          this.insert(this.pinyinBuf)
          this.pinyinBuf = ''
          this.cands = []
          this.refreshAssoc()
        }
        return
      }
      this.insert(' ')
      this.refreshAssoc()
    },
    done() {
      // 遗留拼音串一并上屏（接在光标处）
      if (this.pinyinBuf) {
        this.insert(this.pinyinBuf)
        this.pinyinBuf = ''
      }
      $falcon.trigger('penai_kb', this.text)
      this.$page.finish()
    },
    // 放弃本次编辑：恢复进入时文本，不回传
    cancelEdit() {
      this.text = this.originText
      this.pinyinBuf = ''
      this.cands = []
      this.$page.finish()
    }
  },
  destroyed() {
    if (this.repDelay) clearTimeout(this.repDelay)
    if (this.repTimer) clearInterval(this.repTimer)
  }
}
</script>
