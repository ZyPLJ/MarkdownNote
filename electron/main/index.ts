import { app, BrowserWindow, globalShortcut, ipcMain, protocol } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { store } from './store'
import { noteManager } from './note-manager'
import { createTray, destroyTray } from './tray'
import { initAutoUpdater } from './update'
import { saveAttachImage, resolveAttachPath, extFromMime } from './image-store'
import {
  deriveSnippet,
  type NotePatch,
  type NoteSummary
} from '../shared/types'

// Must be registered before app ready so attach:// works in sandboxed renderers
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'attach',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

// Keep taskbar / jump-list grouping consistent with productName after packaging
if (process.platform === 'win32') {
  app.setAppUserModelId('com.zy.bianqian')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  boot()
}

function boot(): void {
  app.on('second-instance', () => {
    // Re-launch / shortcut click while already running → surface UI
    noteManager.openHistory()
  })

  function broadcastNotesChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('notes:changed')
      }
    }
  }

  function toSummary(n: {
    id: string
    title: string
    content: string
    color: NoteSummary['color']
    updatedAt: string
    createdAt: string
    visible: boolean
    deleted?: boolean
  }): NoteSummary {
    return {
      id: n.id,
      title: n.title,
      snippet: deriveSnippet(n.content),
      color: n.color,
      updatedAt: n.updatedAt,
      createdAt: n.createdAt,
      visible: !!n.visible,
      deleted: !!n.deleted
    }
  }

  function registerProtocols(): void {
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp'
    }
    protocol.handle('attach', async (request) => {
      try {
        const url = new URL(request.url)
        // attach://uuid.png  → host = "uuid.png"
        // attach://uuid.png/ → pathname may carry bits on some parsers
        const filename = (url.hostname || url.host || url.pathname.replace(/^\//, '')).split('?')[0]
        if (!filename || filename.includes('..')) {
          return new Response('Bad Request', { status: 400 })
        }
        const filePath = resolveAttachPath(filename)
        const buf = readFileSync(filePath)
        const ext = (filename.split('.').pop() || '').toLowerCase()
        return new Response(buf, {
          headers: {
            'content-type': mimeMap[ext] || 'application/octet-stream',
            'cache-control': 'public, max-age=31536000, immutable'
          }
        })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    })
  }

  function registerIpc(): void {
    ipcMain.handle('note:get', (_e, id: string) => {
      return store.getNote(id) ?? null
    })

    ipcMain.handle('note:save', (_e, id: string, patch: NotePatch) => {
      const note = noteManager.updateNote(id, patch) ?? null
      broadcastNotesChanged()
      return note
    })

    ipcMain.handle('note:create', () => {
      const note = noteManager.createAndOpen()
      broadcastNotesChanged()
      return note
    })

    ipcMain.handle('note:hide', (_e, id: string) => {
      noteManager.hideNote(id)
      broadcastNotesChanged()
      return true
    })

    ipcMain.handle('note:delete', (_e, id: string) => {
      noteManager.deleteNote(id)
      broadcastNotesChanged()
      return true
    })

    ipcMain.handle('note:restore', (_e, id: string) => {
      const note = store.restoreNote(id)
      if (!note) return null
      broadcastNotesChanged()
      return note
    })

    ipcMain.handle('note:purge', (_e, id: string) => {
      const ok = store.purgeNote(id)
      if (ok) broadcastNotesChanged()
      return ok
    })

    ipcMain.handle('notes:purge-deleted', () => {
      const count = store.purgeAllDeleted()
      if (count > 0) broadcastNotesChanged()
      return count
    })

    ipcMain.handle('note:duplicate', (_e, id: string) => {
      const note = noteManager.duplicateAndOpen(id) ?? null
      broadcastNotesChanged()
      return note
    })

    ipcMain.handle('note:set-always-on-top', (_e, id: string, value: boolean) => {
      return noteManager.updateNote(id, { alwaysOnTop: value }) ?? null
    })

    ipcMain.handle('note:set-opacity', (_e, id: string, value: number) => {
      return noteManager.updateNote(id, { opacity: value }) ?? null
    })

    ipcMain.handle('note:set-color', (_e, id: string, color: NotePatch['color']) => {
      const note = noteManager.updateNote(id, { color }) ?? null
      broadcastNotesChanged()
      return note
    })

    ipcMain.handle('notes:show-all', () => {
      noteManager.showAll()
      broadcastNotesChanged()
      return true
    })

    ipcMain.handle('notes:hide-all', () => {
      noteManager.hideAll()
      broadcastNotesChanged()
      return true
    })

    ipcMain.handle('app:quit', () => {
      ;(global as { isQuitting?: boolean }).isQuitting = true
      noteManager.destroyAll()
      app.quit()
      return true
    })

    ipcMain.handle('app:open-history', () => {
      noteManager.openHistory()
      return true
    })

    ipcMain.handle('app:close-history', () => {
      noteManager.closeHistoryWindow()
      return true
    })

    ipcMain.handle('notes:list', (_e, opts?: { includeDeleted?: boolean }) => {
      const includeDeleted = !!opts?.includeDeleted
      return store
        .getData()
        .notes
        .filter((n) => (includeDeleted ? true : !n.deleted))
        .map(toSummary)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
    })

    ipcMain.handle('note:open', (_e, id: string) => {
      const note = store.getNote(id)
      if (!note || note.deleted) return false
      noteManager.showNote(id)
      broadcastNotesChanged()
      return true
    })

    ipcMain.handle('note:save-image', async (_e, data: string, mimeOrExt: string) => {
      const ext = extFromMime(mimeOrExt)
      const filename = `${randomUUID()}.${ext}`
      saveAttachImage(filename, data)
      return `attach://${filename}`
    })
  }

  function registerHotkey(): void {
    const settings = store.getSettings()
    const hotkey = settings.globalHotkey || 'CommandOrControl+Alt+N'
    try {
      globalShortcut.unregisterAll()
      const ok = globalShortcut.register(hotkey, () => {
        noteManager.createAndOpen()
        broadcastNotesChanged()
      })
      if (!ok) {
        console.warn(`Failed to register global hotkey: ${hotkey}`)
      }
    } catch (err) {
      console.warn('Hotkey registration error:', err)
    }
  }

  app.whenReady().then(() => {
    store.load()
    registerProtocols()
    registerIpc()
    createTray()
    registerHotkey()
    noteManager.restoreVisible()
    // 启动时检查一次更新（非打包环境内部跳过）
    initAutoUpdater()

    app.on('activate', () => {
      // Dock / taskbar re-activate → open history (not pop all notes)
      noteManager.openHistory()
    })
  })

  // Keep running in tray on Windows even when all note windows are hidden
  app.on('window-all-closed', () => {
    // no-op: tray keeps process alive
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    destroyTray()
  })

  app.on('before-quit', () => {
    ;(global as { isQuitting?: boolean }).isQuitting = true
  })
}
