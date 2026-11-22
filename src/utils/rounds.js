// 会话「轮」操作：一条消息 → 它所属的提问 → 这一轮的结尾下标。
// 删除单轮、重答、编辑重问共用同一套边界规则，避免三个入口各写一份下标计算
// （写错就会出现「删了回答留下问题」这种半截状态）。
//
// 轮的定义：一条 user 消息 + 紧随其后、直到下一条 user 消息之前的全部 assistant 消息。
// 一条 user 消息后面没有回答（请求失败/被终止）也算一轮。

export function userIndexOf(messages, idx) {
  if (!messages || idx === undefined || idx === null || idx < 0 || idx >= messages.length) return -1
  if (messages[idx] && messages[idx].role === 'user') return idx
  for (var i = idx; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') return i
  }
  return -1
}

export function roundEnd(messages, u) {
  if (!messages || u < 0) return -1
  for (var i = u + 1; i < messages.length; i++) {
    if (messages[i] && messages[i].role === 'user') return i
  }
  return messages.length
}

// 就地删除整轮，返回 { at, msgs } 供撤销；找不到提问时返回 null
export function removeRound(messages, idx) {
  var u = userIndexOf(messages, idx)
  if (u < 0) return null
  var end = roundEnd(messages, u)
  var removed = messages.splice(u, end - u)
  return { at: u, msgs: removed }
}

// 保留提问、清掉它后面的全部消息（重答/编辑重问用），返回删掉的条数
export function truncateAfter(messages, u) {
  if (!messages || u < 0 || u >= messages.length) return 0
  var n = messages.length - (u + 1)
  if (n > 0) messages.splice(u + 1, n)
  return n
}

// 撤回删除：把 removeRound 的返回值插回原位置
export function restoreRound(messages, buf) {
  if (!buf || !buf.msgs || !buf.msgs.length) return 0
  var at = buf.at
  if (at < 0) at = 0
  if (at > messages.length) at = messages.length
  for (var i = 0; i < buf.msgs.length; i++) {
    messages.splice(at + i, 0, buf.msgs[i])
  }
  return buf.msgs.length
}

// 带图提问不能直接编辑（图片是二进制引用，编辑后无从恢复），单独判出来
export function hasImages(content) {
  if (!content || typeof content !== 'object' || !content.length) return false
  for (var i = 0; i < content.length; i++) {
    if (content[i] && content[i].type === 'image_url') return true
  }
  return false
}
