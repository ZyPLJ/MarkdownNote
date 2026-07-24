import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  AppData,
  DEFAULT_BOUNDS,
  DEFAULT_SETTINGS,
  Note,
  NotePatch,
  createEmptyAppData,
  deriveTitle
} from '../shared/types'

const DATA_FILE = 'notes.json'
const TMP_SUFFIX = '.tmp'

function dataPath(): string {
  return join(app.getPath('userData'), DATA_FILE)
}

function ensureDir(): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export class NoteStore {
  private data: AppData = createEmptyAppData()

  load(): AppData {
    ensureDir()
    const file = dataPath()
    if (!existsSync(file)) {
      this.data = createEmptyAppData()
      this.persist()
      return this.data
    }

    try {
      const raw = readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw) as AppData
      this.data = {
        version: parsed.version ?? 1,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        notes: Array.isArray(parsed.notes) ? parsed.notes : []
      }
    } catch {
      this.data = createEmptyAppData()
      this.persist()
    }
    return this.data
  }

  getData(): AppData {
    return this.data
  }

  getSettings() {
    return this.data.settings
  }

  getNote(id: string): Note | undefined {
    return this.data.notes.find((n) => n.id === id)
  }

  getAllNotes(): Note[] {
    return this.data.notes
  }

  getActiveNotes(): Note[] {
    return this.data.notes.filter((n) => !n.deleted)
  }

  createNote(partial?: Partial<Note>): Note {
    const now = new Date().toISOString()
    const offset = this.data.notes.length * 28
    const note: Note = {
      id: randomUUID(),
      title: '未命名便签',
      content: '# 新便签\n\n',
      color: this.data.settings.defaultColor,
      opacity: this.data.settings.defaultOpacity,
      alwaysOnTop: true,
      mode: 'preview',
      bounds: {
        x: DEFAULT_BOUNDS.x + offset,
        y: DEFAULT_BOUNDS.y + offset,
        width: DEFAULT_BOUNDS.width,
        height: DEFAULT_BOUNDS.height
      },
      createdAt: now,
      updatedAt: now,
      visible: true,
      ...partial
    }
    note.title = deriveTitle(note.content)
    this.data.notes.push(note)
    this.persist()
    return note
  }

  updateNote(id: string, patch: NotePatch): Note | undefined {
    const note = this.getNote(id)
    if (!note) return undefined

    if (patch.content !== undefined) {
      note.content = patch.content
      note.title = deriveTitle(patch.content)
    }
    if (patch.title !== undefined) note.title = patch.title
    if (patch.color !== undefined) note.color = patch.color
    if (patch.opacity !== undefined) note.opacity = patch.opacity
    if (patch.alwaysOnTop !== undefined) note.alwaysOnTop = patch.alwaysOnTop
    if (patch.mode !== undefined) note.mode = patch.mode
    if (patch.visible !== undefined) note.visible = patch.visible
    if (patch.bounds) {
      note.bounds = { ...note.bounds, ...patch.bounds }
    }
    note.updatedAt = new Date().toISOString()
    this.persist()
    return note
  }

  deleteNote(id: string): boolean {
    const note = this.getNote(id)
    if (!note) return false
    note.deleted = true
    note.visible = false
    note.updatedAt = new Date().toISOString()
    this.persist()
    return true
  }

  restoreNote(id: string): Note | undefined {
    const note = this.getNote(id)
    if (!note || !note.deleted) return undefined
    note.deleted = false
    note.visible = false
    note.updatedAt = new Date().toISOString()
    this.persist()
    return note
  }

  /** Permanently remove a soft-deleted note from the data file. */
  purgeNote(id: string): boolean {
    const idx = this.data.notes.findIndex((n) => n.id === id)
    if (idx < 0) return false
    if (!this.data.notes[idx].deleted) return false
    this.data.notes.splice(idx, 1)
    this.persist()
    return true
  }

  /** Permanently remove every soft-deleted note. Returns count purged. */
  purgeAllDeleted(): number {
    const before = this.data.notes.length
    this.data.notes = this.data.notes.filter((n) => !n.deleted)
    const removed = before - this.data.notes.length
    if (removed > 0) this.persist()
    return removed
  }

  duplicateNote(id: string): Note | undefined {
    const source = this.getNote(id)
    if (!source) return undefined
    return this.createNote({
      title: source.title,
      content: source.content,
      color: source.color,
      opacity: source.opacity,
      alwaysOnTop: source.alwaysOnTop,
      mode: 'preview',
      bounds: {
        x: source.bounds.x + 30,
        y: source.bounds.y + 30,
        width: source.bounds.width,
        height: source.bounds.height
      }
    })
  }

  private persist(): void {
    ensureDir()
    const file = dataPath()
    const tmp = file + TMP_SUFFIX
    const json = JSON.stringify(this.data, null, 2)
    writeFileSync(tmp, json, 'utf-8')
    renameSync(tmp, file)
  }
}

export const store = new NoteStore()
