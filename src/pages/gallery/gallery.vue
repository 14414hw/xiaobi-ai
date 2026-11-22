<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 12px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px; background-color: #1b1d27;">
      <div style="display: flex; flex-direction: row; align-items: flex-end;">
        <text style="font-size: 19px; color: #ffffff;">相册</text>
        <text style="font-size: 14px; color: #6b7688; padding-left: 8px; padding-bottom: 2px;">{{ countLabel }}</text>
      </div>
      <div style="display: flex; flex-direction: row; align-items: center;">
        <text @click="goCamera" style="font-size: 16px; color: #0f1016; background-color: #6ee7a8; padding-left: 14px; padding-right: 14px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 10px;">拍照</text>
        <text v-if="sel.length === 0" @click="refresh" style="font-size: 16px; color: #6ea8ff; padding-left: 10px; padding-right: 10px; padding-top: 4px; padding-bottom: 4px;">{{ scanning ? '读取中…' : '刷新' }}</text>
        <text v-if="sel.length > 0" @click="confirmSel" style="font-size: 16px; color: #0f1016; background-color: #6ea8ff; padding-left: 12px; padding-right: 12px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px; margin-right: 10px;">用这 {{ sel.length }} 张 ›</text>
        <text @click="close" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px;">关闭</text>
      </div>
    </div>

    <scroller style="flex: 1;" scroll-direction="vertical" :show-scrollbar="true">
      <div style="padding-left: 8px; padding-right: 8px; padding-top: 6px;">
        <div v-if="hint" style="padding-bottom: 5px; padding-left: 4px;">
          <text style="font-size: 15px; color: #9dc0ee;">{{ hint }}</text>
        </div>

        <div v-for="(it, i) in albumView" :key="'a' + i" style="display: flex; flex-direction: row; align-items: center; background-color: #1a1c26; padding-left: 8px; padding-right: 8px; padding-top: 6px; padding-bottom: 6px; margin-bottom: 4px; border-radius: 6px;" @click="toggle(it, i)">
          <div v-if="selIndex(it) > 0" style="width: 6px; height: 54px; background-color: #6ee7a8; border-radius: 3px; margin-right: 7px;"></div>
          <image v-if="it.thumb" :src="it.thumb" style="width: 96px; height: 54px; background-color: #242836; border-radius: 4px; margin-right: 10px;"></image>
          <div v-else style="width: 96px; height: 54px; background-color: #242836; border-radius: 4px; margin-right: 10px;"></div>
          <div style="flex: 1; display: flex; flex-direction: column;">
            <div style="display: flex; flex-direction: row; align-items: center;">
              <text style="font-size: 18px; color: #e8ecf5;">{{ it.label }}</text>
              <text v-if="i === 0 && !importing" style="font-size: 13px; color: #0f1016; background-color: #6ee7a8; padding-left: 6px; padding-right: 6px; padding-top: 1px; padding-bottom: 1px; border-radius: 3px; margin-left: 8px;">最新</text>
              <text v-if="importing === it.name" style="font-size: 13px; color: #0f1016; background-color: #6ea8ff; padding-left: 6px; padding-right: 6px; padding-top: 1px; padding-bottom: 1px; border-radius: 3px; margin-left: 8px;">载入中</text>
              <text v-if="selIndex(it) > 0" style="font-size: 13px; color: #0f1016; background-color: #6ee7a8; padding-left: 7px; padding-right: 7px; padding-top: 1px; padding-bottom: 1px; border-radius: 3px; margin-left: 8px;">已选 {{ selIndex(it) }}</text>
            </div>
            <text v-if="selIndex(it) > 0" style="font-size: 14px; color: #6ee7a8; padding-top: 2px;">再点一次取消</text>
            <text v-else style="font-size: 14px; color: #6ea8ff; padding-top: 2px;">点按选择（最多 10 张）</text>
          </div>
        </div>

        <div v-if="albumItems.length > albumLimit" style="display: flex; align-items: center; justify-content: center; padding-top: 4px; padding-bottom: 12px;">
          <text @click="loadMore" style="font-size: 16px; color: #6ea8ff; background-color: #1a2233; padding-left: 22px; padding-right: 22px; padding-top: 7px; padding-bottom: 7px; border-radius: 6px;">加载更早的（还有 {{ albumItems.length - albumLimit }} 张）</text>
        </div>
        <div v-else style="height: 12px;"></div>
      </div>
    </scroller>
  </div>
