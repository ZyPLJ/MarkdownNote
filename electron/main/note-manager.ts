import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  shell
} from 'electron'
import { join } from 'path'
import { Note, NotePatch } from '../shared/types'
import { store } from './store'
import { getAppIcon, getAppIconPath } from './paths'

const isDev = !app.isPackaged

export class NoteManager {
  private windows = new Map<string, BrowserWindow>()
  private historyWin: BrowserWindow | null = null

  openNote(note: Note): BrowserWindow {
    const existing = this.windows.get(note.id)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return existing
    }

    const bounds = this.clampBounds(note.bounds)
    const iconPath = getAppIconPath()
    const options: BrowserWindowConstructorOptions = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 240,
      minHeight: 180,
      show: false,
      frame: false,
      transparent: false,
      resizable: true,
      // Must stay false so sticky notes appear on the Windows taskbar
      skipTaskbar: false,
      alwaysOnTop: note.alwaysOnTop,
      opacity: note.opacity,
      backgroundColor: this.bgColor(note.color),
      // Prefer path string on Windows — empty NativeImage blanks the taskbar icon
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    }

    const win = new BrowserWindow(options)
    this.applyWindowIcon(win)

    win.once('ready-to-show', () => {
      win.show()
    })

    win.on('close', (e) => {
      if (!(global as { isQuitting?: boolean }).isQuitting) {
        e.preventDefault()
        this.hideNote(note.id)
      }
    })

    win.on('moved', () => this.syncBounds(note.id, win))
    win.on('resized', () => this.syncBounds(note.id, win))

    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}?id=${encodeURIComponent(note.id)}`
      )
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), {
        search: `id=${encodeURIComponent(note.id)}`
      })
    }

    this.windows.set(note.id, win)
    store.updateNote(note.id, { visible: true })
    return win
  }

  hideNote(id: string): void {
    const win = this.windows.get(id)
    if (win && !win.isDestroyed()) {
      this.syncBounds(id, win)
      win.hide()
    }
    store.updateNote(id, { visible: false })
  }

  showNote(id: string): void {
    const note = store.getNote(id)
    if (!note) return
    const win = this.windows.get(id)
    if (win && !win.isDestroyed()) {
      store.updateNote(id, { visible: true })
      win.show()
      win.focus()
      return
    }
    this.openNote({ ...note, visible: true })
  }

  showAll(): void {
    for (const note of store.getActiveNotes()) {
      this.showNote(note.id)
    }
  }

  hideAll(): void {
    for (const id of [...this.windows.keys()]) {
      this.hideNote(id)
    }
  }

  closeAndDestroy(id: string): void {
    const win = this.windows.get(id)
    if (win && !win.isDestroyed()) {
      win.removeAllListeners('close')
      win.destroy()
    }
    this.windows.delete(id)
  }

  deleteNote(id: string): void {
    this.closeAndDestroy(id)
    store.deleteNote(id)
  }

  createAndOpen(partial?: Partial<Note>): Note {
    const note = store.createNote(partial)
    this.openNote(note)
    return note
  }

  duplicateAndOpen(id: string): Note | undefined {
    const note = store.duplicateNote(id)
    if (note) this.openNote(note)
    return note
  }

  updateNote(id: string, patch: NotePatch): Note | undefined {
    const note = store.updateNote(id, patch)
    if (!note) return undefined

    const win = this.windows.get(id)
    if (win && !win.isDestroyed()) {
      if (patch.alwaysOnTop !== undefined) {
        win.setAlwaysOnTop(patch.alwaysOnTop, 'floating')
      }
      if (patch.opacity !== undefined) {
        win.setOpacity(patch.opacity)
      }
      if (patch.color !== undefined) {
        win.setBackgroundColor(this.bgColor(patch.color))
      }
    }
    return note
  }

  /**
   * Startup restore:
   * - no notes at all → create welcome note
   * - some notes marked visible → reopen them
   * - notes exist but all hidden → open history (avoid “silent tray-only” first launch)
   */
  restoreVisible(): void {
    const active = store.getActiveNotes()
    const visible = active.filter((n) => n.visible)

    if (visible.length > 0) {
      for (const note of visible) {
        this.openNote(note)
      }
      return
    }

    if (active.length === 0) {
      this.createAndOpen({
        content:
          '# 欢迎使用便签\n\n双击内容区域开始编辑，按 `Esc` 回到预览。\n\n- [x] 安装便签\n- [ ] 写下第一条笔记\n\n```js\nconsole.log("Hello Sticky!")\n```\n\n> 提示：编辑时 `Ctrl+V` 或拖入图片即可插入\n',
        color: 'yellow',
        alwaysOnTop: true
      })
      return
    }

    // Notes exist but none were left visible (user hid them last time).
    // Open history so the first launch always shows UI — not just tray.
    this.openHistory()
  }

  destroyAll(): void {
    for (const [, win] of this.windows) {
      if (!win.isDestroyed()) {
        win.removeAllListeners('close')
        win.destroy()
      }
    }
    this.windows.clear()
    this.closeHistoryWindow()
  }

  openHistory(): void {
    if (this.historyWin && !this.historyWin.isDestroyed()) {
      this.historyWin.show()
      this.historyWin.focus()
      return
    }

    const iconPath = getAppIconPath()
    const win = new BrowserWindow({
      width: 360,
      height: 500,
      minWidth: 280,
      minHeight: 300,
      frame: false,
      resizable: true,
      // History is a utility panel — keep it out of the taskbar
      skipTaskbar: true,
      alwaysOnTop: true,
      // Match default sticky-note yellow chrome
      backgroundColor: '#fff9c4',
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.applyWindowIcon(win)

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}history.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/history.html'))
    }

    win.on('closed', () => {
      this.historyWin = null
    })

    this.historyWin = win
    win.show()
    win.focus()
  }

  closeHistoryWindow(): void {
    if (this.historyWin && !this.historyWin.isDestroyed()) {
      this.historyWin.removeAllListeners('closed')
      this.historyWin.destroy()
    }
    this.historyWin = null
  }

  private applyWindowIcon(win: BrowserWindow): void {
    try {
      const path = getAppIconPath()
      if (path) {
        win.setIcon(path)
        return
      }
      const img = getAppIcon()
      if (!img.isEmpty()) win.setIcon(img)
    } catch {
      // ignore — missing icon should not crash window creation
    }
  }

  private syncBounds(id: string, win: BrowserWindow): void {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    store.updateNote(id, {
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height }
    })
  }

  private clampBounds(bounds: Note['bounds']): Note['bounds'] {
    const display = screen.getDisplayMatching({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    const area = display.workArea
    const width = Math.min(Math.max(bounds.width, 240), area.width)
    const height = Math.min(Math.max(bounds.height, 180), area.height)
    const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
    const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
    return { x, y, width, height }
  }

  private bgColor(color: Note['color']): string {
    const map: Record<Note['color'], string> = {
      yellow: '#fff9c4',
      pink: '#fce4ec',
      blue: '#e3f2fd',
      green: '#e8f5e9',
      purple: '#f3e5f5',
      gray: '#f5f5f5'
    }
    return map[color] ?? map.yellow
  }
}

export const noteManager = new NoteManager()
