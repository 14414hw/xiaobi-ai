<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; background-color: #0f1016;">
    <div style="display: flex; flex-direction: row; align-items: center; padding-left: 12px; padding-right: 12px; padding-top: 8px; padding-bottom: 8px; background-color: #1b1d27;">
      <text style="font-size: 22px; color: #ffffff;">设置</text>
      <text v-if="release" style="font-size: 14px; color: #6ee7a8; background-color: #1e3327; padding-left: 8px; padding-right: 8px; padding-top: 3px; padding-bottom: 3px; border-radius: 5px; margin-left: 10px;">发行版 v{{ appVersion }}</text>
    </div>

    <scroller style="flex: 1;" scroll-direction="vertical">
      <div style="padding-top: 8px; padding-bottom: 8px; padding-left: 8px; padding-right: 8px;">
        <text style="font-size: 16px; color: #7c869c; padding-bottom: 6px;">接口</text>
        <text v-if="release" style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 6px;">发行版不预设任何接口地址与密钥：接口地址、API 密钥、模型全部需要你手工填写（从你的服务商控制台获取）。</text>

        <div v-for="(it, i) in baseItems" :key="'b' + i" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="edit(it.key, it.title)">
          <text style="font-size: 19px; color: #c8cfdd;">{{ it.label }}</text>
          <text style="font-size: 18px; color: #6ea8ff;">{{ display(it) }}</text>
        </div>

        <text v-if="presets.length" style="font-size: 16px; color: #7c869c; padding-top: 10px; padding-bottom: 6px;">快捷预设</text>
        <div v-if="presets.length" style="display: flex; flex-direction: row; flex-wrap: wrap;">
          <text v-for="(p, i) in presets" :key="'p' + i" @click="applyPreset(p)" style="font-size: 18px; color: #ffffff; background-color: #2a2f40; padding-left: 10px; padding-right: 10px; padding-top: 6px; padding-bottom: 6px; margin-right: 6px; margin-bottom: 6px; border-radius: 5px;">{{ p.label }}</text>
        </div>

        <text style="font-size: 16px; color: #7c869c; padding-top: 10px; padding-bottom: 6px;">模型参数（点数值可修改）</text>

        <div v-for="(it, i) in modelItems" :key="'m' + i" style="background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;">
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between;" @click="edit(it.key, it.title)">
            <text style="font-size: 19px; color: #c8cfdd;">{{ it.label }}</text>
            <text style="font-size: 18px; color: #6ea8ff;">{{ conf[it.key] }}{{ it.unit }}</text>
          </div>
          <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-top: 4px;">{{ it.hint }}</text>
        </div>

        <div v-if="!release" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleRoute">
          <text style="font-size: 19px; color: #c8cfdd;">智能选路（快）</text>
          <text :style="routeStyle">{{ conf.smartRoute === false ? '已关' : '已开' }}</text>
        </div>

        <div v-if="!release || searchOk" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleSearch">
          <text style="font-size: 19px; color: #c8cfdd;">联网搜索（自动）</text>
          <text :style="searchStyle">{{ conf.webSearch ? '自动' : '已关' }}</text>
        </div>
        <text v-if="release && !searchOk" style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">当前接口不支持联网搜索（仅 DeepSeek 官方端点、阿里云百炼 qwen 系列支持），此项不可开启。换支持的服务商后此处会自动放开。</text>
        <text v-if="!release || searchOk" style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">含义：问到新闻、天气、股价、比分这类实时信息时，先检索回网页摘要（约 0.5 秒），再让当前选中的模型带着摘要作答。检索不通时自动跳过，普通题目不检索，仍走 1~3 秒的快通道。</text>

        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleThinking">
          <text style="font-size: 19px; color: #c8cfdd;">深度思考（解题更准）</text>
          <text :style="thinkModeStyle">{{ conf.thinkingMode === false ? '已关' : '已开' }}</text>
        </div>

        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleTyping">
          <text style="font-size: 19px; color: #c8cfdd;">逐字显示动画（非流式）</text>
          <text :style="typingStyle">{{ conf.typingAnim === true ? '已开' : '已关' }}</text>
        </div>
        <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">含义：设备接口只返回整段结果，没有真正的分块流式通道。开启后把整段答案按帧逐字显示，属于动画效果；关闭则思考过程先出、正文整段显示（默认关闭，避免用动画冒充流式）。</text>

        <!-- 动效等级：客户反馈界面"死板"，给三档手动选择。
             流畅档按屏幕真实刷新率出帧，代价是更耗电；关闭档一个动画定时器都不建。 -->
        <div style="background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;">
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between;">
            <text style="font-size: 19px; color: #c8cfdd;">界面动效</text>
            <text style="font-size: 15px; color: #7c869c;">屏幕 {{ hzText }}</text>
          </div>
          <div style="display: flex; flex-direction: row; flex-wrap: wrap; padding-top: 7px;">
            <text v-for="(a, i) in animList" :key="'a' + i" @click="setAnim(a.v)" :style="animChipStyle(a.v)">{{ a.label }}</text>
          </div>
          <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-top: 5px;">{{ animHint }}</text>
        </div>

        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleShowThink">
          <text style="font-size: 19px; color: #c8cfdd;">展示思考过程</text>
          <text :style="thinkStyle">{{ conf.showThink === false ? '已关' : '已开' }}</text>
        </div>
        <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">含义：关闭后回答上方不再显示灰色的「思考过程」块，只保留当前状态（思考中/回答中）和本轮 token 统计。不影响「深度思考」开关本身，模型照常思考，只是不把过程显示出来。思考与不思考的模型都适用。</text>

        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleStudy">
          <text style="font-size: 19px; color: #c8cfdd;">先讲思路，后给答案</text>
          <text :style="studyStyle">{{ conf.studyMode === true ? '已开' : '已关' }}</text>
        </div>
        <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">含义：开启后 AI 只讲解题思路和关键步骤，暂时不给最终答案，回答下方会出现「看答案」按钮，点一下再给完整答案。适合自己先想一遍再看解析。一步就能出结果的题（如 2+3、sin30°）无法隐藏结果，属于正常现象。</text>

        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;" @click="toggleKb">
          <text style="font-size: 19px; color: #c8cfdd;">输入方式</text>
          <text :style="kbStyle">{{ conf.kbMode === 'custom' ? '自研键盘' : '系统键盘' }}</text>
        </div>
        <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">含义：系统键盘用设备自带的输入法（词库与联想更全），输入完点「确认」整段回传；自研键盘是应用内嵌键盘，输入即插入光标处，且带理科符号页（数学/物理/化学专用符号）。默认系统键盘，点一下切换。</text>

        <text style="font-size: 16px; color: #7c869c; padding-top: 10px; padding-bottom: 4px;">模型（点选切换）</text>
        <text style="font-size: 13px; line-height: 18px; color: #6b7688; padding-bottom: 6px;">副标题格式：类型 · 上下文长度 · 价格（基点/百万 Token，输入/输出）。右上角标签是服务商：书生 / DeepSeek / 阿里云，选中后请求就打到对应家的端点。标「纯文本」的模型不能发图；Kimi-K3.1-Pro 只接受温度 1，选中后温度设置对它无效；Decision-4B 走 SystemOne 协议，OpenAI 兼容层调不通，故未列入。DeepSeek 官方按闲时价折算，高峰时段约翻倍。</text>

        <!-- 发行版核心流程：接口+密钥填好后，一键拉取该端点的模型列表。
             列表随配置落盘，下次进来直接显示，不用重新拉。 -->
        <div style="display: flex; flex-direction: row; align-items: center; padding-bottom: 6px;">
          <text @click="fetchModels" style="font-size: 17px; color: #0f1016; background-color: #6ea8ff; padding-left: 14px; padding-right: 14px; padding-top: 7px; padding-bottom: 7px; border-radius: 6px;">{{ fetching ? '拉取中…' : '从接口拉取模型列表' }}</text>
          <text v-if="remoteModels.length" style="font-size: 14px; color: #8b93a7; padding-left: 10px;">共 {{ remoteModels.length }} 个，点选即用</text>
        </div>
        <div v-if="remoteModels.length" style="display: flex; flex-direction: row; flex-wrap: wrap; padding-bottom: 6px;">
          <text v-for="(id, i) in remoteModels" :key="'rm' + i" @click="pickRemote(id)" :style="modelChipStyle(id)">{{ id }}</text>
        </div>
        <text style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 6px;">说明：拉取走的是 OpenAI 兼容 GET {baseUrl}/models。{{ release ? '发行版不提供预设模型表，模型全部从你自己接口的实际列表中点选。' : '上表是内置的常用模型（需要对应服务商密钥）；下面是当前接口实际提供的模型。' }}列表保存在本机配置里。</text>
        <div v-if="models.length" style="display: flex; flex-direction: row; flex-wrap: wrap; padding-top: 0;">
          <div v-for="(m, i) in models" :key="'mm' + i" @click="setModel(m.name)" :style="modelCardStyle(m.name)">
            <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between;">
              <text style="font-size: 17px; color: #ffffff;">{{ m.label }}</text>
              <text :style="provStyle(m.prov)">{{ provName(m.prov) }}</text>
            </div>
            <text style="font-size: 12px; line-height: 16px; color: #aab6cf; padding-top: 3px;">{{ m.meta }}</text>
          </div>
        </div>

        <text style="font-size: 16px; color: #7c869c; padding-top: 10px; padding-bottom: 6px;">接口还原</text>
        <div style="background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; margin-bottom: 6px; border-radius: 6px;">
          <text style="font-size: 13px; line-height: 18px; color: #7c869c;">误改了接口地址或密钥导致连不上？点下面一键还原出厂内置配置（模型也回到 Sage）。还原后记得点「保存」。</text>
        </div>
        <div style="display: flex; flex-direction: row; padding-bottom: 4px;">
          <text @click="resetApi" style="font-size: 17px; color: #ffb0b0; background-color: #3a2430; padding-left: 16px; padding-right: 16px; padding-top: 8px; padding-bottom: 8px; border-radius: 6px;">恢复默认接口与密钥</text>
        </div>

        <text style="font-size: 16px; color: #7c869c; padding-top: 10px; padding-bottom: 6px;">{{ release ? '补充提示词（可选）' : '系统提示词' }}</text>
        <div style="background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 10px; padding-right: 10px; border-radius: 6px; margin-bottom: 6px;" @click="edit('systemPrompt', release ? '补充提示词' : '系统提示词')">
          <text style="font-size: 18px; line-height: 19px; color: #aab3c5;">{{ promptShown }}</text>
        </div>
        <text v-if="release" style="font-size: 13px; line-height: 18px; color: #7c869c; padding-bottom: 8px;">输出规范已内置锁定：公式写法（纯文本、根号、分数）、化学结构式（@//smiles/ 行 + 分子式自检）与解答格式不受此处影响，也无法被改掉。这里只写你想额外补充的教学要求（如「多举例」「用表格对比」）。</text>

        <div style="display: flex; flex-direction: row; padding-top: 12px;">
          <text @click="test" style="flex: 1; font-size: 19px; color: #ffffff; background-color: #2a2f40; text-align: center; padding-top: 9px; padding-bottom: 9px; border-radius: 6px; margin-right: 6px;">测试连接</text>
          <text @click="save" style="flex: 1; font-size: 19px; color: #ffffff; background-color: #2a6df4; text-align: center; padding-top: 9px; padding-bottom: 9px; border-radius: 6px;">保存</text>
        </div>

        <text style="font-size: 18px; color: #8b93a7; padding-top: 10px;">{{ status }}</text>

        <!-- 发行版专属：用户条款与隐私协议（点标题展开/收起全文） -->
        <div v-if="release" style="background-color: #1a1c26; padding-top: 10px; padding-bottom: 10px; padding-left: 12px; padding-right: 12px; margin-top: 14px; border-radius: 6px;" @click="showTerms = !showTerms">
          <text style="font-size: 17px; color: #6ea8ff;">用户条款与隐私协议 {{ showTerms ? '（点此收起）' : '（点此展开全文）' }}</text>
        </div>
        <div v-if="release && showTerms" style="background-color: #1a1c26; padding-top: 6px; padding-bottom: 14px; padding-left: 12px; padding-right: 12px; border-radius: 6px;">
          <text v-for="(t, i) in termParas" :key="'tp' + i" style="font-size: 15px; line-height: 22px; color: #aab3c5; padding-bottom: 10px;">{{ t }}</text>
        </div>
        <text v-if="release" style="font-size: 13px; line-height: 18px; color: #6b7688; padding-top: 6px;">点击「保存」即表示你已阅读并同意上述条款。兼容性提示：本应用仅在 YDX7P OS4.9.9 上测试通过，不保证其他机型正常兼容。</text>

        <div style="height: 30px;"></div>
      </div>
    </scroller>
  </div>
