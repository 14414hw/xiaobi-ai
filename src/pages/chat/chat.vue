<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 12px; padding-right: 12px; padding-top: 6px; padding-bottom: 6px; background-color: #1b1d27;">
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; flex-direction: row; align-items: flex-end;">
          <text style="font-size: 22px; color: #ffffff;">小笔 AI</text>
          <text style="font-size: 13px; color: #6b7688; padding-left: 8px; padding-bottom: 4px;">{{ ver }}</text>
        </div>
        <text style="font-size: 12px; color: #6b7688; padding-top: 2px;">{{ modelLine }}</text>
      </div>
      <div style="display: flex; flex-direction: row; align-items: center;">
        <text @click="newChat" style="font-size: 19px; color: #c8cfdd; padding-left: 12px; padding-right: 12px;">新对话</text>
        <text @click="openHistory" style="font-size: 19px; color: #c8cfdd; padding-left: 12px; padding-right: 12px;">历史</text>
        <text @click="openStars" style="font-size: 19px; color: #c8cfdd; padding-left: 12px; padding-right: 12px;">收藏</text>
        <text @click="renameSession" style="font-size: 19px; color: #c8cfdd; padding-left: 12px; padding-right: 12px;">命名</text>
        <text @click="openSettings" style="font-size: 19px; color: #6ea8ff; padding-left: 12px; padding-right: 10px;">设置</text>
        <!-- 回顶放最右并做成胶囊：离「新对话」远一点，避免手滑把当前对话归档 -->
        <text @click="backToTop" style="font-size: 17px; color: #0f1016; background-color: #6ee7a8; padding-left: 10px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px; border-radius: 6px; margin-left: 6px;">↑ 最新</text>
      </div>    </div>

    <!-- key 随点击变化 → scroller 重建 → 滚动位置回到顶部（不依赖组件是否支持 scroll-top）。
         最新一轮本来就排在最上方，所以"回到顶部"就是"回到最新对话"。 -->
    <scroller :key="'cs' + scrollKey" style="flex: 1;" scroll-direction="vertical" :show-scrollbar="true">
      <div style="padding-left: 10px; padding-right: 10px; padding-top: 8px;">
        <div v-if="!session.messages.length && !pending && !demoText" style="background-color: #171b26; border-radius: 9px; padding-left: 12px; padding-right: 12px; padding-top: 9px; padding-bottom: 10px; margin-bottom: 8px;">
          <text style="font-size: 16px; color: #9dc0ee;">点一个模板开始，或直接在下面输入</text>
          <div style="display: flex; flex-direction: row; flex-wrap: wrap; padding-top: 8px;">
            <text v-for="(t, ti) in templates" :key="'t' + ti" @click="useTemplate(t)" style="font-size: 16px; color: #eef2fa; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 7px; padding-bottom: 7px; border-radius: 6px; margin-right: 8px; margin-bottom: 8px;">{{ t.label }}</text>
          </div>
        </div>
        <div v-if="pending" style="display: flex; flex-direction: row; align-items: center; padding-bottom: 8px;">
          <text v-if="spinOn" style="font-size: 18px; color: #93bcff; margin-right: 7px;">{{ spinChar }}</text>
          <div v-else :style="dotStyle"></div>
          <text style="font-size: 18px; color: #93bcff;">{{ pendingText }}</text>
          <div v-if="sweepOn" style="width: 190px; height: 4px; background-color: #232a3d; border-radius: 2px; margin-left: 10px;">
            <div :style="sweepStyle"></div>
          </div>
        </div>
        <!-- 流式期间实时滚动的本轮 token 消耗（估算；服务端给 usage 时落库后用精确值） -->
        <text v-if="tokLive" style="font-size: 15px; line-height: 21px; color: #6b7688; padding-bottom: 8px;">{{ tokLive }}</text>
        <div v-if="errText" style="background-color: #2a1c20; border-radius: 8px; padding-left: 12px; padding-right: 12px; padding-top: 9px; padding-bottom: 9px; margin-bottom: 8px;">
          <text style="font-size: 17px; line-height: 24px; color: #ffa3a3;">{{ errText }}</text>
          <text @click="retryLast" style="font-size: 17px; color: #ffffff; background-color: #2a6df4; padding-left: 18px; padding-right: 18px; padding-top: 7px; padding-bottom: 7px; border-radius: 6px;">重试</text>
        </div>
        <div v-if="thinkLive && conf.showThink !== false" style="width: 912px; background-color: #171b26; border-radius: 9px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px; margin-bottom: 8px;">
          <text style="font-size: 14px; color: #7c869c; padding-bottom: 2px;">思考过程</text>
          <text style="width: 888px; font-size: 15px; line-height: 21px; color: #9aa5bd;">{{ thinkLive }}</text>
        </div>
        <div v-if="liveText" style="width: 912px; background-color: #171b26; border-radius: 9px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px; margin-bottom: 8px;">
          <text style="font-size: 14px; color: #6ee7a8; padding-bottom: 2px;">AI</text>
          <text style="width: 888px; font-size: 18px; line-height: 27px; color: #eef2fa;">{{ liveShown }}</text>
        </div>
        <div v-for="(m, i) in viewList" :key="'m' + i" :style="msgWrapStyle(i)">
          <text v-if="m.role === 'sep'" style="font-size: 14px; color: #6b7688; padding-top: 4px; padding-bottom: 4px;">{{ m.text }}</text>
          <div v-else-if="m.role === 'think'">
            <text style="width: 888px; font-size: 14px; line-height: 20px; color: #8a93a8;">{{ m.text }}</text>
          </div>
          <div v-else-if="m.role === 'user'" :style="bubbleStyle(m, 'user')">
            <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-bottom: 2px;">
              <text style="font-size: 14px; color: #7fa8e0;">我</text>
              <text v-if="m.idx >= 0 && !pending" @click="toggleOps(m.idx)" style="font-size: 14px; color: #aab6cc; background-color: #2b3040; padding-left: 10px; padding-right: 10px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px;">{{ m.sel ? '收起' : '操作' }}</text>
            </div>
            <text style="width: 888px; font-size: 18px; line-height: 27px; color: #dbe7fa;">{{ m.text }}</text>
            <div v-if="m.sel && !pending" style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 8px;">
              <text @click="editUser(m.idx)" :style="opStyle('')">编辑重问</text>
              <text @click="reAnswer(m.idx)" :style="opStyle('')">重答</text>
              <text @click="delRound(m.idx)" :style="opStyle('warn')">删除这轮</text>
            </div>
          </div>
          <div v-else :style="bubbleStyle(m, 'ai')">
            <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding-bottom: 2px;">
              <div style="display: flex; flex-direction: row; align-items: center;">
                <text style="font-size: 14px; color: #6ee7a8;">AI</text>
                <text v-if="m.starred" style="font-size: 14px; color: #ffd479; padding-left: 7px;">★ 已收藏</text>
              </div>
              <text v-if="m.idx >= 0 && !pending" @click="toggleOps(m.idx)" style="font-size: 14px; color: #aab6cc; background-color: #2b3040; padding-left: 10px; padding-right: 10px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px;">{{ m.sel ? '收起' : '操作' }}</text>
            </div>
            <div v-if="(m.molRows && m.molRows.length) || (m.molIssues && m.molIssues.length) || (m.molFailed && m.molFailed.length)" style="flex-direction: column; align-items: center; padding-top: 4px;">
              <!-- 校验提示必须排在结构图**上方**：屏幕只有 280px 高，图 130px 一放，
                   提示行就落到折叠线以下，客户不滚动等于没看到提醒。 -->
              <text v-if="m.molIssues && m.molIssues.length" style="width: 888px; font-size: 12px; line-height: 16px; color: #d8a25a; padding-bottom: 3px;">结构校验：{{ molWarnText(m) }}</text>
              <text v-if="m.molFailed && m.molFailed.length" style="width: 888px; font-size: 12px; line-height: 16px; color: #8a93a8; padding-bottom: 3px;">未绘制：{{ molFailText(m) }}</text>
              <div v-for="(row, ri) in m.molRows" :key="'r' + ri" style="display: flex; flex-direction: row; align-items: flex-start; justify-content: center; padding-bottom: 4px;">
                <div v-for="(g, gi) in row" :key="'g' + ri + '_' + gi" style="flex-direction: column; align-items: center; margin-left: 9px; margin-right: 9px;" @click="zoomMol(g)">
                  <!-- 分子名排在图**上方**：280px 屏上图 130px 一放，下方的名字
                       必然被输入栏吃掉（真机截图验证过），上方空间永远充足。
                       与「校验提示排图上方」是同一条原则。
                       「放大」入口也放进这一行：图下方新增一行会被输入栏遮住。 -->
                  <div style="display: flex; flex-direction: row; align-items: center; padding-bottom: 3px;">
                    <text v-if="g.label" style="font-size: 12px; line-height: 16px; color: #7c869c;">{{ g.label }}</text>
                    <text style="font-size: 11px; line-height: 16px; color: #0f1016; background-color: #6ee7a8; border-radius: 4px; padding-left: 5px; padding-right: 5px; margin-left: 6px;">放大</text>
                  </div>
                  <image v-if="g.uri" :src="g.uri" :style="g.st"></image>
                </div>
              </div>
              <text v-if="m.molMore > 0" @click="openMols(m)" style="font-size: 15px; color: #0f1016; background-color: #6ee7a8; padding-left: 12px; padding-right: 12px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px; margin-top: 2px; margin-bottom: 4px;">共 {{ m.molTotal }} 个结构，点开看全部 ›</text>
            </div>
            <div v-for="(ln, li) in m.lines" :key="'ln' + li">
              <!-- 分式：分子 / 横线 / 分母 三行竖排。行内出现时与前后文字同一行排。 -->
              <div v-if="ln.frac" style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 4px; padding-bottom: 4px;">
                <div v-for="(sg, si) in ln.frac" :key="'sg' + li + '_' + si" style="display: flex; flex-direction: row; align-items: center;">
                  <text v-if="sg.k === 't'" style="font-size: 18px; line-height: 27px; color: #eef2fa;">{{ sg.s }}</text>
                  <div v-if="sg.k === 'f'" style="display: flex; flex-direction: column; align-items: center; margin-left: 5px; margin-right: 5px;">
                    <text style="font-size: 18px; line-height: 24px; color: #eef2fa; text-align: center;">{{ sg.num }}</text>
                    <div :style="fracBar(sg)"></div>
                    <text style="font-size: 18px; line-height: 24px; color: #eef2fa; text-align: center;">{{ sg.den }}</text>
                  </div>
                  <div v-if="sg.k === 'v'" style="display: flex; flex-direction: column; align-items: center; margin-left: 2px; margin-right: 2px;">
                    <text style="font-size: 11px; line-height: 9px; color: #c8cfdd;">→</text>
                    <text style="font-size: 18px; line-height: 21px; color: #eef2fa;">{{ sg.body }}</text>
                  </div>
                  <div v-if="sg.k === 'r'" style="display: flex; flex-direction: row; align-items: flex-start; margin-left: 4px; margin-right: 4px;">
                    <!-- 根号：顶线画在被开方数上方（vinculum），与 √ 字形顶部相连。
                         v1.9.28 及以前线画在下方，看起来像下划线，且后面换行的文字
                         会被误读成分母（用户实拍报过）。 -->
                    <text style="font-size: 23px; line-height: 24px; color: #c8cfdd;">√</text>
                    <div style="display: flex; flex-direction: column; align-items: stretch;">
                      <div :style="radBar(sg)"></div>
                      <text style="font-size: 17px; line-height: 23px; color: #eef2fa; text-align: center;">{{ sg.body }}</text>
                    </div>
                  </div>
                </div>
              </div>
              <text v-else :style="lnStyle(ln)">{{ ln.t }}</text>
            </div>
            <text v-if="m.tok" style="font-size: 13px; line-height: 18px; color: #5c667c; padding-top: 6px;">{{ tokText(m) }}</text>
            <div v-if="m.sel && !pending" style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 8px;">
              <text @click="starMsg(m.idx)" :style="opStyle('')">{{ m.starred ? '取消收藏' : '收藏' }}</text>
              <text @click="reAnswer(m.idx)" :style="opStyle('')">重答</text>
              <text @click="editUser(m.idx)" :style="opStyle('')">改问</text>
              <text @click="delRound(m.idx)" :style="opStyle('warn')">删除这轮</text>
            </div>
            <div v-if="m.act && !pending && !m.sel" style="display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 7px;">
              <text v-if="m.study" @click="askAnswer" style="font-size: 15px; color: #0f1016; background-color: #ffd479; padding-left: 16px; padding-right: 16px; padding-top: 5px; padding-bottom: 5px; border-radius: 6px; margin-right: 8px; margin-bottom: 4px;">看答案</text>
              <text @click="starMsg(m.idx)" style="font-size: 15px; color: #0f1016; background-color: #6ee7a8; padding-left: 16px; padding-right: 16px; padding-top: 5px; padding-bottom: 5px; border-radius: 6px; margin-right: 8px; margin-bottom: 4px;">{{ m.starred ? '已收藏·点击取消' : '收藏' }}</text>
              <text v-for="(s, si) in followList" :key="'f' + si" @click="askChip(s)" style="font-size: 15px; color: #c8cfdd; background-color: #2b3040; padding-left: 14px; padding-right: 14px; padding-top: 5px; padding-bottom: 5px; border-radius: 6px; margin-right: 8px; margin-bottom: 4px;">{{ s }}</text>
            </div>
          </div>
        </div>
        <div style="height: 40px;"></div>
      </div>
    </scroller>

    <div style="background-color: #1b1d27;">
      <!-- 提示与撤销/确认固定在输入栏上方：消息滚到哪里都看得见，
           否则在旧消息上点删除/重答，提示会被卷到屏幕外，像没反应 -->
      <div v-if="noteText" style="display: flex; flex-direction: row; align-items: center; padding-left: 12px; padding-right: 12px; padding-top: 7px;">
        <text style="font-size: 15px; color: #6ee7a8;">{{ noteText }}</text>
        <text v-if="undoOpen" @click="undoDelete" style="font-size: 15px; color: #ffffff; background-color: #2a6df4; padding-left: 13px; padding-right: 13px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px; margin-left: 10px;">撤销</text>
      </div>
      <div v-if="confirmText" style="background-color: #33291a; border-radius: 8px; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px; margin-left: 10px; margin-right: 10px; margin-top: 6px;">
        <text style="font-size: 15px; line-height: 21px; color: #ffd479;">{{ confirmText }}</text>
        <div style="display: flex; flex-direction: row; align-items: center; padding-top: 6px;">
          <text @click="runConfirm" style="font-size: 15px; color: #0f1016; background-color: #ffd479; padding-left: 16px; padding-right: 16px; padding-top: 4px; padding-bottom: 4px; border-radius: 6px; margin-right: 8px;">确认</text>
          <text @click="cancelConfirm" style="font-size: 15px; color: #c8cfdd; background-color: #2b3040; padding-left: 16px; padding-right: 16px; padding-top: 4px; padding-bottom: 4px; border-radius: 6px;">取消</text>
        </div>
      </div>
      <div style="display: flex; flex-direction: row; align-items: center; padding-top: 8px; padding-bottom: 8px; padding-left: 8px; padding-right: 8px;">
        <text @click="scanAsk" :style="scanBtnStyle">拍照</text>
        <text @click="pickImage" :style="imgBtnStyle">{{ imgLabel }}</text>
        <div style="flex: 1; background-color: #2b3145; border-radius: 8px; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-left: 8px; margin-right: 10px;" @click="openKeyboard">
          <text :style="draftStyle">{{ draftLabel }}</text>
        </div>
        <text @click="onSendTap" :style="sendStyle">{{ pending ? '停止' : '发送' }}</text>
      </div>
    </div>
  </div>
