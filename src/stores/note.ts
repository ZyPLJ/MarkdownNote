import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Note, NoteColor, NoteMode, NotePatch } from '../../electron/shared/types'
import { confirm } from '../lib/confirm'

function getNoteIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('id') || ''
}

export const useNoteStore = defineStore('note', () => {
  const note = ref<Note | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const mode = ref<NoteMode>('preview')
  const menuOpen = ref(false)
  const colorPickerOpen = ref(false)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  /** Accumulates patches across debounce windows so rapid content+mode saves don't drop fields. */
  let pendingPatch: NotePatch = {}
  const noteId = getNoteIdFromUrl()

  const title = computed(() => note.value?.title || '便签')
  const color = computed(() => note.value?.color || 'yellow')
  const content = computed(() => note.value?.content || '')
  const alwaysOnTop = computed(() => note.value?.alwaysOnTop ?? true)
  const opacity = computed(() => note.value?.opacity ?? 0.95)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      if (!noteId) {
        error.value = '缺少便签 ID'
        return
      }
      const data = await window.api.getNote(noteId)
      if (!data) {
        error.value = '便签不存在'
        return
      }
      note.value = data
      mode.value = data.mode === 'edit' ? 'edit' : 'preview'
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  function scheduleSave(patch: NotePatch): void {
    if (!note.value) return
    // Optimistic local merge
    note.value = {
      ...note.value,
      ...patch,
      bounds: patch.bounds
        ? { ...note.value.bounds, ...patch.bounds }
        : note.value.bounds,
      updatedAt: new Date().toISOString()
    }

    // Merge into pending so a later mode-only save doesn't drop a content save
    pendingPatch = {
      ...pendingPatch,
      ...patch,
      bounds: patch.bounds
        ? { ...(pendingPatch.bounds ?? {}), ...patch.bounds }
        : pendingPatch.bounds
    }

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      if (!note.value) return
      const toSave = pendingPatch
      pendingPatch = {}
      saveTimer = null
      const saved = await window.api.saveNote(note.value.id, toSave)
      if (saved) {
        // Keep any fields that were edited again while the save was in flight
        const stillPending = pendingPatch
        note.value = {
          ...note.value,
          ...saved,
          ...stillPending,
          bounds: {
            ...saved.bounds,
            ...(stillPending.bounds ?? {})
          }
        }
        // Prefer local mode ref over server if user toggled during save
        if (stillPending.mode) mode.value = stillPending.mode
      }
    }, 500)
  }

  async function flushSave(): Promise<void> {
    if (!note.value) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const toSave: NotePatch = {
      ...pendingPatch,
      content: note.value.content,
      mode: mode.value
    }
    pendingPatch = {}
    await window.api.saveNote(note.value.id, toSave)
  }

  function setContent(value: string): void {
    scheduleSave({ content: value })
  }

  function setMode(next: NoteMode): void {
    mode.value = next
    scheduleSave({ mode: next })
  }

  function toggleMode(): void {
    setMode(mode.value === 'preview' ? 'edit' : 'preview')
  }

  function enterEdit(): void {
    if (mode.value !== 'edit') setMode('edit')
  }

  function enterPreview(): void {
    if (mode.value !== 'preview') setMode('preview')
  }

  async function setColor(c: NoteColor): Promise<void> {
    if (!note.value) return
    const saved = await window.api.setColor(note.value.id, c)
    if (saved) note.value = saved
    colorPickerOpen.value = false
  }

  async function toggleAlwaysOnTop(): Promise<void> {
    if (!note.value) return
    const saved = await window.api.setAlwaysOnTop(
      note.value.id,
      !note.value.alwaysOnTop
    )
    if (saved) note.value = saved
  }

  async function setOpacity(value: number): Promise<void> {
    if (!note.value) return
    const v = Math.min(1, Math.max(0.5, value))
    const saved = await window.api.setOpacity(note.value.id, v)
    if (saved) note.value = saved
  }

  async function hide(): Promise<void> {
    if (!note.value) return
    await flushSave()
    await window.api.hideNote(note.value.id)
  }

  async function remove(): Promise<void> {
    if (!note.value) return
    const ok = await confirm({
      title: '提醒',
      message: '删除这条便签？可在「便签历史 → 回收站」中恢复。',
      confirmText: '删除',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return
    await window.api.deleteNote(note.value.id)
  }

  async function duplicate(): Promise<void> {
    if (!note.value) return
    await window.api.duplicateNote(note.value.id)
    menuOpen.value = false
  }

  async function createNew(): Promise<void> {
    await window.api.createNote()
    menuOpen.value = false
  }

  return {
    note,
    loading,
    error,
    mode,
    menuOpen,
    colorPickerOpen,
    title,
    color,
    content,
    alwaysOnTop,
    opacity,
    load,
    setContent,
    setMode,
    toggleMode,
    enterEdit,
    enterPreview,
    setColor,
    toggleAlwaysOnTop,
    setOpacity,
    hide,
    remove,
    duplicate,
    createNew
  }
})
