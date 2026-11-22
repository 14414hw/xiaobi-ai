<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 12px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px; background-color: #1b1d27;">
      <div style="display: flex; flex-direction: row; align-items: flex-end;">
        <text style="font-size: 19px; color: #ffffff;">{{ view === 'list' ? '历史对话' : '对话详情' }}</text>
        <text style="font-size: 14px; color: #6b7688; padding-left: 8px; padding-bottom: 2px;">{{ view === 'list' ? (list.length ? '共 ' + list.length + ' 段' : '') : briefText }}</text>
      </div>
      <div style="display: flex; flex-direction: row; align-items: center;">
        <text v-if="view === 'detail'" @click="backList" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 8px;">返回列表</text>
        <text v-if="view === 'detail'" @click="delCurrent" style="font-size: 16px; color: #ff9a9a; background-color: #3a2430; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 8px;">删除本段</text>
        <text @click="close" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px;">关闭</text>
      </div>
    </div>

    <scroller style="flex: 1;" scroll-direction="vertical" :show-scrollbar="true">
      <div style="padding-left: 10px; padding-right: 10px; padding-top: 8px;">
        <!-- 列表视图 -->
        <div v-if="view === 'list'">
          <text v-if="status" style="font-size: 14px; line-height: 20px; color: #6ee7a8; padding-bottom: 8px;">{{ status }}</text>
          <div v-if="!list.length" style="padding-top: 30px; display: flex; flex-direction: row; justify-content: center;">
            <text style="font-size: 17px; color: #6b7688;">还没有历史对话。点「新对话」后，旧的对话会存到这里。</text>
          </div>
          <div v-for="(it, i) in list" :key="'h' + i" style="background-color: #171b26; border-radius: 8px; padding-left: 12px; padding-right: 10px; padding-top: 8px; padding-bottom: 8px; margin-bottom: 8px;">
            <div @click="openDetail(it.orig)" style="display: flex; flex-direction: column;">
              <text style="font-size: 15px; color: #9dc0ee; padding-bottom: 3px;">{{ it.label }}</text>
              <text style="font-size: 16px; color: #eef2fa;">{{ it.first || '（无文字）' }}</text>
            </div>
            <!-- 操作行放在点击区外面，避免按钮点击冒泡到「查看详情」 -->
            <div style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 7px;">
              <text @click="restoreOne(it.orig)" style="font-size: 14px; color: #0f1016; background-color: #6ea8ff; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; border-radius: 5px; margin-right: 8px; margin-bottom: 4px;">还原继续</text>
              <text @click="exportOne(it.orig)" style="font-size: 14px; color: #c8cfdd; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; border-radius: 5px; margin-right: 8px; margin-bottom: 4px;">导出MD</text>
              <text @click="renameOne(it.orig)" style="font-size: 14px; color: #c8cfdd; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; border-radius: 5px; margin-right: 8px; margin-bottom: 4px;">重命名</text>
              <text @click="pinOne(it.orig)" style="font-size: 14px; color: #ffd479; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; border-radius: 5px; margin-right: 8px; margin-bottom: 4px;">{{ it.pinned ? '取消置顶' : '置顶' }}</text>
              <text @click="delOne(it.orig)" style="font-size: 14px; color: #ff9a9a; background-color: #2b3040; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; border-radius: 5px; margin-bottom: 4px;">删除</text>
            </div>
          </div>
          <div v-if="list.length" style="display: flex; flex-direction: row; justify-content: center; padding-top: 4px; padding-bottom: 20px;">
            <text @click="clearAll" style="font-size: 15px; color: #ff9a9a; background-color: #3a2430; padding-left: 20px; padding-right: 20px; padding-top: 8px; padding-bottom: 8px; border-radius: 6px;">清空全部历史</text>
          </div>
        </div>

        <!-- 详情视图：只读渲染一段对话 -->
        <div v-else>
          <div v-if="!detail.length" style="padding-top: 30px; display: flex; flex-direction: row; justify-content: center;">
            <text style="font-size: 17px; color: #6b7688;">这段对话是空的</text>
          </div>
          <div v-for="(m, i) in detail" :key="'d' + i" style="margin-bottom: 8px;">
            <text v-if="m.role === 'sep'" style="font-size: 14px; color: #6b7688; padding-top: 4px; padding-bottom: 4px;">{{ m.text }}</text>
            <div v-else-if="m.role === 'think'">
              <text style="width: 888px; font-size: 14px; line-height: 20px; color: #8a93a8;">{{ m.text }}</text>
            </div>
            <div v-else style="background-color: #171b26; border-radius: 8px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px;">
              <text style="font-size: 14px; color: #7fa8e0; padding-bottom: 2px;">{{ m.role === 'user' ? '我' : 'AI' }}</text>
              <!-- 结构图：与对话页同一套提取/尺寸策略，否则历史里只剩 SMILES 原文 -->
              <div v-if="(m.molRows && m.molRows.length) || (m.molIssues && m.molIssues.length) || (m.molFailed && m.molFailed.length)" style="flex-direction: column; align-items: center; padding-top: 4px; padding-bottom: 4px;">
                <!-- 与聊天页一致：提示行放图上方，避免被 280px 屏折到下面 -->
                <text v-if="m.molIssues && m.molIssues.length" style="width: 888px; font-size: 12px; line-height: 16px; color: #d8a25a; padding-bottom: 3px;">结构校验：{{ molWarnText(m) }}</text>
                <text v-if="m.molFailed && m.molFailed.length" style="width: 888px; font-size: 12px; line-height: 16px; color: #8a93a8; padding-bottom: 3px;">未绘制：{{ molFailText(m) }}</text>
                <div v-for="(row, ri) in m.molRows" :key="'hr' + i + '_' + ri" style="display: flex; flex-direction: row; align-items: flex-start; justify-content: center; padding-bottom: 4px;">
                  <div v-for="(g, gi) in row" :key="'hg' + i + '_' + ri + '_' + gi" style="flex-direction: column; align-items: center; margin-left: 9px; margin-right: 9px;" @click="zoomMol(g)">
                    <!-- 分子名与「放大」入口同排、都在图上方：280px 屏图下方必被输入栏挡住 -->
                    <div style="display: flex; flex-direction: row; align-items: center; padding-bottom: 3px;">
                      <text v-if="g.label" style="font-size: 12px; line-height: 16px; color: #7c869c;">{{ g.label }}</text>
                      <text style="font-size: 11px; line-height: 16px; color: #0f1016; background-color: #6ee7a8; border-radius: 4px; padding-left: 5px; padding-right: 5px; margin-left: 6px;">放大</text>
                    </div>
                    <image v-if="g.uri" :src="g.uri" :style="g.st"></image>
                  </div>
                </div>
                <text v-if="m.molMore > 0" @click="openMolsDetail(m)" style="font-size: 15px; color: #0f1016; background-color: #6ee7a8; padding-left: 12px; padding-right: 12px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px; margin-top: 2px; margin-bottom: 4px;">共 {{ m.molTotal }} 个结构，点开看全部 ›</text>
              </div>
              <text style="width: 888px; font-size: 17px; line-height: 25px; color: #dbe7fa;">{{ m.text }}</text>
            </div>
          </div>
          <div style="height: 20px;"></div>
        </div>
      </div>
    </scroller>
  </div>
