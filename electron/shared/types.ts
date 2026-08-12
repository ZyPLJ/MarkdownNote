import { stripHighlightMarkup } from './highlight'

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'gray'

export type NoteMode = 'preview' | 'edit'

export interface NoteBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Note {
  id: string
  title: string
  content: string
  color: NoteColor
  opacity: number
  alwaysOnTop: boolean
  mode: NoteMode
  bounds: NoteBounds
  createdAt: string
  updatedAt: string
  visible: boolean
  deleted?: boolean
}

export interface AppSettings {
  globalHotkey: string
  defaultColor: NoteColor
  defaultOpacity: number
  closeBehavior: 'hide'
}

export interface AppData {
  version: number
  settings: AppSettings
  notes: Note[]
}

export interface NotePatch {
  title?: string
  content?: string
  color?: NoteColor
  opacity?: number
  alwaysOnTop?: boolean
  mode?: NoteMode
  bounds?: Partial<NoteBounds>
  visible?: boolean
  deleted?: boolean
}

/** 自动更新状态（主进程 → 渲染层，通道 app:update-status） */
export type UpdateStatusInfo =
  | { status: 'checking' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

/** Lightweight row for history panel list */
export interface NoteSummary {
  id: string
  title: string
  snippet: string
  color: NoteColor
  updatedAt: string
  createdAt: string
  visible: boolean
  deleted: boolean
}

export const NOTE_COLORS: NoteColor[] = [
  'yellow',
  'pink',
  'blue',
  'green',
  'purple',
  'gray'
]

export const DEFAULT_BOUNDS: NoteBounds = {
  x: 120,
  y: 120,
  width: 340,
  height: 300
}

export const DEFAULT_SETTINGS: AppSettings = {
  globalHotkey: 'CommandOrControl+Alt+N',
  defaultColor: 'yellow',
  defaultOpacity: 0.95,
  closeBehavior: 'hide'
}

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    notes: []
  }
}

export function deriveTitle(content: string): string {
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      return stripHighlightMarkup(heading[1]).trim().slice(0, 40)
    }
    const text = stripHighlightMarkup(line.trim())
    if (text) {
      return text.replace(/^[#>*\-\d.\s\[\]xX]+/, '').trim().slice(0, 20) || '未命名便签'
    }
  }
  return '未命名便签'
}

/** First non-title line, stripped of light markdown — for list previews */
export function deriveSnippet(content: string, max = 72): string {
  const lines = content.split(/\r?\n/)
  let skippedTitle = false
  for (const line of lines) {
    const raw = line.trim()
    if (!raw) continue
    if (!skippedTitle) {
      skippedTitle = true
      continue
    }
    const cleaned = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~#>|]/g, '')
      .replace(/^\s*[-*+]\s+(\[[ xX]\])?\s*/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .trim()
    if (cleaned) return cleaned.slice(0, max)
  }
  // Fall back: body of the title line itself if only one line of content
  const only = lines.map((l) => l.trim()).find(Boolean) || ''
  const cleanedOnly = only
    .replace(/^#{1,6}\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
  return cleanedOnly.slice(0, max)
}
