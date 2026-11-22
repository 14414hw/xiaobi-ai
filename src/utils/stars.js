// 收藏（错题本）：独立于会话文件，点「新对话」或清空历史都不会影响这里。
// 存 /userdisk/penair/stars.json，上限 200 条，超出丢弃最旧的。
import fs from 'fs'

var DIR = '/userdisk/penai'
var FILE = DIR + '/stars.json'
var MAX = 200

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

export function stamp(ts) {
  var d = new Date(ts || Date.now())
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

export async function loadStars() {
  try {
    var txt = await fs.readFile(FILE)
    if (!txt) return []
    var arr = typeof txt === 'string' ? JSON.parse(txt) : txt
    if (Object.prototype.toString.call(arr) !== '[object Array]') return []
    return arr
  } catch (e) {
    return []
  }
}

async function saveStars(list) {
  try {
    try { await fs.mkdir(DIR) } catch (e0) {}
    await fs.writeFile(FILE, JSON.stringify(list))
    return true
  } catch (e) {
    return false
  }
}

export async function addStar(item) {
  var list = await loadStars()
  var ts = item.ts || Date.now()
  var id = String(ts)
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return { ok: true, dup: true, count: list.length }
  }
  list.unshift({
    id: id,
    ts: ts,
    q: String(item.q || ''),
    a: String(item.a || ''),
    model: String(item.model || '')
  })
  if (list.length > MAX) list = list.slice(0, MAX)
  var ok = await saveStars(list)
  return { ok: ok, dup: false, count: list.length }
}

export async function delStar(id) {
  var list = await loadStars()
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].id !== id) out.push(list[i])
  }
  await saveStars(out)
  return out.length
}

export async function clearStars() {
  await saveStars([])
  return true
}

// 导出为纯文本，文件名用 ASCII，避免 /userdisk 若是 vfat 时的中文编码问题
export async function exportStars() {
  var list = await loadStars()
  if (!list.length) return ''
  var d = new Date()
  var name = 'stars_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
    '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.txt'
  var path = DIR + '/' + name
  var out = []
  out.push('小笔 AI 收藏夹')
  out.push('导出时间：' + stamp(d.getTime()) + '　共 ' + list.length + ' 条')
  out.push('')
  for (var i = 0; i < list.length; i++) {
    var it = list[i]
    out.push('────────────────────────')
    out.push('[' + (i + 1) + '] ' + stamp(it.ts))
    if (it.q) out.push('问：' + it.q)
    out.push('答：')
    out.push(it.a || '')
    out.push('')
  }
  try {
    try { await fs.mkdir(DIR) } catch (e0) {}
    await fs.writeFile(path, out.join('\n'))
    return path
  } catch (e) {
    return ''
  }
}
