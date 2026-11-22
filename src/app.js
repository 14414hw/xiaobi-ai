class App extends $falcon.App {
  constructor() {
    super()
  }
  onLaunch(options) {
    super.onLaunch(options)
  }
  onShow() {
    super.onShow()
    // 从系统「AI拍照」回来时靠这个把控制权交回页面（扫题取件）。
    // 首次冷启动也会走一次 onShow，页面那边用 SCAN_TS 判空挡掉。
    try { $falcon.trigger('penai_appshow', {}) } catch (e) {}
  }
  onHide() {
    super.onHide()
  }
  onDestroy() {
    super.onDestroy()
  }
}

try {
  globalThis['process'] = { env: { NODE_ENV: 'production' } }
} catch (err) {
  console.log(err)
}

export default App
