import { contextBridge, ipcRenderer } from 'electron'
import type { Note, NoteColor, NotePatch, NoteSummary } from '../shared/types'

const api = {
  getNote: (id: string): Promise<Note | null> => ipcRenderer.invoke('note:get', id),
  saveNote: (id: string, patch: NotePatch): Promise<Note | null> =>
    ipcRenderer.invoke('note:save', id, patch),
  createNote: (): Promise<Note> => ipcRenderer.invoke('note:create'),
  hideNote: (id: string): Promise<boolean> => ipcRenderer.invoke('note:hide', id),
  deleteNote: (id: string): Promise<boolean> => ipcRenderer.invoke('note:delete', id),
  restoreNote: (id: string): Promise<Note | null> =>
    ipcRenderer.invoke('note:restore', id),
  purgeNote: (id: string): Promise<boolean> => ipcRenderer.invoke('note:purge', id),
  purgeAllDeleted: (): Promise<number> => ipcRenderer.invoke('notes:purge-deleted'),
  duplicateNote: (id: string): Promise<Note | null> =>
    ipcRenderer.invoke('note:duplicate', id),
  setAlwaysOnTop: (id: string, value: boolean): Promise<Note | null> =>
    ipcRenderer.invoke('note:set-always-on-top', id, value),
  setOpacity: (id: string, value: number): Promise<Note | null> =>
    ipcRenderer.invoke('note:set-opacity', id, value),
  setColor: (id: string, color: NoteColor): Promise<Note | null> =>
    ipcRenderer.invoke('note:set-color', id, color),
  showAll: (): Promise<boolean> => ipcRenderer.invoke('notes:show-all'),
  hideAll: (): Promise<boolean> => ipcRenderer.invoke('notes:hide-all'),
  quit: (): Promise<boolean> => ipcRenderer.invoke('app:quit'),
  getAllNotes: (opts?: { includeDeleted?: boolean }): Promise<NoteSummary[]> =>
    ipcRenderer.invoke('notes:list', opts),
  openNote: (id: string): Promise<boolean> => ipcRenderer.invoke('note:open', id),
  saveImage: (data: string, mimeOrExt: string): Promise<string> =>
    ipcRenderer.invoke('note:save-image', data, mimeOrExt),
  openHistory: (): Promise<boolean> => ipcRenderer.invoke('app:open-history'),
  closeHistory: (): Promise<boolean> => ipcRenderer.invoke('app:close-history'),
  /** Subscribe to any notes-list mutation; returns an unsubscribe fn. */
  onNotesChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('notes:changed', handler)
    return () => {
      ipcRenderer.removeListener('notes:changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type StickyApi = typeof api
