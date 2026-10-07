/**
 * 轻量 Markdown -> HTML 渲染器（零依赖）。
 *
 * 设计目标：
 * 1. 安全优先：先把原文完整转义为 HTML 实体，再拼接标签，渲染结果中不可能出现
 *    来自消息内容的原生 HTML，因此可直接配合 v-html 使用（无 XSS 风险）。
 * 2. 支持流式输出：未闭合的代码围栏、未成对的 ** 等都不会抛错，只是按原文展示，
 *    等后续内容到达后自然渲染正确。
 *
 * 支持的语法：标题、段落、粗体/斜体/删除线、行内代码、代码块（带语言标记）、
 * 有序/无序列表（含嵌套）、引用、分割线、链接/图片、表格、换行。
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch])
}

/** 只允许 http(s)、mailto、相对路径等安全协议，拦截 javascript: 之类的注入 */
function isSafeUrl(url: string): boolean {
  const value = url.trim().toLowerCase()
  if (!value) return false
  if (value.startsWith('#')) return true
  return /^(https?:|mailto:|tel:|\/|\.\/|\.\.\/)/.test(value)
}

/** 占位符（转义后不会由用户内容产生，行内解析结束前还原） */
const PH = '\u0000'

/** 行内语法：代码、图片、链接、粗斜体、删除线、裸链接 */
function inline(src: string): string {
  const slots: string[] = []
  const hold = (html: string) => {
    slots.push(html)
    return PH + (slots.length - 1) + PH
  }

  let text = escapeHtml(src)

  // 行内代码（内部不再做任何行内解析）
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => hold('<code>' + code + '</code>'))

  // 图片
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, url) =>
    isSafeUrl(url) ? hold('<img src="' + url + '" alt="' + alt + '" />') : m,
  )

  // 链接
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, label, url) =>
    isSafeUrl(url)
      ? hold('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>')
      : m,
  )

  // 粗体 / 斜体 / 删除线
  text = text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?![A-Za-z0-9])/g, '$1<em>$2</em>')

  // 裸链接自动识别
  text = text.replace(
    /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?])/g,
    (_m, prev: string, url: string) => {
      const href = url.startsWith('www.') ? 'https://' + url : url
      return prev + hold('<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + url + '</a>')
    },
  )

  return text.replace(new RegExp(PH + '(\\d+)' + PH, 'g'), (_m, idx: string) => slots[Number(idx)])
}

interface ListEntry {
  indent: number
  ordered: boolean
  lines: string[]
  children: ListEntry[]
}