</template>

<script>
import fs from 'fs'
import { loadConf, saveConf, loadSession, saveSession, archiveSession, loadDraft, saveDraft, APP_VERSION, RELEASE, composePrompt } from '../../utils/store.js'
import { addStar, delStar, loadStars } from '../../utils/stars.js'
import { userIndexOf, roundEnd, removeRound, truncateAfter, restoreRound, hasImages } from '../../utils/rounds.js'
import { chatOnce, chatAsk, askStream, buildUserContent, trimHistory, pickKey, routeConf, plainify, needSearch, searchConf, stripImages, nowText, stampTime, searchWeb, injectSearch, providerOf, canVision, scanResultAction, estTokens, estReqTokens } from '../../utils/api.js'
import { molInfo, needsBenzene } from '../../utils/mol.js'
import { extractMols, buildMolRows, openMolsView } from '../../utils/molsRender.js'
import { parseFracLine } from '../../utils/frac.js'
import { candidates, warmup } from '../../utils/pinyin.js'
import { suggestions } from '../../data/followups.js'

var W = 280
var H = 936
try {
  if ($falcon.env && $falcon.env.deviceWidth) W = $falcon.env.deviceWidth
  if ($falcon.env && $falcon.env.deviceHeight) H = $falcon.env.deviceHeight
} catch (e) {}
var BASE = Math.round(Math.min(W, H) / 14)
if (BASE < 18) BASE = 18
if (BASE > 26) BASE = 26

// Falcon 的 text 组件不会自动换行，按显示宽度手动插 \n
// 中文按 1 em、半角按 0.55 em 估算，上下标算 0.5
var BODY_FONT = 18
var BODY_WIDTH = 888
var MAX_EM = Math.floor(BODY_WIDTH / BODY_FONT)

var NO_HEAD = '，。、；：？！）》」』】〕｝〉‧・,.!?;:)]}%℃'

// 扫题：点「扫题」时把当前时间戳记在模块级变量里，而不是页面 data 上。
// navTo 去系统「AI拍照」时本页有可能被销毁重建，页面字段活不过那次跳转，
// 模块变量在整个 App 生命周期里都在。
var SCAN_DIR = '/userdisk/PenAI_Images'
var SCAN_TS = 0
var SCAN_BUSY = false
// 只有诊断入口会打开它。打开后 resumeScan 每走到一个终点就写一次 trace，
// 用来在没有人手点击的设备上验证「返回时自动取件」这条链路。
// 正常使用恒为 false，不产生任何额外文件读写。
var SCAN_TRACE = false

function charEm(ch) {
  var code = ch.charCodeAt(0)
  if (code < 128) return ch === ' ' ? 0.32 : 0.55
  if (code === 0xa0) return 0.32 /* nbsp：Falcon 行首不折叠，用于续行缩进 */
  if (code >= 0x2070 && code <= 0x209f) return 0.5
  if (code >= 0x00b0 && code <= 0x00bf) return 0.5
  return 1
}

// 一条线是不是化学方程式：含等号/箭头，且几乎没有中文
function isEqLine(line) {
  if (!line || line.length < 6) return false
  if (line.indexOf('=') < 0 && line.indexOf('→') < 0 && line.indexOf('⇌') < 0) return false
  var cjk = 0
  for (var i = 0; i < line.length; i++) {
    var c = line.charCodeAt(i)
    if (c > 0x3400 && c < 0x9fff) cjk++
  }
  return cjk <= 3
}

// 化学式里会出现的字符（拉丁字母、数字、括号、电荷、箭头、结晶水点、SMILES 记号）
// 上下标必须算进来：plainify 早已把 H2O 转成 H₂O，若这里不认 ₀-₉ / ⁰-⁹，
// 行尾扫描会在 CH₃ 的下标处停下，(CH₃-) 就会被从中间劈成 "CH₃" + "-)"。
function isFChar(c) {
  var code = c.charCodeAt(0)
  if (code >= 48 && code <= 57) return true
  if (code >= 65 && code <= 90) return true
  if (code >= 97 && code <= 122) return true
  if (code >= 0x2070 && code <= 0x209f) return true   // ⁰¹²³… 上标 / ₀₁₂… 下标
  return '()[]+↑↓·.=→⇌-@/\\#%'.indexOf(c) >= 0
}

// 行级样式标记：Falcon 渲染器不支持 <text> 嵌套（会崩），行内混排做不了，
// 只支持"整行级"格式：markdown 标题/加粗/斜体独占行 + 提示词固定格式的三个标题行。
// 返回 [{t: 显示文本, b: 粗体, i: 斜体, a: 强调色}]
var HEAD_WORDS = { '题目分析': 1, '分步解析': 1, '答案': 1, '解题思路': 1, '考点': 1 }

function styleLines(text) {
  var src = String(text || '').split('\n')
  var out = []
  for (var i = 0; i < src.length; i++) {
    var line = src[i]
    var tr = line.replace(/^\s+|\s+$/g, '')
    if (!line) { out.push({ t: ' ' }); continue }
    // 分式：整行数学式或行内 a/b 都交给页面竖排（见 utils/frac.js）
    var fr = parseFracLine(line)
    if (fr) { out.push({ t: line, frac: fr }); continue }
    if (HEAD_WORDS[tr] || HEAD_WORDS[tr.replace(/[：:]$/, '')]) {
      out.push({ t: line, b: 1, a: 1 }); continue
    }
    var h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) { out.push({ t: h[1], b: 1, a: 1 }); continue }
    var b1 = /^\*\*([^*]+)\*\*$/.exec(tr)
    if (b1) { out.push({ t: b1[1], b: 1 }); continue }
    var i1 = /^\*([^*]+)\*$/.exec(tr)
    if (i1) { out.push({ t: i1[1], i: 1 }); continue }
    out.push({ t: line })
  }
  return out
}

function emOf(str) {
  var w = 0
  for (var i = 0; i < str.length; i++) w += charEm(str.charAt(i))
  return w
}

/* 长方程式专用换行：只在空格处断，绝不在化学式中间切；续行缩进两格。
   返回 null 表示"这条按普通规则处理"（比如式子里没有空格、断了更难看） */
function wrapEquation(line, maxEm) {
  var parts = line.split(/\s+/)
  var toks = []
  for (var i = 0; i < parts.length; i++) if (parts[i]) toks.push(parts[i])
  if (toks.length < 2) return null

  for (var k = 0; k < toks.length; k++) if (emOf(toks[k]) > maxEm - 2) return null

  var out = []
  var cur = ''
  var curW = 0
  for (var t = 0; t < toks.length; t++) {
    var tok = toks[t]
    var w = emOf(tok)
    var add = cur ? 1 + w : w
    if (cur && curW + add > maxEm) {
      out.push(cur)
      // 续行缩进：普通空格行首被渲染器折叠，必须用 nbsp
      cur = '\u00a0\u00a0' + tok
      curW = 0.64 + w
    } else {
      cur = cur ? (cur + ' ' + tok) : tok
      curW += add
    }
  }
  if (cur) out.push(cur)
  return out.length > 1 ? out.join(String.fromCharCode(10)) : null
}

// 流式期间：已换行的段落按完整文本清洗，正在输入的末行原样保留，
// 避免把没写完的 \frac{1}{ 或 CH3CH2O 处理成半截（等这一行写完再洗）
function cleanLive(t) {
  var s = String(t || '')
  var cut = s.lastIndexOf('\n')
  if (cut < 0) return s
  try { return plainify(s.slice(0, cut)) + s.slice(cut) } catch (e) { return s }
}

function wrapText(text, maxEm) {
  if (!text) return ''
  var src = String(text).split('\n')
  var out = []
  for (var li = 0; li < src.length; li++) {
    var line = src[li]
    if (!line) { out.push(''); continue }
    // 含分式/根号的行不参与折行：竖排后宽度由内容决定，按字符数切会把分子分母或
    // 根号与被开方数劈开
    if (parseFracLine(line)) { out.push(line); continue }
    // 先看是不是长方程式：够宽就不动它，超宽就按运算符断行
    if (isEqLine(line)) {
      if (emOf(line) <= maxEm) { out.push(line); continue }
      var eq = wrapEquation(line, maxEm)
      if (eq) { out.push(eq); continue }
    }
    var cur = ''
    var w = 0
    var i = 0
    var guard = 0
    while (i < line.length && guard++ < 20000) {
      var ch = line.charAt(i)
      var cw = charEm(ch)
      if (w + cw > maxEm) {
        // 别把化学式从中间劈开：把行尾那段连续的公式字符整体挪到下一行
        var rs = cur.length
        while (rs > 0 && isFChar(cur.charAt(rs - 1))) rs--
        var runLen = cur.length - rs
        // 上限放到 48：让 OC[C@@H](O)[C@H](O)[C@H](O)CO 这类长 SMILES 整段换行，
        // 而不是在 @@ 中间劈开
        if (rs > 0 && runLen >= 2 && runLen <= 48 && cur.slice(rs).indexOf(' ') < 0) {
          out.push(cur.slice(0, rs))
          cur = cur.slice(rs)
          w = emOf(cur)
        } else
        if (NO_HEAD.indexOf(ch) >= 0 && cur.length > 1) {
          // 行首禁则：标点不留到下一行开头
          var last = cur.charAt(cur.length - 1)
          out.push(cur.slice(0, cur.length - 1))
          cur = last
          w = charEm(last)
        } else {
          var sp = cur.lastIndexOf(' ')
          if (sp > 0 && ch.charCodeAt(0) < 128) {
            out.push(cur.slice(0, sp))
            cur = cur.slice(sp + 1)
            w = 0
            for (var q = 0; q < cur.length; q++) w += charEm(cur.charAt(q))
          } else {
            out.push(cur)
            cur = ''
            w = 0
          }
        }
      }
      cur += ch
      w += cw
      i++
    }
    out.push(cur)
  }
  return out.join('\n')
}

// SMILES 提取与结构图构建已抽到 utils/molsRender.js（历史页共用同一套策略）