</template>

<script>
import { loadConf, saveConf, DEFAULTS, MODELS, PRESETS, RELEASE, APP_VERSION } from '../../utils/store.js'
import { searchSupported } from '../../utils/api.js'
import { testConnection, listModels, PROVIDERS } from '../../utils/api.js'
import fs from 'fs'

export default {
  data() {
    return {
      conf: {},
      status: '',
      release: RELEASE,
      appVersion: APP_VERSION,
      // 从当前接口拉取到的模型 id 列表（随 conf.remoteModels 持久化）
      remoteModels: [],
      fetching: false,
      models: MODELS,
      presets: PRESETS,
      showTerms: false,
      termParas: [
        '【应用性质】本应用（小笔AI 发行版）是一款运行于 AI 词典笔设备上的学习辅助工具，通过用户自行配置的大模型接口提供题目讲解、知识问答等服务。本应用不内置任何模型服务，所有 AI 能力均来自用户自行填写并持有密钥的第三方接口。',
        '【AI 内容免责】AI 生成的回答由算法自动产生，可能存在错误、遗漏或表述不准。解答过程与最终答案仅供参考，请务必自行核对或请教教师。因依赖 AI 内容产生的学习损失，开发者不承担责任。',
        '【数据与隐私】1. 对话记录、配置参数、API 密钥仅保存在设备本机存储中（/userdisk/penair），开发者无法读取或获取。2. 当你发送提问时，提问文本（以及你主动附加的图片）会通过你填写的接口地址发送到你配置的模型服务商，受该服务商的隐私政策约束；请勿在提问中填写姓名、电话、住址等个人隐私信息。3. 联网搜索开启时，检索关键词会发送给你所配置接口对应的检索服务。4. 本应用不内置数据上传通道，不收集设备信息、位置信息或通讯录。',
        '【兼容性声明】本应用仅在 YDX7P（OS 4.9.9）设备上完成安装与功能测试；对其他机型、其他系统版本不保证能够正常安装或运行，由此产生的异常请自行评估风险。',
        '【知识产权】本应用界面与代码归开发者所有。你配置的模型服务、检索服务的相关权利归其各自权利人所有。',
        '【联系方式】开发者邮箱：HuaYuCastle@qq.com。使用中遇到问题、发现漏洞或对条款有疑问，可通过邮件联系。'
      ],
      hz: 0,
      animList: [
        { v: 0, label: '关闭' },
        { v: 1, label: '标准' },
        { v: 2, label: '流畅' }
      ],
      baseItems: [
        { key: 'baseUrl', label: '接口地址', title: '接口地址' },
        { key: 'apiKey', label: 'API 密钥', title: 'API 密钥' }
      ],
      modelItems: [
        {
          key: 'temperature', label: '温度', unit: '', title: '温度 0~2',
          hint: '含义：控制回答的随机性。支持 0 ~ 2（可填一位小数）。越低回答越严谨稳定，越高越发散有创意。推荐 0.6；纯解题建议 0.2 ~ 0.4；写作构思可到 0.9。'
        },
        {
          key: 'maxTokens', label: '最大长度', unit: ' tokens', title: '最大 token 数',
          hint: '含义：单次回答的字数上限（1 token 约等于 1~2 个汉字）。支持 0 或 100 ~ 8000，0 = 不限制。回答老是被截断就调大到 2000 ~ 4000；嫌回答慢可调小。推荐 0（不限制）。'
        },
        {
          key: 'historyRounds', label: '上下文轮数', unit: ' 轮', title: '上下文轮数 1~100',
          hint: '含义：AI 记住最近几轮问答，能联系前文继续聊。支持 1 ~ 100。越大越连贯，但每次请求更慢、更耗流量（60 轮以上明显变慢）。推荐 6；需长对话连贯可调 20~50；背单词等独立问答调 1。'
        }
      ]
    }
  },

  mounted() {
    var self = this
    loadConf().then(function (c) {
      self.conf = c
      self.remoteModels = Array.isArray(c.remoteModels) ? c.remoteModels : []
    })
    this.detectHz()
    $falcon.on('penai_kb', this.onKb)
    this._editKey = ''
  },

  destroyed() {
    $falcon.off('penai_kb', this.onKb)
  },

  // 模板里是 :style="routeStyle" 这种不带括号的绑定，必须放 computed。
  // 放在 methods 里 Vue 只会拿到函数引用、不会执行，导致"已开/已关"全部
  // 显示成同一个默认色，看不出状态（v1.9.4 修复）。
  computed: {
    routeStyle() {
      return {
        fontSize: '18px',
        color: this.conf.smartRoute === false ? '#ff8080' : '#6ee7a8',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    // 深度思考开关的状态色。以前这里和下面的「展示思考过程」重名，
    // 后一个定义把前一个覆盖了，两颗开关永远同色、看不出各自状态。
    thinkModeStyle() {
      return {
        fontSize: '18px',
        color: this.conf.thinkingMode === false ? '#ff8080' : '#6ee7a8',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    searchStyle() {
      return {
        fontSize: '18px',
        color: this.conf.webSearch ? '#6ee7a8' : '#ff8080',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    typingStyle() {
      return {
        fontSize: '18px',
        color: this.conf.typingAnim === true ? '#6ee7a8' : '#ff8080',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    thinkStyle() {
      return {
        fontSize: '18px',
        color: this.conf.showThink === false ? '#ff8080' : '#6ee7a8',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    studyStyle() {
      return {
        fontSize: '18px',
        color: this.conf.studyMode === true ? '#6ee7a8' : '#ff8080',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    kbStyle() {
      return {
        fontSize: '18px',
        color: this.conf.kbMode === 'custom' ? '#6ea8ff' : '#6ee7a8',
        transitionProperty: 'color',
        transitionDuration: '150ms'
      }
    },
    // 发行版：当前接口是否支持联网搜索（DeepSeek 官方 / 阿里云 qwen 系）
    searchOk() {
      return searchSupported(this.conf)
    },
    hzText() {
      return this.hz ? (this.hz + 'Hz') : '刷新率未知（按 60Hz 处理）'
    },
    animHint() {
      var v = parseInt(this.conf.animLevel, 10)
      if (v === 0) return '关闭：消息直接出现，状态只显示文字。最省电，适合只在意续航。'
      if (v === 2) return '流畅：消息渐入 260ms（按屏幕刷新率出帧）+ 状态旋转指示 + 进度扫描条。观感最顺，但更耗电；配合系统设置的「均衡」档效果更好。'
      return '标准：消息渐入 180ms（30 帧/秒）+ 状态呼吸点。比原来自然，耗电增加很少。'
    },
    // 提示词编辑框显示的内容。发行版 conf.systemPrompt 只承载补充要求，
    // 空时给出占位说明（发送时由 store.composePrompt 自动合成完整提示词）。
    promptShown() {
      var v = String(this.conf.systemPrompt || '').replace(/^\s+|\s+$/g, '')
      if (v) return v
      return this.release ? '（未设置补充要求，默认教学风格与内置规范已生效）' : ''
    }
  },

  methods: {
    display(it) {
      var v = this.conf[it.key]
      if (it.key === 'apiKey') {
        if (!v) return '点击填写'
        return v.length > 10 ? v.slice(0, 4) + '****' + v.slice(-4) : '****'
      }
      return v || '点击填写'
    },
    edit(key, title) {
      this._editKey = key
      var v = this.conf[key]
      // 数值与接口类参数走英文半角模式（避免全角标点损坏数字/URL）；提示词走中文全角
      var lang = (key === 'systemPrompt') ? 'cn' : 'en'
      $falcon.navTo('keyboard', { title: title, data: v === undefined || v === null ? '' : String(v), lang: lang })
    },
    onKb(e) {
      var key = this._editKey
      if (!key) return
      var val = e && e.data !== undefined ? e.data : ''
      if (key === 'temperature') {
        var f = parseFloat(val)
        this.conf[key] = isNaN(f) ? 0.6 : f
      } else if (key === 'maxTokens' || key === 'historyRounds') {
        var n = parseInt(val, 10)
        if (isNaN(n)) n = DEFAULTS[key]
        if (key === 'historyRounds') {
          if (n < 1) n = 1
          if (n > 100) n = 100
        }
        this.conf[key] = n
      } else {
        this.conf[key] = val
      }
      this.$forceUpdate()
    },
    setModel(name) {
      this.conf.model = name
      // 换模型顺手把端点和内置密钥对齐：否则选了 DeepSeek 却还留着书生的 baseUrl，
      // 关掉智能选路就必然 401/404。用户之后仍可手动改回自己的接口。
      var m = null
      for (var i = 0; i < MODELS.length; i++) if (MODELS[i].name === name) m = MODELS[i]
      var p = m && m.prov ? PROVIDERS[m.prov] : null
      if (p) {
        this.conf.baseUrl = p.baseUrl
        if (this.conf.keys && this.conf.keys[p.keyOf]) this.conf.apiKey = this.conf.keys[p.keyOf]
      }
      this.status = '模型已切到 ' + name + (p ? '（' + p.label + ' 端点）' : '') + '，记得点「保存」'
      this.$forceUpdate()
    },
    provName(p) {
      if (p === 'deepseek') return 'DeepSeek'
      if (p === 'aliyun') return '阿里云'
      return '书生'
    },
    // 带括号调用，放 methods 没问题（之前的坑是不带括号的 :style="fn"）
    provStyle(p) {
      var bg = '#232a3d'
      var fg = '#8fb4ff'
      if (p === 'deepseek') { bg = '#3a2a1e'; fg = '#ffb27a' }
      else if (p === 'aliyun') { bg = '#2c2340'; fg = '#c9a2ff' }
      return {
        fontSize: '11px',
        color: fg,
        backgroundColor: bg,
        paddingLeft: '6px',
        paddingRight: '6px',
        paddingTop: '2px',
        paddingBottom: '2px',
        borderRadius: '4px'
      }
    },
    modelChipStyle(name) {
      var on = this.conf.model === name
      return {
        fontSize: '16px',
        color: on ? '#ffffff' : '#c8cfdd',
        backgroundColor: on ? '#2a6df4' : '#2a2f40',
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingLeft: '12px',
        paddingRight: '12px',
        margin: '3px',
        borderRadius: '6px',
        transitionProperty: 'background-color',
        transitionDuration: '150ms'
      }
    },
    modelCardStyle(name) {
      var on = this.conf.model === name
      return {
        width: '448px',
        backgroundColor: on ? '#2a6df4' : '#1a1c26',
        paddingTop: '9px',
        paddingBottom: '9px',
        paddingLeft: '12px',
        paddingRight: '12px',
        margin: '3px',
        borderRadius: '8px',
        transitionProperty: 'background-color',
        transitionDuration: '150ms'
      }
    },
    resetApi() {
      this.conf.baseUrl = DEFAULTS.baseUrl
      this.conf.apiKey = ''
      this.conf.model = DEFAULTS.model
      this.conf.keys = JSON.parse(JSON.stringify(DEFAULTS.keys))
      this.status = this.release ? '已还原默认接口，密钥与模型请重新填写' : '已还原默认接口与内置密钥，记得点「保存」'
      this.$forceUpdate()
    },
    toggleRoute() {
      this.conf.smartRoute = this.conf.smartRoute === false
      this.$forceUpdate()
    },
    toggleThinking() {
      this.conf.thinkingMode = this.conf.thinkingMode === false
      this.$forceUpdate()
    },
    toggleSearch() {
      if (this.release && !this.searchOk) return
      this.conf.webSearch = !this.conf.webSearch
      this.$forceUpdate()
    },
    toggleTyping() {
      this.conf.typingAnim = this.conf.typingAnim !== true
      this.$forceUpdate()
    },
    toggleShowThink() {
      this.conf.showThink = this.conf.showThink === false
      this.$forceUpdate()
    },
    toggleStudy() {
      this.conf.studyMode = this.conf.studyMode !== true
      this.$forceUpdate()
    },
    toggleKb() {
      this.conf.kbMode = this.conf.kbMode === 'custom' ? 'system' : 'custom'
      this.$forceUpdate()
    },
    setAnim(v) {
      this.conf.animLevel = v
      this.status = '动效已设为' + (v === 0 ? '关闭' : (v === 2 ? '流畅' : '标准')) + '，记得点「保存」'
      this.$forceUpdate()
    },
    animChipStyle(v) {
      var cur = parseInt(this.conf.animLevel, 10)
      if (isNaN(cur)) cur = 1
      var on = cur === v
      return {
        fontSize: '17px',
        color: on ? '#0f1016' : '#c8cfdd',
        backgroundColor: on ? '#6ee7a8' : '#2a2f40',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '6px',
        paddingBottom: '6px',
        marginRight: '8px',
        marginBottom: '4px',
        borderRadius: '6px'
      }
    },
    // 屏幕刷新率从 DRM 的当前模式里取：本机是 280x936p60。
    // 读不到就留 0，界面显示「未知（按 60Hz 处理）」，不影响功能。
    async detectHz() {
      try {
        var txt = await fs.readFile('/sys/kernel/debug/dri/0/summary')
        var m = /Display mode:\s*\d+x\d+p(\d+)/.exec(String(txt || ''))
        if (m) {
          this.hz = parseInt(m[1], 10)
          this.$forceUpdate()
        }
      } catch (e) {}
    },
    applyPreset(p) {
      this.conf.baseUrl = p.baseUrl
      this.conf.model = p.model
      if (p.keyOf && this.conf.keys && this.conf.keys[p.keyOf]) {
        this.conf.apiKey = this.conf.keys[p.keyOf]
      }
      if (typeof p.thinking === 'boolean') this.conf.thinkingMode = p.thinking
      // 发行版内置密钥为空：预设只帮用户把接口地址/模型名配好，密钥必须自己填
      var hasKey = p.keyOf && this.conf.keys && this.conf.keys[p.keyOf]
      this.status = '已套用 ' + p.label + (hasKey ? '（密钥已配好）' : '，需手动填 API 密钥')
      this.$forceUpdate()
    },
    // 一键拉取当前接口的模型列表。成功后存进 conf.remoteModels，
    // 点「保存」后落盘，下次进设置页直接显示。
    async fetchModels() {
      if (this.fetching) return
      this.fetching = true
      this.status = '正在拉取模型列表…'
      this.$forceUpdate()
      var r = await listModels(this.conf)
      this.fetching = false
      if (r.ok && r.models.length) {
        this.remoteModels = r.models
        this.conf.remoteModels = r.models
        if (!this.conf.model) this.conf.model = r.models[0]
      }
      this.status = r.msg
      this.$forceUpdate()
    },
    // 远程模型点选：只改模型名。绝不碰 baseUrl/apiKey——那是用户自己配的接口，
    // 内置 MODELS 表里查不到它，任何「自动对齐端点」的逻辑都只会帮倒忙。
    pickRemote(id) {
      this.conf.model = id
      this.status = '模型已选 ' + id + '，记得点「保存」'
      this.$forceUpdate()
    },
    async test() {
      this.status = '测试中…'
      var r = await testConnection(this.conf)
      this.status = r.msg
    },
    async save() {
      var ok = await saveConf(this.conf)
      this.status = ok ? '已保存' : '保存失败'
      // 对话页在设置页打开期间保持存活、不会重新 mounted，必须主动通知它重读配置，
      // 否则切完模型回去继续提问，用的还是旧模型。
      if (ok) {
        try { $falcon.trigger('penai_conf_saved', {}) } catch (e) {}
      }
      this.$forceUpdate()
    }
  }
}
</script>