</template>

<script>
import fs from 'fs'

var ALB_DIR = '/userdisk/Pictures'
var IMG_DIR = '/userdisk/PenAI_Images'
var THUMB_DIR = '/userdisk/PenAI_Images/.albthumbs'

// 缩略图缓存：98 张图每次重扫都读一遍太慢，按文件名缓存住
var THUMB_CACHE = {}

function errStr(e) {
  if (!e) return 'ERR'
  if (typeof e === 'string') return e
  try { return String(e.message || e.msg || e) } catch (x) { return 'ERR' }
}

function b64uri(txt) {
  var s = String(txt).replace(/\s+/g, '')
  if (!s || s.length < 100) return ''
  return 'data:image/jpeg;base64,' + s
}

// IMG_20261108_010104_470_1_<设备序列号>.JPG -> 2026-11-08 01:01
function prettyName(n) {
  var m = String(n).match(/^IMG_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
  if (!m) return String(n).slice(0, 20)
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5]
}

export default {
  data() {
    return {
      items: [],
      hint: '',
      albumLimit: 24,
      scanning: false,
      importing: '',
      timer: null,
      sig: '',
      sel: []
    }
  },

  computed: {
    albumView() {
      return this.items.slice(0, this.albumLimit)
    },
    albumItems() {
      return this.items
    },
    countLabel() {
      return this.items.length ? '共 ' + this.items.length + ' 张' : ''
    }
  },

  mounted() {
    var self = this
    this.scan(false)
    // 用户可能在别处拍了照再切回来，静默比对目录签名自动刷新
    this.timer = setInterval(function () { self.watch() }, 4000)
    this.autoPick()
  },

  destroyed() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  methods: {
    sleep(ms) {
      return new Promise(function (res) { setTimeout(res, ms) })
    },

    // 部署自测用：存在开关文件时自动选最新一张，验证「选图→回填聊天页」链路
    async autoPick() {
      try {
        if (!(await fs.exists('/userdisk/penai_autopick.on'))) return
      } catch (e0) {
        return
      }
      await this.sleep(2600)
      if (!this.items.length) return
      try { await fs.rm('/userdisk/penai_autopick.on') } catch (e1) {}
      this.pick(this.items[0])
    },

    async listSig() {
      var names = []
      try {
        var arr = await fs.readdir(ALB_DIR)
        if (!Array.isArray(arr)) arr = String(arr).split(',')
        for (var i = 0; i < arr.length; i++) {
          var n = String(arr[i])
          if (/^IMG_.*\.JPG$/i.test(n)) names.push(n)
        }
      } catch (e) {}
      names.sort()
      return names.length + '|' + (names.length ? names[names.length - 1] : '')
    },

    async watch() {
      if (this.scanning || this.importing) return
      var s = await this.listSig()
      if (s && s !== this.sig) {
        this.sig = s
        this.scan(true)
      }
    },

    refresh() {
      this.sig = ''
      this.scan(false)
    },

    async scan(quiet) {
      if (this.scanning) return
      this.scanning = true
      if (!quiet) {
        this.hint = '读取相册…'
        this.$forceUpdate()
      }

      var list = []
      try {
        var names = await fs.readdir(ALB_DIR)
        if (!Array.isArray(names)) names = String(names).split(',')
        var files = []
        for (var i = 0; i < names.length; i++) {
          var n = String(names[i])
          if (!/^IMG_.*\.JPG$/i.test(n)) continue
          files.push(n)
        }
        // 文件名带时间戳，倒序即最新在前
        files.sort(function (a, b) { return a < b ? 1 : -1 })

        for (var j = 0; j < files.length; j++) {
          var fn = files[j]
          var base = fn.replace(/\.JPG$/i, '')
          var thumb = THUMB_CACHE[fn] || ''
          if (!thumb) {
            try {
              thumb = b64uri(await fs.readFile(THUMB_DIR + '/' + fn + '.thumb.jpg.b64'))
              if (thumb) THUMB_CACHE[fn] = thumb
            } catch (e1) {}
          }
          var ready = false
          try { ready = await fs.exists(IMG_DIR + '/SYS_' + base + '.jpg.b64') } catch (e2) {}
          list.push({
            name: fn,
            base: base,
            path: ALB_DIR + '/' + fn,
            label: prettyName(fn),
            thumb: thumb,
            ready: ready
          })
        }
      } catch (e) {
        this.hint = '相册读取失败：' + errStr(e)
        this.scanning = false
        this.$forceUpdate()
        return
      }

      this.items = list
      this.scanning = false
      this.sig = list.length + '|' + (list.length ? list[0].name : '')
      if (!list.length) {
        this.hint = '相册是空的 — 用笔上的拍照功能拍一张，再回到这里'
      } else if (!quiet) {
        this.hint = ''
      }
      this.$forceUpdate()
    },

    async loadMore() {
      this.albumLimit = this.albumLimit + 24
      this.$forceUpdate()
    },

    selIndex(it) {
      for (var i = 0; i < this.sel.length; i++) if (this.sel[i] === it.name) return i + 1
      return 0
    },

    toggle(it) {
      if (this.importing) return
      var at = -1
      for (var i = 0; i < this.sel.length; i++) if (this.sel[i] === it.name) at = i
      if (at >= 0) {
        this.sel.splice(at, 1)
        this.hint = this.sel.length ? ('已选 ' + this.sel.length + ' 张') : ''
      } else {
        if (this.sel.length >= 10) {
          this.hint = '一次最多选 10 张'
          this.$forceUpdate()
          return
        }
        this.sel.push(it.name)
        this.hint = '已选 ' + this.sel.length + ' 张，点右上角「用这 N 张」'
      }
      this.$forceUpdate()
    },

    // 读一张图，返回 data URI（先命中预转好的 .b64，没有就让后台现转）
    async loadOne(it) {
      var target = IMG_DIR + '/SYS_' + it.base + '.jpg.b64'
      try {
        if (await fs.exists(target)) {
          var b = await fs.readFile(target)
          var uri = b64uri(b)
          if (uri) return uri
        }
      } catch (e) {}

      this.importing = it.name
      this.hint = '正在载入 ' + it.label + '…'
      this.$forceUpdate()
      try {
        await fs.writeFile(IMG_DIR + '/.import_request', it.path)
      } catch (e2) {
        this.importing = ''
        return ''
      }

      for (var i = 0; i < 25; i++) {
        await this.sleep(500)
        try {
          if (await fs.exists(target)) {
            var raw = await fs.readFile(target)
            var u = b64uri(raw)
            if (u) {
              this.importing = ''
              return u
            }
          }
        } catch (e3) {}
      }
      this.importing = ''
      return ''
    },

    async confirmSel() {
      if (this.importing || !this.sel.length) return
      var picked = []
      for (var i = 0; i < this.sel.length; i++) {
        var it = null
        for (var k = 0; k < this.items.length; k++) if (this.items[k].name === this.sel[i]) it = this.items[k]
        if (!it) continue
        var uri = await this.loadOne(it)
        if (uri) picked.push(uri)
      }
      this.$forceUpdate()
      if (!picked.length) {
        this.hint = '载入失败，请再试一次'
        this.$forceUpdate()
        return
      }
      $falcon.trigger('penai_img', { list: picked })
      this.$page.finish()
    },

    // 调起系统内置的「AI拍照」小程序（appid 8001699004677776）
    // 它拍完的照片就落在 /userdisk/Pictures，正是本页读取的目录
    goCamera() {
      try {
        $falcon.navTo('falcon://8001699004677776/index')
        return
      } catch (e1) {
        try {
          $falcon.navTo({ appId: '8001699004677776', page: 'index' })
          return
        } catch (e2) {}
      }
      this.hint = '无法调起相机，请从主界面打开「AI拍照」'
      this.$forceUpdate()
    },

    close() {
      this.$page.finish()
    }
  }
}
</script>
