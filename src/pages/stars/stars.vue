<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 12px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px; background-color: #1b1d27;">
      <div style="display: flex; flex-direction: row; align-items: flex-end;">
        <text style="font-size: 19px; color: #ffffff;">{{ view === 'list' ? '收藏' : '收藏详情' }}</text>
        <text style="font-size: 14px; color: #6b7688; padding-left: 8px; padding-bottom: 2px;">{{ headNote }}</text>
      </div>
      <div style="display: flex; flex-direction: row; align-items: center;">
        <text v-if="view === 'detail'" @click="backList" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 8px;">返回列表</text>
        <text v-if="view === 'detail'" @click="reAsk" style="font-size: 16px; color: #0f1016; background-color: #6ee7a8; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 8px;">再问一次</text>
        <text v-if="view === 'list'" @click="doExport" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 8px;">导出</text>
        <text @click="close" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px;">关闭</text>
      </div>
    </div>

    <scroller style="flex: 1;" scroll-direction="vertical" :show-scrollbar="true">
      <div style="padding-left: 10px; padding-right: 10px; padding-top: 8px;">
        <text v-if="tip" style="font-size: 15px; color: #6ee7a8; padding-bottom: 6px;">{{ tip }}</text>

        <!-- 列表 -->
        <div v-if="view === 'list'">
          <div v-if="!list.length" style="padding-top: 30px; display: flex; flex-direction: row; justify-content: center;">
            <text style="font-size: 17px; color: #6b7688;">还没有收藏。回答下方点「收藏」就能存到这里。</text>
          </div>
          <div v-for="(it, i) in list" :key="'s' + i" style="background-color: #171b26; border-radius: 8px; padding-left: 12px; padding-right: 10px; padding-top: 8px; padding-bottom: 8px; margin-bottom: 8px; display: flex; flex-direction: row; align-items: center; justify-content: space-between;">
            <div @click="openDetail(i)" style="flex: 1;">
              <text style="font-size: 14px; color: #6b7688; padding-bottom: 3px;">{{ it.when }}</text>
              <text style="font-size: 16px; color: #eef2fa;">{{ it.q || '（无问题文字）' }}</text>
              <text style="font-size: 14px; color: #8a93a8; padding-top: 3px;">{{ it.first }}</text>
            </div>
            <text @click="delOne(i)" style="font-size: 14px; color: #ff9a9a; padding-left: 14px; padding-right: 6px; padding-top: 8px; padding-bottom: 8px;">删除</text>
          </div>
          <div v-if="list.length" style="display: flex; flex-direction: row; justify-content: center; padding-top: 4px; padding-bottom: 20px;">
            <text @click="clearAll" style="font-size: 15px; color: #ff9a9a; background-color: #3a2430; padding-left: 20px; padding-right: 20px; padding-top: 8px; padding-bottom: 8px; border-radius: 6px;">清空全部收藏</text>
          </div>
        </div>

        <!-- 详情 -->
        <div v-else>
          <div v-if="cur.q" style="background-color: #16233a; border-radius: 8px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px; margin-bottom: 8px;">
            <text style="font-size: 14px; color: #7fa8e0; padding-bottom: 2px;">问 · {{ cur.when }}</text>
            <text style="width: 888px; font-size: 17px; line-height: 25px; color: #dbe7fa;">{{ cur.qWrapped }}</text>
          </div>
          <div style="background-color: #171b26; border-radius: 8px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px;">
            <text style="font-size: 14px; color: #6ee7a8; padding-bottom: 2px;">答</text>
            <text style="width: 888px; font-size: 17px; line-height: 26px; color: #eef2fa;">{{ cur.aWrapped }}</text>
          </div>
          <div style="display: flex; flex-direction: row; justify-content: center; padding-top: 12px; padding-bottom: 20px;">
            <text @click="delCurrent" style="font-size: 15px; color: #ff9a9a; background-color: #3a2430; padding-left: 20px; padding-right: 20px; padding-top: 8px; padding-bottom: 8px; border-radius: 6px;">删除本条</text>
          </div>
        </div>
      </div>
    </scroller>
  </div>
</template>

<script>
import { loadStars, delStar, clearStars, exportStars, stamp } from '../../utils/stars.js'

var MAX_EM = 49

function charEm(ch) {
  var code = ch.charCodeAt(0)
  if (code < 128) return ch === ' ' ? 0.32 : 0.55
  if (code >= 0x2070 && code <= 0x209f) return 0.5
  return 1
}

function wrapSimple(text, maxEm) {
  var out = []
  var lines = String(text || '').split('\n')
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li]
    if (!line) { out.push(''); continue }
    var cur = ''
    var w = 0
    for (var i = 0; i < line.length; i++) {
      var cw = charEm(line.charAt(i))
      if (w + cw > maxEm && cur) {
        out.push(cur)
        cur = ''
        w = 0
      }
      cur += line.charAt(i)
      w += cw
    }
    if (cur) out.push(cur)
  }
  return out.join('\n')
}

function oneLine(t, n) {
  var s = String(t || '').replace(/\s+/g, ' ').trim()
  if (s.length > n) s = s.slice(0, n) + '…'
  return s
}

export default {
  data() {
    return {
      view: 'list',
      list: [],
      raw: [],
      cur: { q: '', a: '', when: '', qWrapped: '', aWrapped: '' },
      curIdx: -1,
      tip: ''
    }
  },
  computed: {
    headNote() {
      if (this.view === 'list') return this.list.length ? '共 ' + this.list.length + ' 条' : ''
      return this.cur.when || ''
    }
  },
  mounted() {
    this.reload()
  },
  methods: {
    async reload() {
      var arr = await loadStars()
      var items = []
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i]
        items.push({
          when: stamp(it.ts),
          q: oneLine(it.q, 40),
          first: oneLine(it.a, 46)
        })
      }
      this.raw = arr
      this.list = items
      this.view = 'list'
    },
    openDetail(i) {
      var it = this.raw[i]
      if (!it) return
      this.cur = {
        q: String(it.q || ''),
        a: String(it.a || ''),
        when: stamp(it.ts),
        qWrapped: wrapSimple(it.q || '', MAX_EM),
        aWrapped: wrapSimple(it.a || '', MAX_EM)
      }
      this.curIdx = i
      this.view = 'detail'
      this.tip = ''
    },
    backList() {
      this.reload()
      this.tip = ''
    },
    async delOne(i) {
      var it = this.raw[i]
      if (!it) return
      var n = await delStar(it.id)
      this.tip = '已删除，剩 ' + n + ' 条'
      this.reload()
    },
    async delCurrent() {
      var it = this.raw[this.curIdx]
      if (it) await delStar(it.id)
      this.reload()
      this.tip = '已删除本条'
    },
    async clearAll() {
      await clearStars()
      this.reload()
      this.tip = '收藏已清空'
    },
    async doExport() {
      this.tip = '正在导出…'
      this.$forceUpdate()
      var p = await exportStars()
      this.tip = p ? ('已导出到 ' + p + '（连电脑可见）') : '导出失败，可能存储空间不足'
      this.$forceUpdate()
    },
    // 把收藏的题目带回对话页重发，省去重新打字
    reAsk() {
      var q = this.cur.q
      if (!q) {
        this.tip = '这条收藏没有保存问题文字，无法重问'
        this.$forceUpdate()
        return
      }
      try { $falcon.trigger('penai_reask', q) } catch (e) {}
      this.$page.finish()
    },
    close() {
      this.$page.finish()
    }
  }
}
</script>

<style>
</style>