export default {
  data() {
    return {
      conf: {},
      ver: 'v' + APP_VERSION,
      dbg: 'ok',
      viewList: [],
      liveJoined: '',
      thinkLive: '',
      session: { messages: [] },
      draft: '',
      pending: false,
      pendingText: '正在思考…',
      liveText: '',
      errText: '',
      pendingImgs: [],
      noteText: '',
      searchOn: false,
      searchSrc: '',
      scrollKey: 0,
      demoText: '',
      elapsed: 0,
      tokLive: '',
      tickTimer: null,
      lastAsk: null,
      lastConf: null,
      askIsImg: false,
      starCount: 0,
      followList: [],
      // 消息操作（点气泡右上角「操作」展开）：opIdx 是 session.messages 的下标
      opIdx: -1,
      starIds: {},
      undoBuf: null,
      undoOpen: false,
      confirmText: '',
      confirmKind: '',
      confirmIdx: -1,
      forceAnswer: false,
      templates: [
        { label: '讲解这道题', pre: '请讲解这道题，给出思路和步骤：' },
        { label: '翻译句子', pre: '请翻译下面这句话，并讲解关键词：' },
        { label: '批改作文', pre: '请批改这篇作文，指出问题和改进方向：' },
        { label: '解释单词', pre: '请解释这个单词，给出音标、词性和两个例句：' },
        { label: '解释概念', pre: '请用高中生能懂的方式解释这个概念：' }
      ],
      revealTimer: null,
      // ---- 动效状态（2026-11-21）----
      // conf.animLevel：0 关闭 / 1 标准 / 2 流畅。动画全部由 JS 按帧驱动：
      // 这台设备的渲染器对 opacity/位移动画支持有限，CSS keyframes 不可靠；
      // JS 还能按档位控制帧率，关掉时一个定时器都不建，省电。
      enterMap: {},
      enterTimer: null,
      decoTimer: null,
      dotsPhase: 0,
      cursorOn: true,
      spinChar: '/',
      sweep: 0,
      // 屏幕刷新率（Hz）。本机 DRM 当前模式 280x936p60，实测 60.14Hz。
      // 读不到时按 60 处理：入场动画的帧间隔 = 1000/hz，30Hz 屏自动降到 30 帧。
      hz: 60
    }
  },

  computed: {
    // 顶栏副标题：显示当前模型。以前是写死的「模型：书生 / DeepSeek 官方」，
    // 与实际所选模型无关，发行版未配置时更是误导。
    modelLine() {
      var m = String(this.conf && this.conf.model || '').replace(/^\s+|\s+$/g, '')
      if (!m) return '模型：未选（设置页填写接口并拉取模型）'
      return '模型：' + m
    },
    draftLabel() {
      var n = this.pendingImgs.length
      var pre = n ? ('[已选 ' + n + ' 张图] ') : ''
      return pre + (this.draft || '点击输入问题…')
    },
    imgLabel() {
      var n = this.pendingImgs.length
      if (!n) return '相册'
      return n > 1 ? ('换图 ×' + n) : '换图'
    },
    // 这三个必须是 computed：模板里写成 :style="imgBtnStyle"（不带括号），
    // 放进 methods 传进模板的只是函数引用，Vue 不会执行，样式整个失效
    // ——这正是"相册/输入框/发送"文字深色看不清的原因（v1.9.3 修复）
    scanBtnStyle() {
      return {
        fontSize: '19px',
        color: '#0f1016',
        backgroundColor: '#6ee7a8',
        paddingTop: '11px',
        paddingBottom: '11px',
        paddingLeft: '10px',
        paddingRight: '10px',
        marginRight: '6px',
        borderRadius: '8px'
      }
    },
    imgBtnStyle() {
      return {
        fontSize: '19px',
        color: '#ffffff',
        backgroundColor: this.pendingImgs.length ? '#2a6df4' : '#4b5570',
        paddingTop: '11px',
        paddingBottom: '11px',
        paddingLeft: '12px',
        paddingRight: '12px',
        borderRadius: '8px',
        transitionProperty: 'background-color',
        transitionDuration: '180ms'
      }
    },
    draftStyle() {
      return {
        fontSize: BASE + 'px',
        lineHeight: Math.round(BASE * 1.45) + 'px',
        color: this.draft ? '#f2f6ff' : '#d3dbea'
      }
    },
    sendStyle() {
      return {
        fontSize: Math.max(14, BASE - 1) + 'px',
        color: '#ffffff',
        // 生成期间这颗按钮变成红色「停止」
        backgroundColor: this.pending ? '#8a3038' : '#2a6df4',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '9px',
        paddingBottom: '9px',
        borderRadius: '8px',
        transitionProperty: 'background-color',
        transitionDuration: '180ms'
      }
    },
    // 0 关闭 / 1 标准 / 2 流畅。配置还没读回来时按关闭处理，
    // 免得用户明明设了「关闭」、冷启动瞬间仍闪一下入场动画。
    animLv() {
      var n = parseInt(this.conf && this.conf.animLevel, 10)
      if (isNaN(n)) return 0
      return n
    },
    animOn() {
      return this.animLv > 0
    },
    // 流畅档才有旋转指示和扫描条；标准档只做呼吸点，少刷新
    spinOn() {
      return this.pending && this.animLv >= 2
    },
    sweepOn() {
      return this.pending && this.animLv >= 2
    },
    liveShown() {
      if (!this.animOn || !this.liveJoined) return this.liveJoined
      return this.liveJoined + (this.cursorOn ? '|' : ' ')
    },
    dotStyle() {
      var on = this.animLv > 0 && this.dotsPhase % 2 === 0
      return {
        width: '8px',
        height: '8px',
        borderRadius: '4px',
        backgroundColor: this.animLv > 0 ? (on ? '#93bcff' : '#3d5f92') : '#6ea8ff',
        marginRight: '9px'
      }
    },
    sweepStyle() {
      var p = this.sweep
      if (p < 0) p = 0
      if (p > 1) p = 1
      return {
        width: '50px',
        height: '4px',
        borderRadius: '2px',
        backgroundColor: '#6ea8ff',
        marginLeft: Math.round(p * 140) + 'px'
      }
    }
  },

  mounted() {
    var self = this
    this._entered = false
    this.detectHz()
    loadConf().then(function (c) {
      self.conf = c
      self.dbg = self.dbg + '|conf'
      self.tryEnterOnce()
    }).catch(function () { self.dbg = self.dbg + '|confERR' })
    loadSession().then(function (s) {
      self.session = s || { messages: [] }
      self.rebuildView()
      self.tryEnterOnce()
    }).catch(function (e) { self.dbg = self.dbg + '|sesERR' })
    this.dbg = 'm2'
    try { $falcon.on('penai_kb', this.onKb) } catch (e) { this.dbg = this.dbg + '|kbERR' }
    // 系统键盘（global.startTextEdit）：默认输入方式。回传后与自研键盘走
    // 同一个 onKb 分发（draft/title/edit 三种目标），交互差异只有"确认后整段回传"。
    try {
      var gmKb = require('global')
      var GKb = gmKb && (gmKb.Global || gmKb.default)
      this._gm = (typeof GKb === 'function') ? new GKb() : gmKb
      var gKb = this._gm
      if (gKb && gKb.textEditFinished && typeof gKb.textEditFinished.on === 'function') {
        var selfKb = this
        this._onSysKb = function (uuid, jsonData) {
          if (uuid !== selfKb._sysKbUuid) return
          selfKb._sysKbUuid = ''
          var text = ''
          try {
            var r = JSON.parse(jsonData)
            if (!r || !r.editConfirmed) return
            text = String(r.text || '')
          } catch (e) { return }
          try { gKb.closeTextEdit(uuid) } catch (e2) {}
          selfKb.onKb({ data: text })
        }
        gKb.textEditFinished.on(this._onSysKb)
      }
    } catch (e0) { this._gm = null }
    try { $falcon.on('penai_img', this.onImg) } catch (e) { this.dbg = this.dbg + '|imgERR' }
    try { $falcon.on('penai_reask', this.onReask) } catch (e) {}
    // 设置页保存后主动通知：本页在设置页打开期间不会重新 mounted，
    // 不重读配置的话，切了模型回来仍会继续用旧模型发请求。
    self._onConfSaved = function () {
      loadConf().then(function (c) {
        self.conf = c
        self.noteText = '设置已更新，下一次提问起生效'
        self.$forceUpdate()
      }).catch(function () {})
    }
    try { $falcon.on('penai_conf_saved', self._onConfSaved) } catch (e) {}
    // 扫题回程：从系统相机按返回后 App 会 onShow，这里接手取件。
    // 页面若在跳转中被销毁重建，mounted 里的 resumeScan 也会兜住。
    self._onAppShow = function () { self.resumeScan() }
    try { $falcon.on('penai_appshow', self._onAppShow) } catch (e) {}
    // 历史页「还原继续聊」：存档写回 session.json 后通知本页重读，无需重建页面
    self._onRestore = function () {
      loadSession().then(function (s) {
        self.session = s && s.messages && s.messages.length ? s : { messages: [] }
        self.opIdx = -1
        self.undoBuf = null
        self.undoOpen = false
        self.confirmText = ''
        self.confirmKind = ''
        self.confirmIdx = -1
        self.rebuildView()
        self.$forceUpdate()
      }).catch(function () {})
    }
    try { $falcon.on('penai_restore', self._onRestore) } catch (e) {}
    this.resumeScan()
    self.loadStarIds()
    this._kbTarget = ''
    this.pendingImgs = []
    this.dbg = 'm3'
    // 只在有 /userdisk/penai_diag.on 时跑内部自测，正常启动只探测这一个文件
    this.diagRun()
    loadDraft().then(function (v) {
      if (v && !self.draft) {
        self.draft = v
        self.$forceUpdate()
      }
    }).catch(function () {})
  },

  destroyed() {
    $falcon.off('penai_kb', this.onKb)
    try {
      if (this._gm) {
        if (this._onSysKb && this._gm.textEditFinished && this._gm.textEditFinished.off) this._gm.textEditFinished.off(this._onSysKb)
        if (this._sysKbUuid && this._gm.closeTextEdit) this._gm.closeTextEdit(this._sysKbUuid)
      }
    } catch (e) {}
    $falcon.off('penai_img', this.onImg)
    $falcon.off('penai_reask', this.onReask)
    try { $falcon.off('penai_conf_saved', this._onConfSaved) } catch (e) {}
    try { $falcon.off('penai_appshow', this._onAppShow) } catch (e) {}
    try { $falcon.off('penai_restore', this._onRestore) } catch (e) {}
    this.stopTick()
    this.stopDeco()
    if (this.enterTimer) clearInterval(this.enterTimer)
    if (this.revealTimer) clearTimeout(this.revealTimer)
    if (this._undoTimer) clearTimeout(this._undoTimer)
  },

  methods: {
    // 内部诊断派发：/userdisk/penai_diag.on 里写测试名，跑完自动删除。
    // 交付状态没有这个文件，正常冷启动只做一次 exists 探测（原来每次启动要探十几次）。
    async diagRun() {
      // 发行版没有诊断后门：整个派发器直接短路，/userdisk/penai_diag.on
      // 在发行版里就是普通文件，不会被消费也不会触发任何行为。
      if (RELEASE) return
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_diag.on') } catch (e0) { return }
      if (!gate) return
      var name = ''
      try { name = String(await fs.readFile('/userdisk/penai_diag.on') || '').trim() } catch (e1) {}
      try { await fs.rm('/userdisk/penai_diag.on') } catch (e2) {}
      var self = this
      var map = {
        selftest: function () { self.selfTest() },
        autosend: function () { self.autoAsk() },
        stream: function () { self.streamTest() },
        img: function () { self.imgTest() },
        imgsend: function () { self.imgSendTest() },
        sse: function () { self.sseProbe() },
        jsapi: function () { self.jsapiScan() },
        err: function () { self.errTest() },
        struct: function () { self.structTest() },
        mols: function () { self.gomolsTest() },
        demo: function () { self.loadDemo() },
        cam: function () { self.goCamTest() },
        settings: function () { self.goSettingsTest() },
        kb: function () { self.goKbTest() },
        history: function () { self.goHistoryTest() },
        nav: function () { self.autoNav() },
        star: function () { self.diagStar() },
        study: function () { self.diagStudy() },
        fast: function () { self.diagFast() },
        conf: function () { self.diagConf() },
        scan: function () { self.diagScan() },
        scanarm: function () { self.diagScanArm() },
        confswitch: function () { self.diagConfSwitch() },
        regress: function () { self.diagRegress() },
        ops: function () { self.diagOps() },
        opsconfirm: function () { self.diagOpsPick(1, 'confirm') },
        opsdel: function () { self.diagOpsPick(1, 'del') },
        empty: function () { self.session = { messages: [] }; self.rebuildView(); self.$forceUpdate() },
        // 只导出审计结果，不依赖屏幕可见区域（280px 高时提示行会被输入栏挡住）
        moldump: function () { self.diagMolDump() }
      }
      var fn = map[name]
      if (!fn) {
        this.writeDbg('diag', 'unknown: ' + name)
        return
      }
      // 老测试各自还认自己的开关文件，这里替它们补上，省得写两次文件
      var gates = {
        selftest: 'penai_selftest.on',
        autosend: 'penai_ask.on',
        stream: 'penai_streamtest.on',
        img: 'penai_imgtest.on',
        imgsend: 'penai_isend.on',
        sse: 'penai_sse.on',
        err: 'penai_errtest.on',
        struct: 'penai_structtest.on',
        mols: 'penai_gomols.on',
        cam: 'penai_gocam.on',
        settings: 'penai_gosettings.on',
        kb: 'penai_gokb.on',
        history: 'penai_gohistory.on',
        nav: 'penai_autonav.on'
      }
      if (gates[name]) {
        try { await fs.writeFile('/userdisk/' + gates[name], '1') } catch (e4) {}
      }
      try { fn() } catch (e3) { this.writeDbg('diag', name + ' ERR ' + (e3 && e3.message)) }
    },
    // 截图验证用：把最新一条回答的操作条展开（真机触摸注入对 falcon 页面无效，
    // 点击「操作」这一步没法自动化；这里只改 opIdx，不动会话内容）
    diagOps() {
      var self = this
      var tries = 0
      function go() {
        var msgs = self.session.messages || []
        // 会话是异步从磁盘读的，diagRun 可能比它早；等几拍再展开
        if (!msgs.length && tries < 12) { tries++; setTimeout(go, 300); return }
        for (var i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i] && msgs[i].role === 'assistant') {
            self.opIdx = i
            self.rebuildView()
            self.$forceUpdate()
            return
          }
        }
        self.noteText = '当前会话没有 AI 回答，无法验证操作条'
        self.$forceUpdate()
      }
      setTimeout(go, 300)
    },
    // 截图验证用：对指定轮次跑一次真实的重答确认 / 删除（只在 diag 门闩下调用）
    diagOpsPick(idx, mode) {
      var self = this
      var tries = 0
      function go() {
        var msgs = self.session.messages || []
        if (msgs.length <= idx && tries < 12) { tries++; setTimeout(go, 300); return }
        self.opIdx = idx
        self.rebuildView()
        self.$forceUpdate()
        if (mode === 'confirm') self.reAnswer(idx)
        else self.delRound(idx)
      }
      setTimeout(go, 300)
    },
    // 扫题取件自检：把「按钮按下后那段」单独跑一遍，结果写 /userdisk/penai_scan_trace.txt。
    // 走的是真实链路——写 .scan_request → imgd 找最新照片 → 增强 → 回 b64 → 贴进 pendingImgs，
    // 只跳过 navTo 相机那一步（那一步必须在有触摸的机器上人工点）。
    // 之所以要这个入口：设备上 send_event 注不进应用层，扫题链路没法用点击自动化回归。
    async diagScan() {
      var t0 = Date.now()
      SCAN_TRACE = true
      SCAN_TS = 1          // 任意非零即可，imgd 会取相册里最新一张
      SCAN_BUSY = false
      this.noteText = 'diag-scan'
      try {
        await this.resumeScan()
      } catch (e) {
        this.noteText = 'ERR ' + (e && e.message)
        this.scanTrace('exception')
      }
      this.noteText = this.noteText + ' · ' + (Date.now() - t0) + 'ms'
      this.$forceUpdate()
    },
    // 只上膛不开枪：把 SCAN_TS 置成待取件状态就返回，用来验证「从相机返回时
    // appshow 是否真的触发取件」——那一步必须由真实的前后台切换来驱动。
    diagScanArm() {
      SCAN_TRACE = true
      SCAN_TS = 1
      SCAN_BUSY = false
      this.noteText = '已上膛，等待返回取件'
      try { fs.writeFile('/userdisk/penai_scan_armed.txt', 'armed') } catch (e) {}
      this.$forceUpdate()
    },
    async diagStar() {
      await this.starThis()
      var self = this
      setTimeout(function () { self.openStars() }, 1500)
    },
    // 临时开做题模式（只改内存，不写配置，重启即恢复）；题目可写在 /userdisk/penai_ask.txt
    async diagStudy() {
      var q = '解方程 2x+3=11'
      try {
        var has = await fs.exists('/userdisk/penai_ask.txt')
        if (has) {
          var v = String(await fs.readFile('/userdisk/penai_ask.txt') || '').trim()
          if (v) q = v
        }
      } catch (e0) {}
      this.conf.studyMode = true
      this.noteText = '已临时开启做题模式（仅本次运行）'
      this.draft = q
      this.$forceUpdate()
      this.onSend()
    },
    // 临时关掉深度思考（只改内存），用来观察正文是否边生成边出现
    async diagFast() {
      var q = '用大约150字介绍光合作用'
      try {
        var has = await fs.exists('/userdisk/penai_ask.txt')
        if (has) {
          var v = String(await fs.readFile('/userdisk/penai_ask.txt') || '').trim()
          if (v) q = v
        }
      } catch (e0) {}
      this.conf.thinkingMode = false
      this.noteText = '已临时关闭深度思考（仅本次运行）'
      this.draft = q
      this.$forceUpdate()
      this.onSend()
    },
    // 把当前生效配置写到 /userdisk/penai_conf.txt（含密钥时打码），用于排查显示/路由问题
    async diagConf() {
      var c = {}
      for (var k in this.conf) c[k] = this.conf[k]
      if (c.systemPrompt) c.systemPrompt = String(c.systemPrompt).slice(0, 40) + '…'
      if (c.apiKey) c.apiKey = String(c.apiKey).slice(0, 4) + '****'
      if (c.keys) {
        var kk = {}
        for (var k2 in c.keys) kk[k2] = String(c.keys[k2] || '').slice(0, 4) + '****'
        c.keys = kk
      }
      var txt = JSON.stringify(c, null, 1)
      try { await fs.writeFile('/userdisk/penai_conf.txt', txt) } catch (e0) {}
      this.noteText = '配置已写入 /userdisk/penai_conf.txt'
      this.$forceUpdate()
    },
    // 验证「设置页保存 → 对话页重读配置」链路，跑完自动恢复原配置
    async diagConfSwitch() {
      var out = []
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
      await wait(500)
      var backup = {}
      for (var k in this.conf) backup[k] = this.conf[k]
      out.push('before=' + String(this.conf.model || ''))
      try {
        var test = {}
        for (var k2 in this.conf) test[k2] = this.conf[k2]
        test.model = 'CONF_SWITCH_PROBE'
        await saveConf(test)
        try { $falcon.trigger('penai_conf_saved', {}) } catch (e0) { out.push('trigger_err=' + String(e0)) }
        await wait(700)
        out.push('after=' + String(this.conf.model || ''))
        out.push('switched=' + (this.conf.model === 'CONF_SWITCH_PROBE'))
        out.push('note=' + String(this.noteText || ''))
      } catch (e) {
        out.push('EXCEPTION ' + String(e && e.message ? e.message : e))
      }
      await saveConf(backup)
      try { $falcon.trigger('penai_conf_saved', {}) } catch (e2) {}
      await wait(500)
      out.push('restored=' + String(this.conf.model || ''))
      this.writeDbg('confswitch', out.join('\n'))
    },
    // 交付前一键回归：结果写 /userdisk/penai_regress.txt，adb pull 回来核对。
    // 触发方式：写 "regress" 到 /userdisk/penai_diag.on 后重启应用（gate 会自动删）。
    // 覆盖配置迁移、词库、回顶、联网判定，以及两次真实问答（走完整 onSend 链路）。
    async diagRegress() {
      var out = []
      var self = this
      function log(s) { out.push(String(s)) }
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
      log('=== PenAI 端到端回归 t=' + Date.now() + ' ver=' + this.ver + ' ===')
      try {
        // 等 mounted 里 loadConf / loadSession 的异步回调都落地，避免竞态覆盖
        await wait(500)
        self.conf = await loadConf()
        self.session = (await loadSession()) || { messages: [] }
        self.rebuildView()

        log('[0] 时间基准')
        log('nowText=' + nowText())
        var stamped = stampTime([{ role: 'system', content: 'SYS' }])
        log('stamp_has_bj=' + (stamped[0].content.indexOf('北京时间') > 0) +
            ' stamp_has_sys=' + (stamped[0].content.indexOf('SYS') === 0))

        log('[1] 配置迁移')
        log('confRev=' + self.conf.confRev)
        var sp = String(self.conf.systemPrompt || '')
        // rev7 起提示词整段重写，断言改成新文案的特征：
        // 不能有 frac 指令、不能硬编码年份、必须保留 SMILES 与学情定位
        log('prompt_has_frac=' + (sp.indexOf('frac') >= 0))
        log('prompt_has_year=' + (/现在是20[0-9][0-9]/.test(sp)))
        log('prompt_has_smiles=' + (sp.indexOf('@//smiles') >= 0))
        log('prompt_has_grade=' + (sp.indexOf('高三') >= 0))
        log('prompt_len=' + sp.length)
        log('webSearch=' + self.conf.webSearch + ' aliyun_key=' + (self.conf.keys && self.conf.keys.aliyun ? 'yes' : 'no'))
        log('baseUrl=' + self.conf.baseUrl + ' model=' + self.conf.model)

        log('[2] 词库')
        log('warmup_keys=' + warmup())
        log('miao=' + candidates('miao', 12).join(' '))
        log('she=' + candidates('she', 12).join(' '))

        log('[3] 回到最新')
        var k0 = self.scrollKey
        var n0 = (self.viewList || []).length
        self.backToTop()
        await wait(150)
        log('scrollKey=' + k0 + '->' + self.scrollKey + ' viewList=' + n0 + '->' + (self.viewList || []).length)

        log('[4] 联网判定')
        // 设备可能把联网开关关了；回归临时打开（只改内存，不写配置，重启即恢复）
        var ws0 = self.conf.webSearch
        self.conf.webSearch = true
        log('webSearch_config=' + ws0 + ' forced_for_test=true')
        log('needSearch(天气)=' + needSearch('今天北京天气怎么样'))
        log('needSearch(2+3)=' + needSearch('2+3等于几'))
        var sc = searchConf(self.conf)
        log('searchConf=' + (sc ? sc.baseUrl + '|' + sc.model + '|searchOn=' + sc.searchOn : 'null'))

        log('[4b] 网络探测')
        var netOk = false
        var netDetail = ''
        try {
          var nr = await $falcon.jsapi.http.request({
            url: 'https://discovery-api.intern-ai.org.cn/v1/models',
            method: 'GET',
            header: { 'Authorization': 'Bearer ' + pickKey(self.conf) },
            timeout: 6000
          })
          netOk = !(nr && nr.error)
          if (!netOk) {
            try {
              var eo = typeof nr.result === 'string' ? JSON.parse(nr.result) : nr.result
              netDetail = String((eo && eo.errorMessage) || nr.error || '')
            } catch (e5) { netDetail = String((nr && nr.error) || '') }
            // 拿到 HTTP 状态码就说明链路是通的（401 多半只是探测没带对 key）
            if (/resCode:\s*[2345]\d\d/.test(netDetail)) netOk = true
          }
        } catch (ne) { netDetail = String(ne && ne.message ? ne.message : ne) }
        log('net_ok=' + netOk + ' detail=' + netDetail.slice(0, 160))

        if (!netOk) {
          log('[5] SKIP 网络不可用')
          log('[6] SKIP 网络不可用')
          log('RESULT=PARTIAL_NETWORK_DOWN  连上 WiFi 后重跑 regress')
        } else {
          // 回归只验链路，不验模型能力：临时走快通道，避免深思考拖到两分钟
          self.conf.smartRoute = true
          self.conf.thinkingMode = false
          log('route_forced=fast (仅本次运行)')
          log('[4c] 检索接口直连')
          var sw0 = Date.now()
          var swr = await searchWeb('今天北京天气', (self.conf.keys || {}).deepseek || '', 3)
          log('searchWeb_ok=' + swr.ok + ' n=' + (swr.n || 0) + ' cost=' + ((Date.now() - sw0) / 1000).toFixed(1) + 's err=' + (swr.error || ''))
          log('[5] 真实问答：联网')
          var a1 = await self.regressAsk('今天北京天气怎么样？只答一句')
          log('search_src=' + (self.searchSrc || ''))
          log('search_note=' + (self.noteText || ''))
          log('search_answer=' + String(a1).slice(0, 220))
          log('search_err=' + (self.errText || ''))

          log('[6] 真实问答：有机物')
          var a2 = await self.regressAsk('乙醇、乙酸、葡萄糖的结构简式分别怎么写？苯的SMILES是什么？')
          log('chem_plain=' + plainify(String(a2)).slice(0, 400))
          log('chem_err=' + (self.errText || ''))

          log('[7] 时间基准问答（措辞不含时效词，不走搜索）')
          var a3 = await self.regressAsk('依据时间基准，只回答日期，格式 YYYY年M月D日，不要解释。')
          log('date_answer=' + String(a3).slice(0, 120))
          log('date_err=' + (self.errText || ''))
          log('RESULT=OK')
        }
      } catch (e) {
        log('EXCEPTION ' + (e && e.message ? e.message : String(e)))
      }
      this.writeDbg('regress', out.join('\n'))
      this.noteText = '回归完成 → /userdisk/penai_regress.txt'
      this.$forceUpdate()
    },
    // 走完整发送链路（含选路、流式、入库），返回最后一条回答原文
    async regressAsk(q) {
      this.errText = ''
      this.draft = q
      this.pendingImgs = []
      // 只认本次新增的回答：请求失败时不能把历史里上一条回答误当成本次结果
      var before = ((this.session && this.session.messages) || []).length
      await this.onSend()
      var ms = (this.session && this.session.messages) || []
      if (ms.length <= before) return '(no new answer) err=' + (this.errText || '')
      for (var i = ms.length - 1; i >= before; i--) {
        if (ms[i] && ms[i].role === 'assistant') return String(ms[i].content || '')
      }
      return '(no answer)'
    },
    useTemplate(t) {
      if (this.pending) return
      var self = this
      this.draft = t.pre
      this.$forceUpdate()
      setTimeout(function () { self.openKeyboard() }, 120)
    },
    // 诊断门闩：验证笔内持流链路（streamd + curl + 文件轮询）
    async streamTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_streamtest.on') } catch (e0) { return }
      if (!gate) return
      try { await fs.rm('/userdisk/penai_streamtest.on') } catch (e1) {}
      this.draft = '用大约120字介绍牛顿第一定律'
      this.$forceUpdate()
      await this.onSend()
    },
    // 诊断门闩：探测 native SSE 桥接对象的存在与调用面（只读，不发请求）
    async sseProbe() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_sse.on') } catch (e0) { return }
      if (!gate) return
      try { await fs.rm('/userdisk/penai_sse.on') } catch (e1) {}
      var out = []
      function t(x) { out.push(String(x)) }
      try {
        var j = ($falcon && $falcon.jsapi) || null
        t('jsapi=' + (j ? 'ok' : 'null'))
        if (j) t('jsapi.keys=' + Object.keys(j).join(','))
        if (j) {
          t('jsapi.sseBridge=' + typeof j.sseBridge)
          t('jsapi.sse=' + typeof j.sse)
          t('jsapi.http=' + typeof j.http)
        }
        t('falcon.keys=' + Object.keys($falcon).join(','))
        try {
          var ij = $falcon.__JSAPI
          t('__JSAPI=' + typeof ij)
          if (ij) t('__JSAPI.keys=' + Object.keys(ij).join(','))
          if (ij && ij.sseBridge) t('__JSAPI.sseBridge.own=' + Object.getOwnPropertyNames(ij.sseBridge).join(','))
          if (ij && ij.sse) t('__JSAPI.sse.own=' + Object.getOwnPropertyNames(ij.sse).join(','))
          t('app=' + typeof $falcon.$app + ' startService=' + typeof $falcon.startService + ' startProvider=' + typeof $falcon.startProvider)
        } catch (e10) { t('__JSAPI.ERR ' + e10) }
        if (j && j.sseBridge) {
          try { t('sseBridge.own=' + Object.getOwnPropertyNames(j.sseBridge).join(',')) } catch (e8) { t('sseBridge.own.ERR ' + e8) }
        }
      } catch (e) { t('ERR ' + (e && e.message ? e.message : e)) }
      try { await fs.writeFile('/userdisk/penai_sse.txt', out.join('\n')) } catch (e2) {}
      this.noteText = 'SSE 探针已写入 /userdisk/penai_sse.txt'
      this.$forceUpdate()
    },
    writeDbg(name, msg) {
      try { fs.writeFile('/userdisk/penai_' + name + '.txt', String(msg)) } catch (e2) {}
    },
    setLive(t) {
      this.liveText = t || ''
      this.liveJoined = t ? wrapText(cleanLive(t), MAX_EM) : ''
    },
    // ================= 动效 =================
    // 消息入场：透明度 0→1 + 上移 10px。只动最新的 1~2 条，
    // 列表本身最多两轮对话，重排成本可控。关闭档直接不挂样式。
    msgWrapStyle(i) {
      var p = this.enterMap[i]
      if (p === undefined) return { marginBottom: '8px' }
      var e = p >= 1 ? 1 : p
      return {
        marginBottom: '8px',
        marginTop: Math.round((1 - e) * 10) + 'px',
        opacity: e.toFixed(2)
      }
    },
    // 冷启动只做一次入场：配置和会话谁先回来都可能，两边都调，内部只放行一次
    tryEnterOnce() {
      if (this._entered) return
      if (!this.conf || this.conf.animLevel === undefined) return
      if (!this.viewList || !this.viewList.length) return
      this._entered = true
      this.playEnter([0, 1])
    },
    playEnter(list) {
      if (!this.animOn || !list || !list.length) return
      var self = this
      var dur = this.animLv >= 2 ? 260 : 180
      // 帧率跟屏幕刷新率走：60Hz → 17ms，30Hz 屏自动减半，不白烧 CPU
      var fps = this.animLv >= 2 ? Math.min(this.hz || 60, 60) : 30
      var step = Math.max(16, Math.round(1000 / fps))
      var t0 = Date.now()
      if (this.enterTimer) { clearInterval(this.enterTimer); this.enterTimer = null }
      var m0 = {}
      for (var k0 in this.enterMap) m0[k0] = this.enterMap[k0]
      for (var a = 0; a < list.length; a++) m0[list[a]] = 0
      this.enterMap = m0
      this.$forceUpdate()
      this.enterTimer = setInterval(function () {
        var p = (Date.now() - t0) / dur
        if (p > 1) p = 1
        var e = 1 - Math.pow(1 - p, 3)
        var m = {}
        for (var k in self.enterMap) m[k] = self.enterMap[k]
        for (var j = 0; j < list.length; j++) m[list[j]] = e
        self.enterMap = m
        self.$forceUpdate()
        if (p >= 1) {
          clearInterval(self.enterTimer)
          self.enterTimer = null
        }
      }, step)
    },
    // 生成期间的装饰动效：呼吸点 / 旋转指示 / 光标闪烁 / 扫描条。
    // 自终止：pending 结束且没有流式正文时自己停，不依赖各处错误分支记得调 stop。
    ensureDeco() {
      if (!this.animOn || this.decoTimer) return
      var self = this
      var t0 = Date.now()
      var step = this.animLv >= 2 ? 80 : 250
      this.decoTimer = setInterval(function () {
        if (!self.pending && !self.liveText) { self.stopDeco(); return }
        var ms = Date.now() - t0
        self.dotsPhase = Math.floor(ms / 400)
        self.cursorOn = Math.floor(ms / 500) % 2 === 0
        self.spinChar = '/-\\|'.charAt(Math.floor(ms / 120) % 4)
        self.sweep = (ms % 1200) / 1200
        self.$forceUpdate()
      }, step)
    },
    stopDeco() {
      if (this.decoTimer) {
        clearInterval(this.decoTimer)
        this.decoTimer = null
      }
    },
    // 屏幕刷新率：DRM summary 里的 Display mode: 280x936p60。
    // 读不到就保持 60，不影响功能。
    async detectHz() {
      try {
        var txt = await fs.readFile('/sys/kernel/debug/dri/0/summary')
        var m = /Display mode:\s*\d+x\d+p(\d+)/.exec(String(txt || ''))
        if (m) this.hz = parseInt(m[1], 10) || 60
      } catch (e) {}
    },
    // 结构校验提示：最多列两条，避免把卡片撑高
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
    rebuildView() {
      try {
      var chrono = []
      var list = this.session.messages || []
      var aiSeen = 0
      var from = 0
      // 最新一条回答才挂「收藏 / 追问」操作条，避免每条卡片都多一行挤占屏幕
      var lastAi = -1
      for (var q0 = list.length - 1; q0 >= 0; q0--) {
        if (list[q0] && list[q0].role === 'assistant') { lastAi = q0; break }
      }
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].role === 'assistant') {
          aiSeen++
          if (aiSeen > 2) { from = i + 1; break }
        }
      }

      for (var k = 0; k < list.length; k++) {
        var m = list[k]
        var raw = this.toText(m.content)
        var picked = m.role === 'assistant' ? extractMols(raw) : { text: raw, mols: [] }
        // 深度思考段：灰显在对应回答前面，超长截断（屏幕滚动高度有限）
        if (m.role === 'assistant' && m.reasoning) {
          var rt = String(m.reasoning)
          if (rt.length > 600) rt = rt.slice(0, 600) + '…（思考全文 ' + rt.length + ' 字已省略）'
          chrono.push({ role: 'think', text: wrapText('思考：' + rt, MAX_EM) })
        }
        var item = { role: m.role, idx: k, sel: (k === this.opIdx), text: wrapText(picked.text, MAX_EM), lines: styleLines(wrapText(picked.text, MAX_EM)), act: (k === lastAi && m.role === 'assistant'), study: (m.role === 'assistant' && m.study === true) }
        if (m.role === 'assistant') {
          item.cost = m.cost
          item.tok = m.tok || null
          // 收藏状态按时间戳 id 对齐 stars.json（无 ts 的老消息不标星）
          item.starred = !!(m.ts && this.starIds[String(m.ts)])
        }
        if (m.role === 'assistant' && k >= from) {
          var g1 = null
          if (picked.mols.length) g1 = buildMolRows(picked.mols, 3)
          else if (needsBenzene(raw)) g1 = buildMolRows([{ smiles: 'c1ccccc1', label: '苯环' }], 1)
          if (g1) { item.molRows = g1.rows; item.molMore = g1.more; item.molTotal = g1.total; item.molsRaw = g1.valid; item.molIssues = g1.issues; item.molFailed = g1.failed }
        }
        chrono.push(item)
      }
      // 演示/诊断用：文件里的一段回答直接当消息渲染，不写进会话
      if (this.demoText) {
        var dm = extractMols(this.demoText)
        var dItem = { role: 'assistant', text: wrapText(dm.text, MAX_EM), lines: styleLines(wrapText(dm.text, MAX_EM)) }
        var g2 = null
        if (dm.mols.length) g2 = buildMolRows(dm.mols, 3)
        else if (needsBenzene(this.demoText)) g2 = buildMolRows([{ smiles: 'c1ccccc1', label: '苯环' }], 1)
        if (g2) { dItem.molRows = g2.rows; dItem.molMore = g2.more; dItem.molTotal = g2.total; dItem.molsRaw = g2.valid; dItem.molIssues = g2.issues; dItem.molFailed = g2.failed }
        chrono.push(dItem)
      }

      // 屏幕只有 6 行高，把最新一轮放在最上方：回答不再落在屏幕之外。
      // 老消息排在下方，用分隔条提示。
      var out = []
      for (var j = chrono.length - 1; j >= 0; j--) {
        out.push(chrono[j])
        if (j === chrono.length - 2 && j > 0) out.push({ role: 'sep', text: '↓ 更早的对话' })
      }
      this.viewList = out
      } catch (e) {
        this.writeDbg('render_err', (e && e.message ? e.message : String(e)) + ' | ' + (e && e.stack ? e.stack : ''))
        this.viewList = [{ role: 'sep', text: '渲染出错: ' + (e && e.message ? e.message : String(e)) }]
      }
    },
    // 诊断用：把 /userdisk/penai_demo.txt 的内容当一条回答渲染出来（不入会话）
    async loadDemo() {
      var self = this
      try {
        var has = await fs.exists('/userdisk/penai_demo.txt')
        self.dbg = self.dbg + '|ex' + (has ? 1 : 0)
        if (!has) return
        var raw = String(await fs.readFile('/userdisk/penai_demo.txt'))
        self.demoText = plainify(raw)
        self.rebuildView()
      } catch (e) { this.dbg = this.dbg + '|dmERR:' + (e && e.message ? e.message.slice(0, 40) : 'x') }
    },
    // 诊断用：把 demo 文本走一遍提取+审计，把 mols/issues/failed 落到文件，
    // 因为 936x280 的屏幕放不下「图 + 结构校验行」，只能靠数据核对
    async diagMolDump() {
      try {
        var raw2 = String(await fs.readFile('/userdisk/penai_demo.txt'))
        var dm2 = extractMols(plainify(raw2))
        var g3 = buildMolRows(dm2.mols, 3)
        await fs.writeFile('/userdisk/penai_moldump.txt', JSON.stringify({
          mols: dm2.mols,
          total: g3.total,
          rows: g3.rows.length,
          issues: g3.issues || [],
          failed: g3.failed || []
        }))
      } catch (e) { this.writeDbg('moldump_err', String(e && e.message ? e.message : e)) }
    },
    // 部署自测用：验证 $falcon.navTo 跨应用调起「AI拍照」(8001699004677776)
    async goCamTest() {
      try {
        if (!(await fs.exists('/userdisk/penai_gocam.on'))) return
        await fs.rm('/userdisk/penai_gocam.on')
      } catch (e) {
        return
      }
      var w = async function (t) {
        try { await fs.writeFile('/userdisk/penai_gocam_result.txt', t) } catch (e) {}
      }
      setTimeout(async function () {
        await w('step1: trying falcon:// url')
        try {
          $falcon.navTo('falcon://8001699004677776/index')
          await w('step1: fired, no throw')
        } catch (e1) {
          await w('step1 FAIL: ' + String(e1))
          try {
            $falcon.navTo({ appId: '8001699004677776', page: 'index' })
            await w('step2: object form fired')
          } catch (e2) {
            await w('step2 FAIL: ' + String(e2))
          }
        }
      }, 1600)
    },
    // 部署自测用：存在开关文件时自动进入相册页，验证整条选图链路
    async autoNav() {
      try {
        if (!(await fs.exists('/userdisk/penai_autonav.on'))) return
        await fs.rm('/userdisk/penai_autonav.on')
      } catch (e) {
        return
      }
      setTimeout(function () { $falcon.navTo('gallery', {}) }, 1400)
    },
    async selfTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_selftest.on') } catch (e0) {}
      if (!gate) return
      var out = []
      try {
        var conf = await loadConf()
        var sysP = composePrompt(conf.systemPrompt) || '用简体中文回答，给出步骤'
        var t0 = Date.now()
        var r = await chatAsk(routeConf(conf, false), [
          { role: 'system', content: sysP },
          { role: 'user', content: '解方程 x^2-5x+6=0，给出步骤' }
        ])
        var ms = Date.now() - t0
        out.push(r.ok ? 'MATH OK ' + ms + 'ms: ' + (r.text || '').slice(0, 80)
                      : 'MATH FAIL ' + ms + 'ms ' + r.error)

        // 化学题：验证化学式下标 / 离子 / 箭头 / 结构图清理在真机上的最终文本
        var t2 = Date.now()
        var rc = await chatAsk(routeConf(conf, false), [
          { role: 'system', content: sysP },
          { role: 'user', content: '配平 Fe + O2 -> Fe3O4，写出硫酸铝、氢氧化铁的化学式，再说明苯环的结构' }
        ])
        var msc = Date.now() - t2
        out.push(rc.ok ? 'CHEM OK ' + msc + 'ms:' + String.fromCharCode(10) + (rc.text || '').slice(0, 600)
                       : 'CHEM FAIL ' + msc + 'ms ' + rc.error)

        // 用相册里最新一张真实照片做视觉链路自测（退化时用固定样张）
        var b64 = ''
        var srcName = 'none'
        try {
          var names = await fs.readdir('/userdisk/PenAI_Images')
          if (!Array.isArray(names)) names = String(names).split(',')
          var best = ''
          for (var bi = 0; bi < names.length; bi++) {
            var bn = String(names[bi])
            // 必须排掉 .thumb.jpg.b64 —— 通配会把缩略图误判成原图
            if (/\.thumb\./i.test(bn)) continue
            if (/^SYS_.*\.jpg\.b64$/i.test(bn) && bn > best) best = bn
          }
          if (best) {
            srcName = best
            b64 = String(await fs.readFile('/userdisk/PenAI_Images/' + best)).replace(/\s+/g, '')
          }
        } catch (e9) {}
        if (!b64) {
          try {
            srcName = 'testimg'
            b64 = String(await fs.readFile('/userdisk/PenAI_Images/testimg.jpg.b64')).replace(/\s+/g, '')
          } catch (e8) {}
        }
        out.push('IMG ' + srcName + ' b64=' + b64.length)
        var t1 = Date.now()
        var r2 = await chatOnce(routeConf(conf, true), [{
          role: 'user',
          content: buildUserContent('图里主要是什么颜色？一句话', ['data:image/jpeg;base64,' + b64])
        }])
        var ms2 = Date.now() - t1
        out.push(r2.ok ? 'VL OK ' + ms2 + 'ms: ' + String(r2.text).slice(0, 60)
                       : 'VL FAIL ' + ms2 + 'ms ' + r2.error)
      } catch (e) {
        out.push('EXC ' + String(e))
      }
      try { await fs.writeFile('/userdisk/penai_test.txt', out.join('\n')) } catch (e2) {}
      try { await fs.rm('/userdisk/penai_selftest.on') } catch (e3) {}
    },
    // 部署自测：把 png 示例图逐个送给视觉模型，验证「读图 → @SMILES → 设备端生成结构图」
    async structTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_structtest.on') } catch (e0) {}
      if (!gate) return
      var out = []
      try {
        var conf = await loadConf()
        var names = await fs.readdir('/userdisk/penai_stest')
        if (!Array.isArray(names)) names = String(names).split(',')
        var list = []
        for (var i = 0; i < names.length; i++) {
          var n = String(names[i])
          if (/\.b64$/i.test(n)) list.push(n)
        }
        list.sort()
        out.push('图片数 ' + list.length)
        for (var k = 0; k < list.length; k++) {
          var b64 = String(await fs.readFile('/userdisk/penai_stest/' + list[k])).replace(/\s+/g, '')
          var t0 = Date.now()
          var r = await chatOnce(routeConf(conf, true), [
            { role: 'system', content: composePrompt(conf.systemPrompt) },
            {
              role: 'user',
              content: buildUserContent('这道题怎么做？图里涉及哪些分子结构，按约定格式给出。', ['data:image/jpeg;base64,' + b64])
            }
          ])
          var ms = Date.now() - t0
          if (!r.ok) {
            out.push('[' + list[k] + '] A路 FAIL ' + ms + 'ms ' + String(r.error).slice(0, 60))
            // 换旧端点视觉模型再试一次，看是不是只有 Sage 排队
            var fb = Object.assign({}, conf)
            fb.baseUrl = 'https://chat.intern-ai.org.cn/api/v1'
            fb.model = 'internvl3.5-latest'
            fb.apiKey = (conf.keys || {}).intern
            fb.smartRoute = false
            fb.thinkingMode = false
            var t1b = Date.now()
            var r1b = await chatOnce(fb, [{
              role: 'user',
              content: buildUserContent('这张图里的分子结构分别是什么？按约定格式输出 @SMILES。', ['data:image/jpeg;base64,' + b64])
            }])
            var ms1b = Date.now() - t1b
            if (!r1b.ok) { out.push('     B路(internvl) FAIL ' + ms1b + 'ms ' + String(r1b.error).slice(0, 60)); continue }
            var exb = extractMols(r1b.text || '')
            var lb = '     B路 OK ' + ms1b + 'ms 分子=' + exb.mols.length
            for (var mb = 0; mb < exb.mols.length && mb < 2; mb++) {
              var ib = null
              try { ib = molInfo(exb.mols[mb].smiles, '#eef2fa', 120, 92) } catch (eB) {}
              lb += String.fromCharCode(10) + '       ' + exb.mols[mb].smiles.slice(0, 44) + ' | ' + (exb.mols[mb].label || '') + ' | ' + (ib ? ib.w + 'x' + ib.h : 'renderFAIL')
            }
            out.push(lb)
            continue
          }
          var ex = extractMols(r.text || '')
          var line = '[' + list[k] + '] ' + ms + 'ms 分子=' + ex.mols.length
          for (var m = 0; m < ex.mols.length && m < 3; m++) {
            var info = null
            var tag = 'renderFAIL'
            try {
              info = molInfo(ex.mols[m].smiles, '#eef2fa', 120, 92)
              if (info) tag = info.w + 'x' + info.h + ' uri=' + info.uri.length
            } catch (eR) { tag = 'EXC ' + String(eR).slice(0, 40) }
            line += String.fromCharCode(10) + '   ' + ex.mols[m].smiles.slice(0, 48) + ' | ' + (ex.mols[m].label || '') + ' | ' + tag
          }
          line += String.fromCharCode(10) + '   TEXT: ' + String(r.text).slice(0, 260).split(String.fromCharCode(10)).join(' / ')
          out.push(line)
        }
      } catch (e) {
        out.push('EXC ' + String(e))
      }
      try { await fs.writeFile('/userdisk/penai_stest_result.txt', out.join(String.fromCharCode(10))) } catch (e2) {}
      try { await fs.rm('/userdisk/penai_structtest.on') } catch (e3) {}
    },
    toText(content) {
      if (typeof content === 'string') return plainify(content)
      if (!content || !content.length) return ''
      var s = ''
      var imgs = 0
      for (var i = 0; i < content.length; i++) {
        var p = content[i]
        if (p && p.type === 'text') s += p.text || ''
        else if (p && p.type === 'image_url') imgs++
      }
      if (imgs === 1) s += '[图片]'
      else if (imgs > 1) s += '[图片×' + imgs + ']'
      return s
    },
    tagStyle(m) {
      return {
        fontSize: '15px',
        color: m.role === 'user' ? '#6ea8ff' : '#6ee7a8',
        paddingBottom: '2px'
      }
    },
    bodyStyle(m) {
      return {
        fontSize: BASE + 'px',
        lineHeight: Math.round(BASE * 1.5) + 'px',
        color: m.role === 'user' ? '#9fb6d8' : '#e8ecf5'
      }
    },
    // 部署自测：验证「写文件 + 跳结构页」这条链路（触摸注入在真机上无效，只能这样验）
    async gomolsTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_gomols.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_gomols.on') } catch (e1) {}
      await new Promise(function (res) { setTimeout(res, 1600) })
      await this.openMols({ molsRaw: [
        { smiles: 'Oc1ccccc1', label: 'A 苯酚' },
        { smiles: 'CC(Br)c1ccccc1O', label: 'B 溴代物' }
      ] })
    },
    // 结构太多时，把完整列表写到文件再跳独立页展示（跨页传数组不方便）
    async openMols(m) {
      var list = (m && m.molsRaw) ? m.molsRaw : []
      if (!list.length) return
      var ok = await openMolsView(fs, $falcon, list)
      if (!ok) this.errText = '打不开结构页'
    },
    // 点内联结构图 → 单分子大图页（45px/键长的固定倍率，宽图可横滑细看）；
    // 大图页顶部「恢复原状」返回对话，消息位置不变，不影响继续提问。
    async zoomMol(g) {
      if (!g || !g.smiles) return
      await this.openMols({ molsRaw: [{ smiles: g.smiles, label: g.label || '' }] })
    },
    // 部署自测用：开关文件存在时枚举 $falcon 全部可用接口层写文件，用于评估录音/语音等能力
    async jsapiScan() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_jsapi_scan.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_jsapi_scan.on') } catch (e1) {}
      var out = []
      function dump(name, obj) {
        try {
          var keys = []
          for (var k in obj) keys.push(k)
          out.push(name + ': ' + keys.join(','))
        } catch (e) {
          out.push(name + ': <err ' + (e && e.message ? e.message : String(e)) + '>')
        }
      }
      dump('$falcon', $falcon)
      dump('$falcon.jsapi', $falcon.jsapi)
      dump('$falcon.env', $falcon.env)
      try { dump('$falcon.channel', $falcon.channel) } catch (e2) {}
      try { dump('global.falcon', typeof falcon !== 'undefined' ? falcon : '<none>') } catch (e3) {}

      // 服务能力探针（v1.9.13 结论）：
      // 宿主存在 Service 机制，$falcon.startService('falcon://{appid}/{serviceName}')
      // 能被解析（不抛错），但返回值恒为 undefined、无 onConnected 回调，
      // _serviceMap 始终为空 → 服务通道未对第三方 miniapp 开放。
      // native 层虽有 JSGlobalProxy.startScan / translate / stopVideoPlayer 等
      // 130+ 方法，但它们只注入到宿主自身上下文，miniapp 的 $falcon 上不可见。
      // 因此「语音朗读 / 语音输入 / 扫描取词」在本沙箱内仍然不可行。
      try {
        out.push('typeof startService=' + (typeof $falcon.startService))
        out.push('typeof broadcast=' + (typeof $falcon.broadcast))
        var sk2 = []
        for (var sv2 in ($falcon._serviceMap || {})) sk2.push(sv2)
        out.push('_serviceMap: ' + (sk2.length ? sk2.join(',') : '(empty)'))
      } catch (e7) { out.push('svc probe ERR ' + String(e7)) }

      try {
        await fs.writeFile('/userdisk/penai_jsapi_scan.txt', out.join(String.fromCharCode(10)))
      } catch (e4) {}
    },
    // 部署自测用：开关文件存在时跳键盘页（带长文本，验证预览区渲染与点选定位）
    async goKbTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_gokb.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_gokb.on') } catch (e1) {}
      // 诊断：penai_sympage.txt 写 0~5 可指定键盘初始页（2~5 为理科符号页）
      var pg = 0
      try {
        var raw = await fs.readFile('/userdisk/penai_sympage.txt')
        var n = parseInt(String(raw).trim(), 10)
        if (n >= 0 && n <= 5) pg = n
      } catch (e2) {}
      setTimeout(function () {
        $falcon.navTo('keyboard', { title: '键盘自测', data: '化学方程式配平是中学化学的核心技能：先观察法配金属原子，再用氢氧收尾，最后检查电荷守恒与质量守恒是否一致，注意气体与沉淀符号不要漏写。', page: pg })
      }, 1500)
    },
    // 部署自测用：开关文件存在时跳设置页（验证模型点选/参数说明/恢复默认布局）
    async goSettingsTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_gosettings.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_gosettings.on') } catch (e1) {}
      setTimeout(function () { $falcon.navTo('settings', {}) }, 1500)
    },
    // 部署自测用：存在开关文件时写入两段假历史并自动跳历史页，验证存档+列表渲染
    async goHistoryTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_gohistory.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_gohistory.on') } catch (e1) {}
      var fake1 = { messages: [
        { role: 'user', content: '帮我看看这道化学题，苯酚和浓溴水反应生成什么？', ts: Date.now() - 60000 },
        { role: 'assistant', content: '苯酚与浓溴水发生取代反应，生成 2,4,6-三溴苯酚白色沉淀：' + String.fromCharCode(10) + 'C6H5OH + 3Br2(浓溴水) → C6H2Br3OH↓ + 3HBr' + String.fromCharCode(10) + '这是酚类特征反应，常用于苯酚的检验与定量测定。', ts: Date.now() - 50000, reasoning: '先回顾苯酚的结构：羟基邻对位氢原子活泼，浓溴水过量时生成三溴苯酚沉淀，书写时注意沉淀符号。' },
        { role: 'user', content: '那再加铁盐会有什么现象？', ts: Date.now() - 40000 },
        { role: 'assistant', content: '苯酚遇 FeCl3 溶液显紫色，这是酚羟基与铁离子的特征显色反应，可用于鉴别苯酚。', ts: Date.now() - 30000 }
      ] }
      var fake2 = { messages: [
        { role: 'user', content: '解方程 x^2-5x+6=0', ts: Date.now() - 90000 },
        { role: 'assistant', content: '因式分解得 (x-2)(x-3)=0，所以 x=2 或 x=3。', ts: Date.now() - 80000 }
      ] }
      await archiveSession(fake2)
      await archiveSession(fake1)
      setTimeout(function () { $falcon.navTo('history', {}) }, 1500)
    },
    // 部署自测用：存在开关文件时模拟 gallery 的真实回传事件（走完整事件总线），
    // 验证 onImg 解包 + 草稿标签渲染。1x1 像素 jpeg 占位即可，不真发请求。
    async imgTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_imgtest.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_imgtest.on') } catch (e1) {}
      await new Promise(function (res) { setTimeout(res, 1800) })
      var px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
      $falcon.trigger('penai_img', { list: [px, px] })
    },
    // 部署自测用：带图自动提问，验证"图片也走流式"这条链路
    async imgSendTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_isend.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_isend.on') } catch (e1) {}
      await new Promise(function (res) { setTimeout(res, 2200) })
      var px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
      this.pendingImgs = [px]
      this.draft = '这张图里是什么？一句话'
      try { await this.onSend() } catch (e2) {}
    },
    // 部署自测用：从文件读入问题并自动发送，用于核验排版
    async autoAsk() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_ask.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_ask.on') } catch (e1) {}
      await new Promise(function (res) { setTimeout(res, 2200) })
      var q = ''
      try { q = String(await fs.readFile('/userdisk/penai_ask.txt') || '').trim() } catch (e3) {}
      if (!q) return
      this.pendingImgs = []
      this.draft = q
      try { await this.onSend() } catch (e4) {}
    },
    // 网络异常端到端验证门闩：把端点临时指向不可达地址并自动发一条，验证错误提示与 pending 清理
    async errTest() {
      var gate = false
      try { gate = await fs.exists('/userdisk/penai_errtest.on') } catch (e0) {}
      if (!gate) return
      try { await fs.rm('/userdisk/penai_errtest.on') } catch (e1) {}
      await new Promise(function (res) { setTimeout(res, 1200) })
      this.conf = Object.assign({}, this.conf, { baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-selftest', smartRoute: false })
      this.draft = '网络异常自测'
      try { await this.onSend() } catch (e2) {
        this.pending = false
        this.errText = '自测异常：' + String(e2)
        this.$forceUpdate()
      }
    },
    pickImage() {
      if (this.pending) return
      $falcon.navTo('gallery', {})
    },
    // 扫题：调起系统「AI拍照」，拍完返回后由 resumeScan 自动取回最新一张。
    // 本机摄像头被系统 CaptureFrame 独占，miniapp 没有相机 API，也不能直接
    // v4l2 抓帧（会把系统相机 pipeline 弄坏，历史上花屏过两次），所以只能走
    // 「调起系统相机 → 相册 → 我们取回」这条路。
    scanAsk() {
      if (this.pending) return
      SCAN_TS = Math.floor(Date.now() / 1000)
      SCAN_BUSY = false
      this.noteText = '对准题目拍照，拍完按返回键，扫描件会自动附上'
      this.$forceUpdate()
      var ok = false
      try {
        $falcon.navTo('falcon://8001699004677776/index')
        ok = true
      } catch (e) {
        try { $falcon.navTo({ appId: '8001699004677776', page: 'index' }); ok = true } catch (e2) {}
      }
      if (!ok) {
        SCAN_TS = 0
        this.noteText = '调不起相机，请从主界面打开「AI拍照」，拍完回来点「相册」选图'
        this.$forceUpdate()
      }
    },
    // 扫题取件的观测点：只有 SCAN_TRACE 打开时才写，正常使用不落盘。
    scanTrace(tag) {
      if (!SCAN_TRACE) return
      var img = (this.pendingImgs && this.pendingImgs[0]) || ''
      var line = 'tag=' + tag +
        '\nnote=' + (this.noteText || '') +
        '\nimgLen=' + img.length +
        '\nimgHead=' + img.slice(0, 30)
      try { fs.writeFile('/userdisk/penai_scan_trace.txt', line) } catch (e) {}
    },
    // 从相机回来后取件：先把上一次的结果删掉（否则会立刻命中旧图），
    // 再让 imgd 去找「比 SCAN_TS 更新」的相册照片并做扫描增强。
    async resumeScan() {
      if (!SCAN_TS || SCAN_BUSY) return
      SCAN_BUSY = true
      var ts = SCAN_TS
      SCAN_TS = 0
      var self = this
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
      this.noteText = '正在取回扫描件…'
      this.$forceUpdate()
      try { await fs.rm(SCAN_DIR + '/.scan_result') } catch (e0) {}
      try {
        await fs.writeFile(SCAN_DIR + '/.scan_request', String(ts))
      } catch (e1) {
        SCAN_BUSY = false
        this.noteText = '扫描请求写不进去，点「相册」手动选一张'
        this.$forceUpdate()
        this.scanTrace('nowrite')
        return
      }
      for (var i = 0; i < 30; i++) {
        await wait(500)
        var res = ''
        try { res = String(await fs.readFile(SCAN_DIR + '/.scan_result') || '').trim() } catch (e2) { continue }
        var act = scanResultAction(res)
        if (act === 'wait') continue
        if (act === 'attach') {
          try {
            var b = await fs.readFile(SCAN_DIR + '/SCAN_cur.jpg.b64')
            var s = String(b).replace(/\s+/g, '')
            if (s.length > 500) {
              self.pendingImgs = ['data:image/jpeg;base64,' + s]
              self.noteText = '扫描件已附上（约 ' + Math.round(s.length * 0.75 / 1024) + 'KB）。补一句想问的，一起发'
              self.$forceUpdate()
              SCAN_BUSY = false
              self.scanTrace('attach')
              return
            }
          } catch (e3) {}
        }
        self.noteText = act === 'nonew'
          ? '没拍到新照片，点「相册」手动选一张'
          : '扫描件处理失败，点「相册」手动选一张'
        self.$forceUpdate()
        SCAN_BUSY = false
        if (act === 'nonew') self.scanTrace('nonew')
        else self.scanTrace('fail')
        return
      }
      self.noteText = '取回扫描件超时，点「相册」手动选一张'
      self.$forceUpdate()
      SCAN_BUSY = false
      self.scanTrace('timeout')
    },
    onImg(e) {
      // 兼容三种回传：gallery 多选 {list:[uri]}、数组、photo 单图字符串
      var d = e && e.data
      if (d && Array.isArray(d.list)) d = d.list
      var arr = []
      if (Array.isArray(d)) {
        for (var i = 0; i < d.length; i++) if (typeof d[i] === 'string' && d[i]) arr.push(d[i])
      } else if (typeof d === 'string' && d) {
        arr = [d]
      }
      this.pendingImgs = arr
      if (arr.length) {
        this.errText = ''
        this.noteText = '已选 ' + arr.length + ' 张图'
      } else {
        // 操作提示走 noteText（无重试按钮），别占 errText 的重试通道
        this.noteText = '没有拿到图片，请回相册重新选'
      }
      this.$forceUpdate()
    },
    // AI 回答行级样式：标题行（题目分析/分步解析/答案）绿色加粗，markdown 加粗白粗，斜体斜切
    lnStyle(ln) {
      if (!ln) return { width: '888px', fontSize: '18px', lineHeight: '27px', color: '#eef2fa' }
      if (ln.a) return { width: '888px', fontSize: '18px', lineHeight: '27px', color: '#7fd48a', fontWeight: 'bold' }
      if (ln.b) return { width: '888px', fontSize: '18px', lineHeight: '27px', color: '#ffffff', fontWeight: 'bold' }
      if (ln.i) return { width: '888px', fontSize: '18px', lineHeight: '27px', color: '#cfd8ec', fontStyle: 'italic' }
      return { width: '888px', fontSize: '18px', lineHeight: '27px', color: '#eef2fa' }
    },
    // 分式横线：宽度由 frac.js 按分子/分母的估算宽度给出，取两者较宽的一侧
    fracBar(sg) {
      return {
        width: (sg && sg.w ? sg.w : 22) + 'px',
        height: '2px',
        'background-color': '#c8cfdd',
        'border-radius': '1px',
        'margin-top': '4px',
        'margin-bottom': '4px'
      }
    },
    // 根号顶线：画在被开方数上方，宽度盖住 body 即可（frac.js 按 17px 字号估算）
    radBar(sg) {
      return {
        width: (sg && sg.w ? sg.w : 22) + 'px',
        height: '2px',
        'background-color': '#c8cfdd',
        'border-radius': '1px',
        'margin-top': '3px'
      }
    },
    // 系统键盘可用性：设置选 system 且 global 模块就绪
    useSysKb() {
      return this.conf && this.conf.kbMode !== 'custom'
    },
    // 调系统键盘（global.startTextEdit）。global 未就绪或调用失败时退回
    // 自研键盘页，保证任何情况下都能输入。
    openSysKb(title, text) {
      var g = this._gm
      if (!g || typeof g.startTextEdit !== 'function') {
        $falcon.navTo('keyboard', { title: title, data: text, fullwidth: true })
        return
      }
      try {
        this._sysKbUuid = g.startTextEdit(JSON.stringify({
          text: text || '',
          placeholder: title,
          autofocus: true,
          maxlength: 2000,
          showCursor: true,
          inputType: 'ZhCNPreferred',
          multiLinesEditVisible: true,
          enterButtonText: '确认'
        }))
      } catch (e) {
        this._sysKbUuid = ''
        $falcon.navTo('keyboard', { title: title, data: text, fullwidth: true })
      }
    },
    openKeyboard() {
      if (this.pending) return
      this._kbTarget = 'draft'
      if (this.useSysKb()) { this.openSysKb('输入问题', this.draft); return }
      $falcon.navTo('keyboard', { title: '输入问题', data: this.draft, fullwidth: true })
    },
    onKb(e) {
      // 本轮命名回传：写 session.title 并立即落盘
      if (this._kbTarget === 'title') {
        this._kbTarget = ''
        var raw = e && e.data !== undefined ? e.data : (typeof e === 'string' ? e : '')
        var t = String(raw || '').replace(/^\s+|\s+$/g, '')
        if (t) {
          this.session.title = t.slice(0, 30)
          this.noteText = '本轮已命名：' + this.session.title
        } else {
          delete this.session.title
          this.noteText = '已清除本轮命名'
        }
        saveSession(this.session)
        this.$forceUpdate()
        return
      }
      // 编辑重问：截掉原提问及其后的全部内容，把新文本当新提问发出去
      if (this._kbTarget === 'edit') {
        this._kbTarget = ''
        var eu = this._editIdx
        this._editIdx = -1
        var txt = e && e.data !== undefined ? String(e.data || '') : ''
        if (!txt.replace(/^\s+|\s+$/g, '')) {
          this.noteText = '编辑内容为空，已取消'
          this.$forceUpdate()
          return
        }
        var ms = this.session.messages
        if (eu >= 0 && eu < ms.length) ms.splice(eu, ms.length - eu)
        this.lastAsk = null
        this.opIdx = -1
        this.draft = txt
        this.errText = ''
        this.rebuildView()
        this.$forceUpdate()
        var selfE = this
        setTimeout(function () { selfE.onSend() }, 260)
        return
      }
      if (this._kbTarget !== 'draft') return
      this.draft = e && e.data !== undefined ? e.data : ''
      saveDraft(this.draft)
      this.$forceUpdate()
    },
    openSettings() {
      if (this.pending) return
      var self = this
      $falcon.navTo('settings', {})
      setTimeout(function () { loadConf().then(function (c) { self.conf = c }) }, 400)
    },
    // 回到最上方（最新一轮回答）。两步保险：
    // ① 先清空列表，内容高度归零，滚动位置必然被夹到顶部；
    // ② 换 key 让 scroller 整体重建，40ms 后把内容放回去。
    backToTop() {
      var self = this
      var keep = this.viewList
      this.viewList = []
      this.scrollKey = (this.scrollKey || 0) + 1
      this.$forceUpdate()
      setTimeout(function () {
        self.viewList = keep
        self.$forceUpdate()
      }, 40)
    },
    async newChat() {
      if (this.pending) return
      // 旧会话滚进历史存档（有实质内容才存），再开新线。
      // 写盘失败时不清空，避免旧对话永久丢失。
      var ar = await archiveSession(this.session)
      if (ar === false) {
        this.noteText = '历史保存失败（存储异常），旧对话未归档，已取消新建以免丢失'
        this.$forceUpdate()
        return
      }
      this.session = { messages: [] }
      this.opIdx = -1
      this.undoBuf = null
      this.undoOpen = false
      this.confirmText = ''
      this.confirmKind = ''
      this.confirmIdx = -1
      if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null }
      this.errText = ''
      this.noteText = ar === 'empty' ? '已开始新对话' : '旧对话已存到历史，可点「历史」查看'
      this.thinkLive = ''
      this.rebuildView()
      saveSession(this.session)
    },
    openHistory() {
      if (this.pending) return
      $falcon.navTo('history', {})
    },
    // 发送/停止二合一：生成期间这颗按钮负责终止
    onSendTap() {
      if (this.pending) {
        this.stopGen()
        return
      }
      this.onSend()
    },
    stopGen() {
      if (!this.pending) return
      // askStream 轮询到 abort.v 置真后写 .stop 文件，streamd 杀 curl；
      // 整包请求不可中断，返回后丢弃结果
      if (this._stopFlag) this._stopFlag.v = true
      this.pendingText = '正在终止…'
      this.$forceUpdate()
    },
    // 给本轮对话命名：键盘页回传后写进 session.title，
    // 归档时随 entry.title 带进历史列表（历史页也可再改名）
    renameSession() {
      if (this.pending) return
      this._kbTarget = 'title'
      if (this.useSysKb()) { this.openSysKb('给本轮对话命名', this.session.title || ''); return }
      $falcon.navTo('keyboard', { title: '给本轮对话命名', data: this.session.title || '', lang: 'zh' })
    },
    openStars() {
      if (this.pending) return
      var self = this
      $falcon.navTo('stars', {})
      setTimeout(function () {
        self.loadStarIds()
      }, 400)
    },
    // 收藏状态表：按 id（消息时间戳）索引，气泡上的 ★ 与「取消收藏」都靠它
    async loadStarIds() {
      var arr = await loadStars()
      var map = {}
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id !== undefined) map[String(arr[i].id)] = 1
      }
      this.starIds = map
      this.starCount = arr.length
      this.rebuildView()
      this.$forceUpdate()
    },
    // 收藏任意一条回答（连带它对应的提问）；forceAdd 供诊断/快捷入口使用
    async starMsg(idx, forceAdd) {
      var msgs = this.session.messages || []
      var m = msgs[idx]
      if (!m || m.role !== 'assistant') {
        this.noteText = '只能收藏 AI 的回答'
        this.$forceUpdate()
        return
      }
      if (!m.ts) m.ts = Date.now()
      var id = String(m.ts)
      if (this.starIds[id] && forceAdd !== true) {
        await delStar(id)
        var map = Object.assign({}, this.starIds)
        delete map[id]
        this.starIds = map
        this.starCount = Math.max(0, this.starCount - 1)
        this.noteText = '已取消收藏'
        this.rebuildView()
        this.$forceUpdate()
        return
      }
      var q = ''
      for (var j = idx - 1; j >= 0; j--) {
        if (msgs[j] && msgs[j].role === 'user') { q = this.toText(msgs[j].content); break }
      }
      var a = this.toText(m.content)
      var r = await addStar({ q: q, a: a, ts: m.ts, model: this.conf.model || '' })
      if (!r.ok) this.noteText = '收藏失败：存储写入异常'
      else if (r.dup) {
        var map2 = Object.assign({}, this.starIds)
        map2[id] = 1
        this.starIds = map2
        this.noteText = '这条已经在收藏里了'
      } else {
        var map3 = Object.assign({}, this.starIds)
        map3[id] = 1
        this.starIds = map3
        this.starCount = r.count
        this.noteText = '已收藏（共 ' + r.count + ' 条），点顶部「收藏」查看'
      }
      this.rebuildView()
      this.$forceUpdate()
    },
    // 快捷入口（最新一条回答的「收藏」按钮、诊断）
    async starThis() {
      var msgs = this.session.messages || []
      var ai = -1
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i] && msgs[i].role === 'assistant') { ai = i; break }
      }
      if (ai < 0) {
        this.noteText = '还没有可收藏的回答'
        this.$forceUpdate()
        return
      }
      return this.starMsg(ai)
    },
    // 展开/收起某条消息的操作条
    toggleOps(idx) {
      if (this.pending) return
      if (idx === undefined || idx === null || idx < 0) return
      this.opIdx = this.opIdx === idx ? -1 : idx
      this.confirmText = ''
      this.rebuildView()
      this.$forceUpdate()
    },
    // 删除整轮问答（提问 + 它的回答），12 秒内可撤销
    delRound(idx) {
      if (this.pending) return
      var buf = removeRound(this.session.messages, idx)
      if (!buf || !buf.msgs.length) {
        this.noteText = '没找到对应的提问'
        this.$forceUpdate()
        return
      }
      this.undoBuf = buf
      this.undoOpen = true
      if (this._undoTimer) clearTimeout(this._undoTimer)
      var self = this
      this._undoTimer = setTimeout(function () {
        self.undoOpen = false
        self.undoBuf = null
        self.$forceUpdate()
      }, 12000)
      this.opIdx = -1
      this.lastAsk = null
      this.noteText = '已删除 ' + buf.msgs.length + ' 条（12 秒内可撤销）'
      this.rebuildView()
      this.$forceUpdate()
      saveSession(this.session)
    },
    undoDelete() {
      if (!this.undoBuf) return
      var n = restoreRound(this.session.messages, this.undoBuf)
      this.undoBuf = null
      this.undoOpen = false
      if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null }
      this.lastAsk = null
      this.noteText = '已恢复 ' + n + ' 条消息'
      this.rebuildView()
      this.$forceUpdate()
      saveSession(this.session)
    },
    // 编辑某轮提问：带图提问不做编辑（图片无法回填），提示删除后重发
    editUser(idx) {
      if (this.pending) return
      var u = userIndexOf(this.session.messages, idx)
      if (u < 0) {
        this.noteText = '没找到要编辑的提问'
        this.$forceUpdate()
        return
      }
      var m = this.session.messages[u]
      if (hasImages(m.content)) {
        this.noteText = '这条提问带图片，暂不支持编辑，可「删除这轮」后重新拍'
        this.$forceUpdate()
        return
      }
      var t = this.toText(m.content)
      this.opIdx = -1
      this.rebuildView()
      this._kbTarget = 'edit'
      this._editIdx = u
      if (this.useSysKb()) { this.openSysKb('编辑问题', t); return }
      $falcon.navTo('keyboard', { data: t, title: '编辑问题', fullwidth: true })
    },
    // 重答某轮：保留提问、清掉其后所有内容再问一次。
    // 非最后一轮会丢后续对话，先走二次确认。
    reAnswer(idx) {
      if (this.pending) return
      var u = userIndexOf(this.session.messages, idx)
      if (u < 0) {
        this.noteText = '没找到对应的提问'
        this.$forceUpdate()
        return
      }
      // 只有「这轮之后还有别的对话」才需要确认；最后一轮重答只替换自己的回答
      var tail = this.session.messages.length - roundEnd(this.session.messages, u)
      if (tail > 0) {
        this.confirmText = '「重答」会删掉这轮之后的 ' + tail + ' 条对话，确定继续？'
        this.confirmKind = 'reanswer'
        this.confirmIdx = u
        this.$forceUpdate()
        return
      }
      this.doReAnswer(u)
    },
    doReAnswer(u) {
      var n = truncateAfter(this.session.messages, u)
      this.lastAsk = null
      this.opIdx = -1
      this.confirmText = ''
      this.confirmKind = ''
      this.confirmIdx = -1
      if (n > 0) saveSession(this.session)
      this.rebuildView()
      this.$forceUpdate()
      this.onSend(true)
    },
    runConfirm() {
      if (this.confirmKind === 'reanswer') {
        var u = this.confirmIdx
        this.confirmText = ''
        this.confirmKind = ''
        this.confirmIdx = -1
        this.doReAnswer(u)
        return
      }
      this.cancelConfirm()
    },
    cancelConfirm() {
      this.confirmText = ''
      this.confirmKind = ''
      this.confirmIdx = -1
      this.$forceUpdate()
    },
    opStyle(kind) {
      var warn = kind === 'warn'
      return {
        fontSize: '15px',
        color: warn ? '#ffb4b4' : '#c8cfdd',
        backgroundColor: warn ? '#3a2430' : '#2b3040',
        paddingLeft: '14px',
        paddingRight: '14px',
        paddingTop: '5px',
        paddingBottom: '5px',
        borderRadius: '6px',
        marginRight: '8px',
        marginBottom: '4px'
      }
    },
    bubbleStyle(m, which) {
      var sel = !!(m && m.sel)
      var bg = which === 'user' ? '#16233a' : '#171b26'
      if (sel) bg = which === 'user' ? '#1b2a45' : '#1d2331'
      return {
        width: '912px',
        backgroundColor: bg,
        borderRadius: '9px',
        paddingLeft: '12px',
        paddingRight: '12px',
        paddingTop: '8px',
        paddingBottom: '8px'
      }
    },
    // 从收藏页点「再问一次」回来：直接重发那道题
    onReask(e) {
      var t = e && e.data !== undefined ? String(e.data) : ''
      if (!t) return
      var self = this
      this.draft = t
      this.noteText = '已从收藏带入，正在重新提问…'
      this.$forceUpdate()
      setTimeout(function () { self.onSend() }, 500)
    },
    async onSend(reuse) {
      if (this.pending) return
      var q = ''
      var hasImg = false
      if (reuse === true) {
        // 重答：最后一条就是待重答的提问，不新增 user 消息
        var last = this.session.messages[this.session.messages.length - 1]
        if (!last || last.role !== 'user') {
          this.noteText = '没有可重答的提问'
          this.$forceUpdate()
          return
        }
        q = this.toText(last.content)
        hasImg = hasImages(last.content)
      } else {
        q = (this.draft || '').trim()
        hasImg = this.pendingImgs.length > 0
      }
      if (!pickKey(this.conf)) {
        this.errText = '还没填 API 密钥，去设置里填'
        $falcon.navTo('settings', {})
        return
      }

      this.errText = ''
      this.setLive('')
      this.followList = []
      this.opIdx = -1
      this.confirmText = ''
      if (!q && !hasImg) {
        this.errText = '先输入问题'
        return
      }
      if (reuse !== true) {
        var userMsg = { role: 'user', content: buildUserContent(q || '请看图', hasImg ? this.pendingImgs.slice() : null), ts: Date.now() }
        this.session.messages.push(userMsg)
      }
      this.rebuildView()
      if (reuse !== true) {
        this.draft = ''
        saveDraft('')
        this.pendingImgs = []
      }
      this.pending = true
      this.elapsed = 0
      this._gotText = false
      this.tokLive = ''
      this.noteText = ''
      this.pendingText = this.conf.thinkingMode === false ? '正在回答…' : '深度思考中…'
      this.startTick()
      this.ensureDeco()
      this.playEnter([0])
      this.$forceUpdate()

      // 做题模式：只讲思路不给答案；点「看答案」时 forceAnswer 置真，放行完整解答
      // 提示词模板末尾的「答案」段要先摘掉，否则模型会照着模板把答案写出来（实测会漏）
      // 发送必须走 composePrompt：在这里合成锁定的公式与化学规范。
      // 直接读 conf.systemPrompt 会绕过核心约束。
      var sys = composePrompt(this.conf.systemPrompt || '')
      var studyNow = this.conf.studyMode === true && !this.forceAnswer
      if (studyNow) {
        sys = sys.replace(/答案\s*$/, '') +
          '\n\n【练习模式，最高优先级，覆盖以上所有格式要求】只写「题目分析」和「分步解析」，解析最多两步，停在算出结果之前。' +
          '禁止写出最终答案、最终数值或选项，禁止以「答案」作为段落标题。一步就能出结果的题，只写出算式，不要代入算出数值。' +
          '哪怕题目很简单也必须停住。最后单独一行输出：答案先不给'
      }
      this._studyAsk = studyNow
      this.forceAnswer = false
      var msgs = [{ role: 'system', content: sys }]
      var hist = trimHistory(this.session.messages, this.conf.historyRounds)
      for (var i = 0; i < hist.length; i++) {
        msgs.push({ role: hist[i].role, content: hist[i].content })
      }

      this.lastAsk = msgs
      this.askIsImg = hasImg
      // 智能选路：书生家的模型走快通道（文字旧端点 / 图片 Sage），
      // DeepSeek、阿里云的模型按用户选择原样直连，只补端点与密钥
      var sendConf = routeConf(this.conf, hasImg)
      var provNow = providerOf(sendConf)
      if (this.conf.smartRoute) {
        if (provNow === 'deepseek') this.noteText = 'DeepSeek 官方直连'
        else if (provNow === 'intern-ds') this.noteText = '书生托管 DeepSeek-1017'
        else if (provNow === 'aliyun') this.noteText = '阿里云通道'
        else this.noteText = hasImg ? '图片走 Sage 视觉模型' : '文字走书生 S2'
      }
      // 关闭智能选路时，仍要保证图片有视觉模型接手
      if (hasImg && !this.conf.smartRoute && !canVision(this.conf.model)) {
        var b0 = this.conf.baseUrl || ''
        var alt = 'Sage-A1.5'
        if (/api\.deepseek\.com/.test(b0)) alt = 'deepseek-flash'
        else if (/dashscope/.test(b0)) alt = 'qwen-vl-max'
        else if (/intern-ai/.test(b0) && !/discovery-api/.test(b0)) alt = 'internvl3.5-latest'
        sendConf = Object.assign({}, this.conf, { model: alt })
        this.noteText = '当前模型不收图，已切到 ' + alt + ' 看图'
      }
      this.searchOn = false
      this.searchSrc = ''
      // 联网搜索：先把网页摘要检索回来，再让「当前选中的模型」带着摘要作答。
      // 旧做法是整包切到阿里云 qwen-plus 开 enable_search，等于换个模型回答问题，
      // 换模型就联网能力打折；现在检索与作答解耦，书生模型也能联网。
      if (this.conf.webSearch && !hasImg && needSearch(q)) {
        this.pendingText = '正在检索网页…'
        var sKey = (this.conf.keys && this.conf.keys.deepseek) || ''
        var sb = await searchWeb(q, sKey, 4)
        if (sb && sb.ok) {
          msgs = injectSearch(msgs, sb.block)
          this.lastAsk = msgs
          this.searchOn = true
          this.searchSrc = 'deepseek'
          this.noteText = '已检索 ' + sb.n + ' 条网页'
        } else {
          // 检索接口不可用（欠费/限流/断网）时退回原来的阿里云整包搜索
          var sc = searchConf(this.conf)
          if (sc) {
            sendConf = sc
            msgs = stripImages(msgs)
            this.lastAsk = msgs
            this.searchOn = true
            this.searchSrc = 'aliyun'
            this.noteText = '联网搜索中…'
            this.pendingText = '正在检索网页（约 5 秒）…'
          }
        }
      }
      this.lastConf = sendConf
      // 本轮输入侧 token 估算：要在检索注入完成之后取，摘要也算进去
      this._tokIn = estReqTokens(msgs)
      var stopFlag = { v: false }
      this._stopFlag = stopFlag
      var t0 = Date.now()
      var r
      var streamed = false
      var self2 = this
      try {
        // 文字与图片都走流式；带图时 body 体积过大（>3MB）会自动回退整包
        if (this.conf.streamMode !== false) {
          r = await askStream(sendConf, msgs, function (d) {
            if (d.think) self2.thinkLive = wrapText(d.think, MAX_EM)
            if (d.text) self2._gotText = true
            // 流式期间按累积文本实时估算本轮消耗（思考与正文都算输出侧）
            self2._liveTok = estTokens((d.text || '') + (d.think || ''))
            self2.tokLive = '本轮已生成 ≈' + self2.fmtTok(self2._liveTok) + ' tok · 输入约 ' + self2.fmtTok(self2._tokIn) + ' tok'
            self2.setLive(d.text)
            self2.pendingText = d.text ? '正在回答…' : '深度思考中…'
            self2.$forceUpdate()
          }, stopFlag)
          streamed = !!(r && r.stream)
          // 回退整包：流式通道不可用（noStream/tooBig）或流式自身失败。
          // 用户主动终止（stopped）与思考截断提示（reasoningOnly）不重发。
          if (r && (r.noStream || r.tooBig || (!r.ok && !r.stopped && !r.reasoningOnly))) r = await chatAsk(sendConf, msgs)
        } else {
          r = await chatAsk(sendConf, msgs)
        }
      } catch (e) {
        // chatAsk 内部若抛未捕获异常，pending 会永远卡住 → 必须显式清理
        this.stopTick()
        this.pending = false
        this.errText = '请求异常：' + (e && e.message ? e.message : String(e)) + '（点「重试」再发一次）'
        this.$forceUpdate()
        return
      }
      var cost = ((Date.now() - t0) / 1000).toFixed(1)
      // 优先用服务端 usage（流式尾包或整包响应里带的），没有才用本地估算
      var usage = r && r.usage ? r.usage : null
      var tok = {
        i: usage && usage.prompt_tokens ? usage.prompt_tokens : (this._tokIn || 0),
        o: usage && usage.completion_tokens ? usage.completion_tokens : estTokens(((r && r.text) || '') + ((r && r.reasoning) || '')),
        est: usage ? 0 : 1
      }
      this.stopTick()

      // 用户点了「停止」：流式真杀 curl，整包请求则丢弃结果。
      // 已生成的部分内容落库保留，不算错误。
      if (stopFlag.v) {
        this.pending = false
        this.tokLive = ''
        if (r && r.ok && r.text) {
          this.finishAnswer(r.text, cost, r.reasoning || '', tok)
          this.noteText = '已终止生成，保留已生成的部分'
        } else {
          this.setLive('')
          this.thinkLive = ''
          this.noteText = '已终止生成'
        }
        this.$forceUpdate()
        return
      }

      if (!r || !r.ok) {
        this.pending = false
        var emsg = (r && r.error) || '未知错误'
        // 阿里云通道欠费/限流/密钥失效时，别让用户对着 401 发呆
        if (this.searchOn && /401|403|429|欠费|余额|限流|Unauthorized|invalid|Incorrect/i.test(emsg)) {
          emsg = '联网搜索通道不可用（' + emsg + '）。已切回普通回答，再发一次即可'
          this.searchOn = false
        }
        this.errText = emsg + '（' + cost + 's）'
        this.$forceUpdate()
        return
      }

      this.noteText = this.searchOn
        ? (this.searchSrc === 'deepseek' ? this.noteText + ' · ' + cost + 's' : '已联网检索 · ' + cost + 's')
        : (r.note || this.noteText)
      // 真流式：内容已经边收边显示，直接落库，不再走两段播放
      if (streamed) {
        this.pending = false
        this.finishAnswer(r.text, cost, r.reasoning || '', tok)
        return
      }
      this.pendingText = '已返回，正在显示…'
      this.$forceUpdate()
      try {
        this.reveal(r.text, cost, r.reasoning, tok)
      } catch (e2) {
        this.pending = false
        this.errText = '显示异常：' + (e2 && e2.message ? e2.message : String(e2)) + '（点「重试」重发）'
        this.$forceUpdate()
      }
    },
    // 错误后一键重发，不用重新打字
    async retryLast() {
      if (this.pending) return
      if (!this.lastAsk) {
        this.noteText = '没有可重试的提问，请先输入问题或选图发送'
        this.$forceUpdate()
        return
      }
      this.errText = ''
      this.pending = true
      this.elapsed = 0
      this._gotText = false
      this.tokLive = ''
      this.noteText = ''
      this.pendingText = '重试中…'
      this.startTick()
      this.$forceUpdate()
      // 重试沿用的就是 lastAsk，输入侧估算口径与首次发送一致
      this._tokIn = estReqTokens(this.lastAsk || [])
      var stopFlag = { v: false }
      this._stopFlag = stopFlag
      var t0 = Date.now()
      var r
      var retryStreamed = false
      var self3 = this
      try {
        if (this.conf.streamMode !== false) {
          r = await askStream(this.lastConf || this.conf, this.lastAsk, function (d) {
            if (d.think) self3.thinkLive = wrapText(d.think, MAX_EM)
            if (d.text) self3._gotText = true
            self3._liveTok = estTokens((d.text || '') + (d.think || ''))
            self3.tokLive = '本轮已生成 ≈' + self3.fmtTok(self3._liveTok) + ' tok · 输入约 ' + self3.fmtTok(self3._tokIn) + ' tok'
            self3.setLive(d.text)
            self3.pendingText = d.text ? '正在回答…' : '深度思考中…'
            self3.$forceUpdate()
          }, stopFlag)
          retryStreamed = !!(r && r.stream)
          if (r && (r.noStream || r.tooBig || (!r.ok && !r.stopped && !r.reasoningOnly))) r = await chatAsk(this.lastConf || this.conf, this.lastAsk)
        } else {
          r = await chatAsk(this.lastConf || this.conf, this.lastAsk)
        }
      } catch (e) {
        this.stopTick()
        this.pending = false
        this.errText = '重试异常：' + (e && e.message ? e.message : String(e)) + '（可再点一次重试）'
        this.$forceUpdate()
        return
      }
      var cost = ((Date.now() - t0) / 1000).toFixed(1)
      var usage = r && r.usage ? r.usage : null
      var tok = {
        i: usage && usage.prompt_tokens ? usage.prompt_tokens : (this._tokIn || 0),
        o: usage && usage.completion_tokens ? usage.completion_tokens : estTokens(((r && r.text) || '') + ((r && r.reasoning) || '')),
        est: usage ? 0 : 1
      }
      this.stopTick()

      // 用户点了「停止」：流式真杀 curl，整包请求则丢弃结果。
      // 已生成的部分内容落库保留，不算错误。
      if (stopFlag.v) {
        this.pending = false
        this.tokLive = ''
        if (r && r.ok && r.text) {
          this.finishAnswer(r.text, cost, r.reasoning || '', tok)
          this.noteText = '已终止生成，保留已生成的部分'
        } else {
          this.setLive('')
          this.thinkLive = ''
          this.noteText = '已终止生成'
        }
        this.$forceUpdate()
        return
      }
      if (!r || !r.ok) {
        this.pending = false
        this.errText = ((r && r.error) || '未知错误') + '（' + cost + 's）'
        this.$forceUpdate()
        return
      }
      this.noteText = r.note || this.noteText
      if (retryStreamed) {
        this.pending = false
        this.finishAnswer(r.text, cost, r.reasoning || '', tok)
        return
      }
      try {
        this.reveal(r.text, cost, r.reasoning, tok)
      } catch (e2) {
        this.pending = false
        this.errText = '显示异常：' + (e2 && e2.message ? e2.message : String(e2))
        this.$forceUpdate()
      }
    },
    startTick() {
      var self = this
      this.stopTick()
      this.tickTimer = setInterval(function () {
        self.elapsed = self.elapsed + 1
        var head = self.askIsImg ? '图片识别中' : (self.conf.thinkingMode === false ? '正在回答' : '深度思考中')
        var tail = self.elapsed >= 80 ? '（接近上限，可能要重试）' : (self.elapsed >= 40 ? '（服务端较慢，请稍等）' : '')
        // 有些模型（discovery 的 intern-s2 / Sage）关不掉思考，且思考会吃满预算，
        // 正文要等思考结束才出现。超过 20 秒还没见正文就说明这一点，免得被当成"没有流式"。
        if (!self._gotText && self.elapsed >= 20) tail = '（模型在长思考，正文要等思考结束才出现）'
        self.pendingText = head + ' ' + self.elapsed + 's' + tail
        self.$forceUpdate()
      }, 1000)
    },
    stopTick() {
      if (this.tickTimer) {
        clearInterval(this.tickTimer)
        this.tickTimer = null
      }
    },
    // token 数展示：千位以上缩写成 1.2k，省屏幕宽度
    fmtTok(n) {
      var v = Math.round(Number(n) || 0)
      if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      return String(v)
    },
    tokText(m) {
      var t = (m && m.tok) || {}
      // est=1 是本地估算（服务端没回 usage），给 ≈ 提醒用户这是近似值
      var a = t.est ? '≈' : ''
      var s = a + this.fmtTok(t.i) + ' 输入 / ' + a + this.fmtTok(t.o) + ' 输出 tokens'
      if (m.cost) s = '耗时 ' + m.cost + 's · ' + s
      return '本轮 ' + s
    },
    // 显示层：默认不做逐帧模拟，思考先出、正文整段落屏（typingAnim 可开回逐字动画）。
    reveal(full, cost, reasoning, tok) {
      var self = this
      this.pending = false
      if (this.revealTimer) clearTimeout(this.revealTimer)
      var rt = String(reasoning || '')
      // 设备 jsapi（http.request）只有整包返回，没有分块回调，
      // 无法做真正的 token 流式。默认不再用逐帧动画冒充流式：
      // 思考过程先落一块，400ms 后把正文整段显示。
      if (!this.conf || this.conf.typingAnim !== true) {
        if (rt) {
          this.thinkLive = wrapText(rt, MAX_EM)
          this.$forceUpdate()
          this.revealTimer = setTimeout(function () { self.finishAnswer(full, cost, rt, tok) }, 400)
        } else {
          this.finishAnswer(full, cost, '', tok)
        }
        return
      }
      var phases = []
      if (rt) phases.push({ text: rt, ticks: 36, ms: 24, isThink: true })
      phases.push({ text: full, ticks: 80, ms: 32, isThink: false })
      var pi = 0
      var i = 0

      function tick() {
        var ph = phases[pi]
        var n = ph.text.length
        var step = Math.max(2, Math.ceil(n / ph.ticks))
        i = i + step
        if (i > n) i = n
        var shown = ph.text.slice(0, i)
        if (ph.isThink) self.thinkLive = wrapText(shown, MAX_EM)
        else self.setLive(shown)
        self.$forceUpdate()
        if (i < n) {
          self.revealTimer = setTimeout(tick, ph.ms)
        } else {
          pi++
          i = 0
          if (pi < phases.length) {
            self.revealTimer = setTimeout(tick, 60)
          } else {
            self.finishAnswer(full, cost, rt, tok)
          }
        }
      }
      tick()
    },
    finishAnswer(full, cost, reasoning, tok) {
      // 只有模型真的按练习模式停在结果前（末行有「答案先不给」）才挂「看答案」按钮，
      // 否则寒暄、常识问答也会长出这个按钮，点了反而莫名其妙
      var studyOk = this._studyAsk === true && String(full || '').indexOf('答案先不给') >= 0
      var msg = { role: 'assistant', content: full, ts: Date.now(), cost: cost, reasoning: reasoning || '', study: studyOk }
      // 本轮 token 消耗：服务端 usage 优先（est=0 精确），否则本地估算（est=1）
      if (tok && (tok.i > 0 || tok.o > 0)) msg.tok = tok
      this.session.messages.push(msg)
      this._studyAsk = false
      this.tokLive = ''
      this.setLive('')
      this.thinkLive = ''
      this.rebuildView()
      // 正文落屏：最新一条在最上方，给它做一次入场；装饰动效同时收掉
      this.playEnter([0])
      this.stopDeco()
      // 追问建议：按问题与回答里的关键词本地挑三条，不发请求
      var q = ''
      var ms = this.session.messages
      for (var i = ms.length - 1; i >= 0; i--) {
        if (ms[i] && ms[i].role === 'user') { q = this.toText(ms[i].content); break }
      }
      this.followList = suggestions(q, full)
      this.revealTimer = null
      this.$forceUpdate()
      saveSession(this.session)
    },
    // 点追问短语：直接当下一问发出去，不用再打字
    askChip(s) {
      if (this.pending) return
      this.draft = String(s || '')
      this.$forceUpdate()
      this.onSend()
    },
    // 做题模式下点「看答案」：本次请求解除限制，要完整解答
    askAnswer() {
      if (this.pending) return
      this.forceAnswer = true
      this.draft = '请给出完整答案和最终结果，并说明每一步的依据。'
      this.$forceUpdate()
      this.onSend()
    }
  }
}
</script>
