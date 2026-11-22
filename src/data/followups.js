// 追问建议：本地规则生成，不发请求、不耗额度。
// 只按问题里的关键词挑一组短语，长度控制在 6 个汉字以内，保证一行放得下三个。

function hit(t, arr) {
  for (var i = 0; i < arr.length; i++) {
    if (t.indexOf(arr[i]) >= 0) return true
  }
  return false
}

var LANG = ['翻译', '英语', '单词', '语法', '句子', '作文', '阅读', '古诗', '文言', '词性', '短语']
var SCI = ['化学', '反应', '方程式', '物理', '受力', '电路', '加速度', '溶液', '元素', '离子', '实验', '浓度', '摩尔']
var MATH = ['方程', '函数', '求解', '计算', '证明', '多少', '几何', '三角', '概率', '向量', '导数', '不等式', '面积', '体积', '化简', '求值']

export function suggestions(q, a) {
  var t = String(q || '')
  var ans = String(a || '')
  var src = t + ' ' + ans.slice(0, 200)

  if (hit(src, LANG)) return ['再举两个例句', '还有别的意思吗', '帮我分析语法']
  if (hit(src, SCI)) return ['为什么这样反应', '换个说法解释', '举个生活例子']
  if (hit(src, MATH)) return ['再讲一遍思路', '换一种解法', '给我同类题']
  return ['再详细讲讲', '举个例子说明', '给我一道练习']
}
