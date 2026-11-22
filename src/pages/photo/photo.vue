<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #000000;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 10px; padding-right: 10px; padding-top: 4px; padding-bottom: 4px; background-color: #14151d;">
      <text @click="close" style="font-size: 20px; color: #ffffff; background-color: #333849; padding-left: 14px; padding-right: 14px; padding-top: 3px; padding-bottom: 3px; border-radius: 16px;">×</text>
      <text style="font-size: 17px; color: #cfe0f5;">{{ tip }}</text>
      <text style="font-size: 15px; color: #5d6478;">取景</text>
    </div>

    <div style="flex: 1; background-color: #000000;">
      <image v-if="frame" :src="frame" resize="stretch" style="width: 100%; height: 100%;"></image>
      <div v-else style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
        <text style="font-size: 20px; color: #8b93a7;">正在启动取景器…</text>
      </div>
    </div>

    <div style="display: flex; flex-direction: row; align-items: center; justify-content: center; padding-top: 7px; padding-bottom: 7px; background-color: #14151d;">
      <text @click="shoot" :style="shootStyle">{{ shooting ? '拍摄中…' : '拍 摄' }}</text>
    </div>
  </div>
</template>

<script>
import fs from 'fs'

var IMGDIR = '/userdisk/PenAI_Images'

export default {
  data() {
    return {
      frame: '',
      lastB64: '',
      tip: '对准题目，点下方拍摄',
      shooting: false,
      stopped: false,
      timer: null
    }
  },

  computed: {
    shootStyle() {
      return {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: this.shooting ? '#3a3f52' : '#2a6df4',
        paddingLeft: '60px',
        paddingRight: '60px',
        paddingTop: '10px',
        paddingBottom: '10px',
        borderRadius: '24px'
      }
    }
  },

  mounted() {
    this.startPreview()
  },

  destroyed() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    try { fs.rm(IMGDIR + '/.preview_start') } catch (e4) {}
  },

  methods: {
    sleep(ms) {
      return new Promise(function (res) { setTimeout(res, ms) })
    },

    async startPreview() {
      try {
        await fs.writeFile(IMGDIR + '/.preview_start', '1')
      } catch (e) {
        this.tip = '取景启动失败'
        this.$forceUpdate()
        return
      }
      this.tick()
    },

    async tick() {
      if (this.stopped) return
      this.ticks = (this.ticks || 0) + 1
      if (this.ticks % 20 === 0) {
        try { await fs.writeFile(IMGDIR + '/.preview_start', '1') } catch (e3) {}
      }
      try {
        var b = await fs.readFile(IMGDIR + '/.preview.jpg.b64')
        var s = String(b).replace(/\s+/g, '')
        if (s && s.length > 100 && s !== this.lastB64) {
          this.lastB64 = s
          this.frame = 'data:image/jpeg;base64,' + s
          this.$forceUpdate()
        }
      } catch (e0) {}
      var self = this
      this.timer = setTimeout(function () { self.tick() }, 350)
    },

    async stopPreview() {
      this.stopped = true
      if (this.timer) clearTimeout(this.timer)
      try { await fs.rm(IMGDIR + '/.preview_start') } catch (e) {}
    },

    async close() {
      await this.stopPreview()
      this.$page.finish()
    },

    async listLatest() {
      var best = ''
      try {
        var names = await fs.readdir(IMGDIR)
        if (!Array.isArray(names)) names = String(names).split(',')
        for (var i = 0; i < names.length; i++) {
          var n = String(names[i])
          if (/^PHOTO_.*\.jpg\.b64$/i.test(n) && n > best) best = n
        }
      } catch (e) {}
      return best
    },

    async shoot() {
      if (this.shooting) return
      this.shooting = true
      this.tip = '拍摄中，请保持不动…'
      this.$forceUpdate()
      var before = await this.listLatest()
      try {
        await fs.writeFile(IMGDIR + '/.snap_request', '1')
      } catch (e) {
        this.tip = '请求失败，重试'
        this.shooting = false
        this.$forceUpdate()
        return
      }
      for (var i = 0; i < 30; i++) {
        await this.sleep(700)
        var latest = await this.listLatest()
        if (latest && latest !== before) {
          try {
            var b = await fs.readFile(IMGDIR + '/' + latest)
            var uri = 'data:image/jpeg;base64,' + String(b).replace(/\s+/g, '')
            await this.stopPreview()
            $falcon.trigger('penai_img', uri)
            this.$page.finish()
            return
          } catch (e2) {}
        }
      }
      this.tip = '拍摄超时，请重试'
      this.shooting = false
      this.$forceUpdate()
    }
  }
}
</script>
