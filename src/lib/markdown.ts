import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { HIGHLIGHT_NAMES } from '../../electron/shared/highlight'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fall through
      }
    }
    const escaped = md.utils.escapeHtml(str)
    return `<pre class="hljs"><code>${escaped}</code></pre>`
  }
})

// 不启用 label：labelAfter 会把整行源码原文（含 ==标记== 语法）渲染成文字，
// 且其 children.pop() hack 会弹掉行尾嵌套语法（==标记== / *斜体* / `代码`）的闭合 token，
// 导致 <mark> 等未闭合。enabled 只生成 checkbox，任务勾选功能不受影响。
md.use(taskLists, { enabled: true })

// —— 高亮标记 `==颜色:文本==` / `==文本==`（自定义 inline 规则，仿 markdown-it-mark）——
// 颜色名来自 HIGHLIGHT_COLORS 白名单 → `<mark class="hl-x">`；无前缀/未知前缀 → 默认 `<mark>`

const EQUALS = 0x3d // '='

/**
 * markdown-it StateInline 的子集（@types/markdown-it 未导出该类型），
 * 只包含本规则用到的成员。
 */
interface InlineStateLike {
  pos: number
  posMax: number
  src: string
  push(type: string, tag: string, nesting: number): InlineTokenLike
  md: {
    utils: { isWhiteSpace(code: number): boolean }
    inline: { parse(src: string, md: unknown, env: unknown, outTokens: unknown[]): void }
  }
  env: unknown
}

/** markdown-it Token 的子集，本规则只用到 attrPush / content / children */
interface InlineTokenLike {
  attrPush(attr: [string, string]): void
  content: string
  children: unknown[]
}

function parseHighlightColor(content: string): string | null {
  const m = content.match(/^([a-z]+):/)
  if (!m || !HIGHLIGHT_NAMES.includes(m[1])) return null
  return m[1]
}

function highlightTokenizer(state: InlineStateLike, silent: boolean): boolean {
  if (silent) return false

  const start = state.pos
  if (state.src.charCodeAt(start) !== EQUALS) return false
  if (start + 1 >= state.posMax || state.src.charCodeAt(start + 1) !== EQUALS) return false

  // `==` 后必须紧贴非空白字符（`a == b` 不算标记）
  const next = state.src.charCodeAt(start + 2)
  if (next === EQUALS || state.md.utils.isWhiteSpace(next)) return false

  const close = state.src.indexOf('==', start + 2)
  if (close === -1) return false

  // 闭合 `==` 前不能是空白，且内容非空
  const prev = state.src.charCodeAt(close - 1)
  if (prev === EQUALS || state.md.utils.isWhiteSpace(prev)) return false
  const content = state.src.slice(start + 2, close)
  if (!content) return false

  const color = parseHighlightColor(content)
  const tokenOpen = state.push('mark_open', 'mark', 1)
  if (color) tokenOpen.attrPush(['class', `hl-${color}`])
  // 内容递归走 inline 解析（粗体/斜体/代码等可嵌套在标记内）。
  // 外层闭合取第一个 `==`，内容永不含 `==`，不会无限递归。
  const inner = color ? content.slice(color.length + 1) : content
  const tokenInline = state.push('inline', '', 0)
  tokenInline.content = inner
  tokenInline.children = []
  state.md.inline.parse(inner, state.md, state.env, tokenInline.children)
  state.push('mark_close', 'mark', -1)

  state.pos = close + 2
  return true
}

md.inline.ruler.before('emphasis', 'highlight', highlightTokenizer)

// `inline` token（高亮标记的嵌套内容容器）渲染 children；children 为空时兜底
// 输出转义后的 content，避免落到 renderToken 的默认分支输出空标签 `<>`。
// 仅影响标记内容这类行内级 inline token，块级 inline token 由 renderer.render 特判处理。
md.renderer.rules.inline = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  if (token.children && token.children.length) {
    return self.renderInline(token.children, options, env)
  }
  return token.content ? md.utils.escapeHtml(token.content) : ''
}

// Open links in external browser via target + rel; main process also intercepts
const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const aIndex = token.attrIndex('target')
  if (aIndex < 0) {
    token.attrPush(['target', '_blank'])
  } else if (token.attrs) {
    token.attrs[aIndex][1] = '_blank'
  }
  token.attrPush(['rel', 'noopener noreferrer'])
  return defaultRender(tokens, idx, options, env, self)
}

export function renderMarkdown(source: string): string {
  const tokens = md.parse(source || '', {})
  // 给块级元素注入源码行号区间（data-line="start-end"），
  // 供预览模式把 DOM 选区映射回源码位置
  for (const token of tokens) {
    if (token.map && token.nesting > 0) {
      token.attrPush(['data-line', `${token.map[0]}-${token.map[1]}`])
    }
  }
  return md.renderer.render(tokens, md.options, {})
}
