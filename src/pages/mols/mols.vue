<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 12px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px; background-color: #1b1d27;">
      <div style="display: flex; flex-direction: row; align-items: flex-end;">
        <text style="font-size: 19px; color: #ffffff;">{{ items.length === 1 && items[0].label ? items[0].label : '结构图' }}</text>
        <text style="font-size: 14px; color: #6b7688; padding-left: 8px; padding-bottom: 2px;">{{ countLabel }}</text>
      </div>
      <text @click="close" style="font-size: 16px; color: #c8cfdd; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 4px; padding-bottom: 4px; border-radius: 5px;">{{ items.length === 1 ? '恢复原状' : '关闭' }}</text>
    </div>

    <scroller style="flex: 1;" scroll-direction="vertical" :show-scrollbar="true">
      <div style="padding-left: 10px; padding-right: 10px; padding-top: 8px;">
        <div v-if="!items.length" style="padding-top: 30px; display: flex; flex-direction: row; justify-content: center;">
          <text style="font-size: 18px; color: #6b7688;">没有可显示的结构</text>
        </div>

        <!-- 一次一个分子、按固定倍率渲染：复杂分子不再被压进小框，
             图比屏宽时卡片内横向滚动查看 -->
        <div v-for="(g, gi) in items" :key="'m' + gi" style="flex-direction: column; background-color: #171b26; border-radius: 8px; padding-top: 6px; padding-bottom: 6px; padding-left: 4px; padding-right: 4px; margin-bottom: 8px;">
          <scroller style="width: 908px;" scroll-direction="horizontal" :show-scrollbar="false">
            <image :src="g.uri" :style="g.st"></image>
          </scroller>
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 8px; padding-right: 8px; padding-top: 3px;">
            <text style="font-size: 15px; color: #9dc0ee;">{{ g.label }}</text>
            <text v-if="g.wide" style="font-size: 12px; color: #6b7688;">图宽 {{ g.px }}px · 左右滑动看全</text>
          </div>
        </div>
        <div style="height: 24px;"></div>
      </div>
    </scroller>
  </div>
</template>

<script>
import fs from 'fs'
import { buildPrimitives, molInfo } from '../../utils/mol.js'

var FILE = '/userdisk/penai_mols.json'
// 每"键长"渲染的像素：mol.js 标签字号 fs≈0.42 键长 → 约 19px，正文 17px 同级，清晰可读
var K = 45

export default {
  data() {
    return {
      items: [],
      total: 0
    }
  },
  computed: {
    countLabel() {
      return this.total ? '共 ' + this.total + ' 个' : ''
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      var list = []
      try {
        var raw = await fs.readFile(FILE)
        list = JSON.parse(String(raw))
      } catch (e) {
        list = []
      }
      if (!Array.isArray(list)) list = []
      var items = []
      for (var i = 0; i < list.length; i++) {
        var info = null
        try {
          // 先量自然尺寸，再按固定倍率 K 定框——等价 1:1 渲染，
          // 复杂分子（阿莫西林 ~25 原子）标签约 19px，不会再缩成 4px
          var geo = buildPrimitives(list[i].smiles, { color: '#eef2fa' })
          if (geo) {
            var bw = Math.max(120, Math.round((geo.bbox.w + 0.56) * K))
            var bh = Math.max(80, Math.round((geo.bbox.h + 0.56) * K))
            info = molInfo(list[i].smiles, '#eef2fa', bw, bh)
          }
        } catch (e2) {
          info = null
        }
        if (!info) continue
        items.push({
          uri: info.uri,
          label: (list[i].label || String(list[i].smiles || '').slice(0, 26)),
          st: 'width: ' + info.w + 'px; height: ' + info.h + 'px;',
          wide: info.w > 900,
          px: info.w
        })
      }
      this.items = items
      this.total = items.length
    },
    close() {
      this.$page.finish()
    }
  }
}
</script>

<style>
</style>