</template>

<script>
import fs from 'fs'
import { loadArchive, saveArchive, deleteArchive, clearArchive, loadSession, saveSession, archiveSession } from '../../utils/store.js'
import { plainify } from '../../utils/api.js'
import { needsBenzene } from '../../utils/mol.js'
import { extractMols, buildMolRows, openMolsView } from '../../utils/molsRender.js'

// Markdown 导出目录（导出的文件接上电脑就能拷走）
var EXPORT_DIR = '/userdisk/PenAI_Export'

// 精简版换行：历史页只读展示，不需要 chat 页的方程式专用断行
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

export default {
  data() {
    return {
      view: 'list',
      list: [],
      detail: [],
      briefText: '',
      curIdx: -1,
      status: ''
    }
  },
  mounted() {
    this.reload()
    this.detailTest()
    try { $falcon.on('penai_kb', this.onKb) } catch (e) {}
  },
  destroyed() {
    try { $falcon.off('penai_kb', this.onKb) } catch (e) {}
  },
  methods: {
    // 部署自测用：开关文件存在时直接打开第一段详情，验证详情渲染
    async detailTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_histdetail.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_histdetail.on') } catch (e1) {}
      var self = this
      setTimeout(function () { self.openDetail(0) }, 1600)
    },
    async reload() {
      var arr = await loadArchive()
      // 置顶段排最前，组内保持原顺序；display 顺序与存储顺序分离，
      // 按钮都带 orig（存储下标），删改不会错位
      var order = []
      for (var i = 0; i < arr.length; i++) order.push(i)
      order.sort(function (a, b) {
        var pa = arr[a] && arr[a].pinned === true ? 1 : 0
        var pb = arr[b] && arr[b].pinned === true ? 1 : 0
        if (pa !== pb) return pb - pa
        return a - b
      })
      var items = []
      for (var k = 0; k < order.length; k++) {
        var a = arr[order[k]]
        var b = (a && a.brief) || {}
        items.push({
          orig: order[k],
          label: (a.pinned ? '【置顶】' : '') + (a.title || b.when || '时间未知') + ' · ' + (b.count || 0) + ' 条',
          first: b.first || '',
          pinned: a.pinned === true
        })
      }
      this.list = items
      this.view = 'list'
    },
    openDetail(i) {
      var self = this
      loadArchive().then(function (arr) {
        var s = arr && arr[i]
        var msgs = (s && s.messages) || []
        var out = []
        for (var k = msgs.length - 1; k >= 0; k--) {
          var m = msgs[k]
          if (!m || !m.role) continue
          if (m.role === 'assistant' && m.reasoning) {
            var rt = String(m.reasoning)
            if (rt.length > 600) rt = rt.slice(0, 600) + '…（思考全文 ' + rt.length + ' 字已省略）'
            out.push({ role: 'think', text: wrapSimple('思考：' + rt, MAX_EM) })
          }
          var c = m.content
          // 与对话页走同一套清洗：否则同一段回答在两处显示不一样
          // （历史页以前直接显示原始 Markdown / LaTeX，化学式反而"看起来正常"）
          var txt = '[图片]'
          var molRows = null
          var molMore = 0
          var molTotal = 0
          var molsRaw = null
          var molIssues = null
          var molFailed = null
          if (typeof c === 'string') {
            try {
              // 先提取结构式（extractMols 会把 @smiles 行从正文里拿走），再清洗剩余文本。
              // 此前直接 plainify 原文，@smiles 行被原样保留 → 历史里显示一串 SMILES 代码。
              var ex = extractMols(c)
              txt = plainify(ex.text || '')
              if (m.role === 'assistant') {
                var g = null
                if (ex.mols.length) g = buildMolRows(ex.mols, 3)
                else if (needsBenzene(String(c))) g = buildMolRows([{ smiles: 'c1ccccc1', label: '苯环' }], 1)
                if (g) {
                  molRows = g.rows
                  molMore = g.more
                  molTotal = g.total
                  molsRaw = g.valid
                  molIssues = g.issues
                  molFailed = g.failed
                }
              }
            } catch (e1) { txt = c }
          }
          var item = { role: m.role, text: wrapSimple(txt, MAX_EM) }
          if (molRows) {
            item.molRows = molRows
            item.molMore = molMore
            item.molTotal = molTotal
            item.molsRaw = molsRaw
          }
          if (molIssues && molIssues.length) item.molIssues = molIssues
          if (molFailed && molFailed.length) item.molFailed = molFailed
          out.push(item)
        }
        self.detail = out
        var b = (s && s.brief) || {}
        self.briefText = (b.when || '') + (b.count ? ' · ' + b.count + ' 条' : '')
        self.curIdx = i
        self.view = 'detail'
      })
    },
    molWarnText(m) {
      var a = (m && m.molIssues) || []
      var s = a.slice(0, 2).join('；')
      if (a.length > 2) s += '；另有 ' + (a.length - 2) + ' 项'
      return s
    },
    molFailText(m) {
      var a = (m && m.molFailed) || []
      var out = []
      for (var i = 0; i < a.length && i < 2; i++) {
        out.push(String(a[i].smiles || '') + '（' + a[i].reason + '）')
      }
      if (a.length > 2) out.push('另有 ' + (a.length - 2) + ' 个')
      return out.join('；')
    },
    async openMolsDetail(m) {
      var list = (m && m.molsRaw) ? m.molsRaw : []
      if (!list.length) return
      await openMolsView(fs, $falcon, list)
    },
    // 点内联结构图放大：单分子大图页，顶部「恢复原状」返回
    async zoomMol(g) {
      if (!g || !g.smiles) return
      await openMolsView(fs, $falcon, [{ smiles: g.smiles, label: g.label || '' }])
    },
    backList() {
      this.reload()
    },
    async delOne(i) {
      await deleteArchive(i)
      this.reload()
    },
    async delCurrent() {
      if (this.curIdx >= 0) await deleteArchive(this.curIdx)
      this.reload()
    },
    async clearAll() {
      await clearArchive()
      this.reload()
    },
    // 还原继续聊：把这段存档写回活动会话。当前活动会话若有实质内容，
    // 先照「新对话」的规则滚进历史，避免被覆盖丢失。
    async restoreOne(orig) {
      var arr = await loadArchive()
      var s = arr && arr[orig]
      if (!s) return
      var msgs = (s.messages || []).slice()
      if (!msgs.length) {
        this.status = '这段对话是空的，没有可还原的内容'
        return
      }
      try {
        var cur = await loadSession()
        if (cur && cur.messages && cur.messages.length) {
          try { await archiveSession(cur) } catch (e1) {}
        }
        await saveSession({ messages: JSON.parse(JSON.stringify(msgs)) })
        // 通知聊天页重读会话（页面在底层活着，不会重新 mounted）
        try { $falcon.trigger('penai_restore', {}) } catch (e2) {}
        this.$page.finish()
      } catch (e3) {
        this.status = '还原失败：' + (e3 && e3.message ? e3.message : String(e3))
      }
    },
    // 导出 Markdown：原文导出（不清洗），图片位置留占位，接电脑可读
    async exportOne(orig) {
      var arr = await loadArchive()
      var s = arr && arr[orig]
      if (!s) return
      var msgs = s.messages || []
      if (!msgs.length) {
        this.status = '这段对话是空的，没有可导出的内容'
        return
      }
      var b = s.brief || {}
      var md = '# 小笔 AI 对话导出\n\n- 时间：' + (b.when || '未知') + '\n- 条数：' + (b.count || msgs.length) + '\n\n'
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i]
        if (!m || !m.role) continue
        var role = m.role === 'user' ? '我' : '小笔 AI'
        var c = m.content
        var txt = ''
        if (typeof c === 'string') {
          txt = c
        } else if (Object.prototype.toString.call(c) === '[object Array]') {
          var parts = []
          for (var j = 0; j < c.length; j++) {
            var p = c[j]
            if (p && p.type === 'text') parts.push(p.text || '')
            else if (p && p.type === 'image_url') parts.push('[图片]')
          }
          txt = parts.join('\n')
        }
        md += '**' + role + '**：\n\n' + txt + '\n\n'
      }
      try { await fs.mkdir(EXPORT_DIR) } catch (e0) {}
      var base = String(s.title || b.first || 'chat').replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, '_')
      if (base.length > 24) base = base.slice(0, 24)
      var path = EXPORT_DIR + '/' + base + '_' + Date.now() + '.md'
      try {
        await fs.writeFile(path, md)
        this.status = '已导出：' + path
      } catch (e1) {
        this.status = '导出失败：' + (e1 && e1.message ? e1.message : String(e1))
      }
    },
    // 重命名走内置键盘页（同设置页的 edit 流程）：
    // navTo 传当前标题 → 用户改完点「完成」→ penai_kb 事件带文本回来。
    // 键盘的「取消」不回传，_renIdx 挂起也无害（下次事件到来时才消费）
    renameOne(orig) {
      var self = this
      loadArchive().then(function (arr) {
        var s = arr && arr[orig]
        if (!s) return
        self._renIdx = orig
        var cur = s.title || (s.brief && s.brief.first) || ''
        try {
          $falcon.navTo('keyboard', { title: '重命名对话', data: cur, lang: 'zh' })
        } catch (e1) {
          self._renIdx = -1
          self.status = '打不开输入页'
        }
      })
    },
    onKb(e) {
      var idx = this._renIdx
      if (idx === undefined || idx < 0) return
      this._renIdx = -1
      var self = this
      var val = e && e.data !== undefined ? e.data : (typeof e === 'string' ? e : '')
      loadArchive().then(function (arr) {
        var s = arr && arr[idx]
        if (!s) return
        var t = String(val || '').replace(/^\s+|\s+$/g, '')
        if (t) {
          s.title = t.slice(0, 30)
        } else {
          delete s.title // 清空提交即恢复默认时间标题
        }
        saveArchive(arr).then(function () { self.reload() })
      })
    },
    async pinOne(orig) {
      var arr = await loadArchive()
      var s = arr && arr[orig]
      if (!s) return
      s.pinned = !(s.pinned === true)
      await saveArchive(arr)
      this.status = s.pinned ? '已置顶，排到列表最前' : '已取消置顶'
      this.reload()
    },
    close() {
      this.$page.finish()
    }
  }
}
</script>

<style>
</style>