interface ListParseResult {
  nodes: ListEntry[]
  next: number
}

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^`~]*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE_RE = /^\s*>\s?/
const LIST_RE = /^(\s*)(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/

const indentOf = (line: string) => line.replace(/\t/g, '  ').length - line.replace(/\t/g, '  ').trimStart().length

/** 是否是代码围栏的结束行（去掉首尾空白后全是同一种标记字符） */
function isFenceClose(line: string, marker: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3) return false
  return trimmed.split('').every((ch) => ch === marker)
}

/** 列表：先按行收集，再按缩进组合成树，支持嵌套 */
function parseListEntries(lines: string[], start: number): ListParseResult {
  const entries: ListEntry[] = []
  let i = start

  while (i < lines.length) {
    const match = LIST_RE.exec(lines[i])
    if (!match) break
    const indent = indentOf(lines[i])
    const entry: ListEntry = {
      indent,
      ordered: match[3] !== undefined,
      lines: [match[4]],
      children: [],
    }
    i += 1

    // 收集该项的续行：缩进更深的普通行算续行；同级/更浅的列表项或段落则结束
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        const nextLine = lines[i + 1] ?? ''
        const nextMatch = LIST_RE.exec(nextLine)
        const nextIndent = nextLine ? indentOf(nextLine) : 0
        if (!nextMatch && nextIndent === 0) break
        if (nextMatch && nextIndent <= indent) break
        entry.lines.push('')
        i += 1
        continue
      }
      if (LIST_RE.test(line)) break
      if (indentOf(line) > indent) {
        entry.lines.push(line.trimStart())
        i += 1
        continue
      }
      break
    }

    entries.push(entry)
  }

  return { nodes: entries, next: i }
}

function buildListTree(entries: ListEntry[], start: number, baseIndent: number): ListParseResult {
  const nodes: ListEntry[] = []
  let i = start

  while (i < entries.length) {
    const entry = entries[i]
    if (entry.indent < baseIndent) break
    if (entry.indent > baseIndent) {
      const nested = buildListTree(entries, i, entry.indent)
      if (nodes.length) {
        nodes[nodes.length - 1].children = nested.nodes
      } else {
        nodes.push(...nested.nodes)
      }
      i = nested.next
      continue
    }
    nodes.push(entry)
    i += 1
  }

  return { nodes, next: i }
}

function renderList(nodes: ListEntry[]): string {
  const tag = nodes[0] && nodes[0].ordered ? 'ol' : 'ul'
  const body = nodes
    .map((node) => {
      const text = node.lines.length ? inline(node.lines.join('\n')).replace(/\n/g, '<br>') : ''
      const children = node.children.length ? renderList(node.children) : ''
      return '<li>' + text + children + '</li>'
    })
    .join('')
  return '<' + tag + '>' + body + '</' + tag + '>'
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderTable(header: string[], align: string[], rows: string[][]): string {
  const alignAttr = (idx: number) => (align[idx] ? ' style="text-align:' + align[idx] + '"' : '')
  const head = header
    .map((cell, idx) => '<th' + alignAttr(idx) + '>' + inline(cell) + '</th>')
    .join('')
  const body = rows
    .map(
      (row) =>
        '<tr>' +
        header.map((_c, idx) => '<td' + alignAttr(idx) + '>' + inline(row[idx] ?? '') + '</td>').join('') +
        '</tr>',
    )
    .join('')
  return '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>'
}

function parseBlocks(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let i = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push('<p>' + inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>')
    paragraph = []
  }

  while (i < lines.length) {
    const line = lines[i]

    // 空行：结束当前段落
    if (!line.trim()) {
      flushParagraph()
      i += 1
      continue
    }

    // 代码块（含未闭合的流式输出）
    const fence = FENCE_RE.exec(line)
    if (fence) {
      flushParagraph()
      const marker = fence[2][0]
      const lang = fence[3].trim().split(/\s+/)[0] ?? ''
      const body: string[] = []
      i += 1
      while (i < lines.length && !isFenceClose(lines[i], marker)) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : ''
      out.push('<pre><code' + cls + '>' + escapeHtml(body.join('\n')) + '</code></pre>')
      continue
    }

    // 标题
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      out.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>')
      i += 1
      continue
    }

    // 分割线
    if (HR_RE.test(line)) {
      flushParagraph()
      out.push('<hr />')
      i += 1
      continue
    }

    // 引用（内部递归解析）
    if (QUOTE_RE.test(line)) {
      flushParagraph()
      const body: string[] = []
      while (
        i < lines.length &&
        lines[i].trim() &&
        (QUOTE_RE.test(lines[i]) || !FENCE_RE.test(lines[i]))
      ) {
        body.push(lines[i].replace(QUOTE_RE, ''))
        i += 1
      }
      out.push('<blockquote>' + parseBlocks(body.join('\n')) + '</blockquote>')
      continue
    }

    // 表格：表头行 + 分隔行
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushParagraph()
      const header = splitTableRow(line)
      const align = splitTableRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(':')
        const right = cell.endsWith(':')
        if (left && right) return 'center'
        if (right) return 'right'
        if (left) return 'left'
        return ''
      })
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      out.push(renderTable(header, align, rows))
      continue
    }

    // 列表
    if (LIST_RE.test(line)) {
      flushParagraph()
      const entries = parseListEntries(lines, i)
      const tree = buildListTree(entries.nodes, 0, entries.nodes[0].indent)
      out.push(renderList(tree.nodes))
      i = entries.next
      continue
    }

    // 普通段落
    paragraph.push(line)
    i += 1
  }

  flushParagraph()
  return out.join('\n')
}

/** 把 markdown 文本渲染为安全的 HTML 字符串 */
export function renderMarkdown(raw: string): string {
  const src = (raw ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  if (!src.trim()) return ''
  return parseBlocks(src)
}
