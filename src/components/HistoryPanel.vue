<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { NoteColor, NoteSummary } from '../../electron/shared/types'
import { confirm } from '../lib/confirm'

type Tab = 'active' | 'deleted'

const notes = ref<NoteSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const query = ref('')
const tab = ref<Tab>('active')
const busyId = ref<string | null>(null)

const activeCount = computed(() => notes.value.filter((n) => !n.deleted).length)
const deletedCount = computed(() => notes.value.filter((n) => n.deleted).length)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return notes.value
    .filter((n) => (tab.value === 'deleted' ? n.deleted : !n.deleted))
    .filter((n) => {
      if (!q) return true
      return (
        n.title.toLowerCase().includes(q) ||
        n.snippet.toLowerCase().includes(q)
      )
    })
})

async function loadNotes(silent = false): Promise<void> {
  if (!silent) {
    loading.value = true
    error.value = null
  }
  try {
    notes.value = await window.api.getAllNotes({ includeDeleted: true })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function openNote(id: string): Promise<void> {
  if (busyId.value) return
  await window.api.openNote(id)
}

async function createNote(): Promise<void> {
  await window.api.createNote()
}

async function restoreNote(id: string, e: Event): Promise<void> {
  e.stopPropagation()
  if (busyId.value) return
  busyId.value = id
  try {
    await window.api.restoreNote(id)
    await window.api.openNote(id)
    await loadNotes(true)
  } finally {
    busyId.value = null
  }
}

async function purgeNote(id: string, e: Event): Promise<void> {
  e.stopPropagation()
  if (busyId.value) return
  const ok = await confirm({
    title: '提醒',
    message: '永久删除这条便签？此操作无法撤销。',
    confirmText: '永久删除',
    cancelText: '取消',
    danger: true
  })
  if (!ok) return
  busyId.value = id
  try {
    await window.api.purgeNote(id)
    await loadNotes(true)
  } finally {
    busyId.value = null
  }
}

async function deleteNote(id: string, e: Event): Promise<void> {
  e.stopPropagation()
  if (busyId.value) return
  const ok = await confirm({
    title: '提醒',
    message: '删除这条便签？可在回收站中恢复。',
    confirmText: '删除',
    cancelText: '取消',
    danger: true
  })
  if (!ok) return
  busyId.value = id
  try {
    await window.api.deleteNote(id)
    await loadNotes(true)
  } finally {
    busyId.value = null
  }
}

async function purgeAll(): Promise<void> {
  if (deletedCount.value === 0) return
  const ok = await confirm({
    title: '提醒',
    message: `清空回收站？将永久删除 ${deletedCount.value} 条便签，无法撤销。`,
    confirmText: '清空',
    cancelText: '取消',
    danger: true
  })
  if (!ok) return
  await window.api.purgeAllDeleted()
  await loadNotes(true)
}

async function closeWindow(): Promise<void> {
  await window.api.closeHistory()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffMin < 60 * 24 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 1 || (diffDays === 0 && d.getDate() !== now.getDate())) {
    return '昨天'
  }
  if (diffDays < 7) return `${diffDays} 天前`
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function colorClass(color: NoteColor): string {
  return `note-${color || 'yellow'}`
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (query.value) {
      query.value = ''
      return
    }
    closeWindow()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    createNote()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    const input = document.getElementById('history-search') as HTMLInputElement | null
    input?.focus()
    input?.select()
  }
}

let unsub: (() => void) | null = null

onMounted(() => {
  loadNotes()
  unsub = window.api.onNotesChanged(() => loadNotes(true))
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  unsub?.()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- Outer chrome mirrors App.vue note window -->
  <div
    class="note-yellow flex h-full flex-col overflow-hidden rounded-md border shadow-md"
    :style="{
      background: 'var(--note-bg)',
      borderColor: 'var(--note-border)'
    }"
  >
    <!-- Title bar — same language as TitleBar.vue -->
    <header
      class="drag-region flex h-9 shrink-0 items-center gap-1 border-b px-2"
      :style="{
        background: 'color-mix(in srgb, var(--note-bar) 22%, var(--note-bg))',
        borderColor: 'var(--note-border)'
      }"
    >
      <span
        class="no-drag mr-1 h-4 w-1.5 shrink-0 rounded-sm"
        :style="{ background: 'var(--note-bar)' }"
      />
      <div class="min-w-0 flex-1 truncate text-[13px] font-medium text-black/70">
        便签历史
      </div>
      <div class="no-drag flex items-center gap-0.5">
        <button
          class="flex h-7 items-center gap-0.5 rounded px-1.5 text-[12px] text-black/60 hover:bg-black/8"
          title="新建便签 (Ctrl+N)"
          @click="createNote"
        >
          <span class="text-[14px] leading-none">＋</span>
          <span>新建</span>
        </button>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-black/50 hover:bg-red-500/15 hover:text-red-600"
          title="关闭"
          @click="closeWindow"
        >
          ✕
        </button>
      </div>
    </header>

    <!-- Search + tabs, soft on note bg -->
    <div
      class="no-drag shrink-0 space-y-2 border-b px-2.5 py-2"
      :style="{ borderColor: 'var(--note-border)' }"
    >
      <div class="relative">
        <span
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-black/30"
        >⌕</span>
        <input
          id="history-search"
          v-model="query"
          type="search"
          placeholder="搜索标题或摘要…"
          class="w-full rounded-md border bg-white/55 py-1.5 pl-7 pr-7 text-[13px] text-black/75 outline-none transition placeholder:text-black/30 focus:bg-white/80"
          :style="{ borderColor: 'var(--note-border)' }"
          spellcheck="false"
        />
        <button
          v-if="query"
          class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[11px] text-black/35 hover:bg-black/8 hover:text-black/70"
          title="清除"
          @click="query = ''"
        >
          ✕
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="rounded px-2 py-0.5 text-[12px] transition"
          :class="
            tab === 'active'
              ? 'bg-black/10 font-medium text-black/75'
              : 'text-black/40 hover:bg-black/6 hover:text-black/65'
          "
          @click="tab = 'active'"
        >
          全部
          <span class="ml-0.5 tabular-nums text-black/35">{{ activeCount }}</span>
        </button>
        <button
          class="rounded px-2 py-0.5 text-[12px] transition"
          :class="
            tab === 'deleted'
              ? 'bg-black/10 font-medium text-black/75'
              : 'text-black/40 hover:bg-black/6 hover:text-black/65'
          "
          @click="tab = 'deleted'"
        >
          回收站
          <span class="ml-0.5 tabular-nums text-black/35">{{ deletedCount }}</span>
        </button>

        <button
          v-if="tab === 'deleted' && deletedCount > 0"
          class="ml-auto rounded px-1.5 py-0.5 text-[11px] text-red-700/70 hover:bg-red-500/10 hover:text-red-700"
          @click="purgeAll"
        >
          清空
        </button>
      </div>
    </div>

    <!-- List -->
    <main class="note-scroll note-content min-h-0 flex-1 overflow-auto">
      <div
        v-if="loading"
        class="flex h-full items-center justify-center text-[13px] text-black/40"
      >
        加载中…
      </div>

      <div
        v-else-if="error"
        class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-red-600/80"
      >
        <span>{{ error }}</span>
        <button
          class="rounded px-3 py-1 text-[12px] text-black/60 hover:bg-black/8"
          @click="loadNotes()"
        >
          重试
        </button>
      </div>

      <div
        v-else-if="filtered.length === 0"
        class="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center"
      >
        <span class="text-[22px] opacity-35">{{
          query ? '⌕' : tab === 'deleted' ? '∅' : '✎'
        }}</span>
        <span class="text-[13px] text-black/35">
          <template v-if="query">没有匹配「{{ query }}」的便签</template>
          <template v-else-if="tab === 'deleted'">回收站是空的</template>
          <template v-else>还没有便签，点右上角新建</template>
        </span>
      </div>

      <ul v-else class="space-y-1.5 p-2">
        <li v-for="note in filtered" :key="note.id">
          <!-- Each row is a mini sticky note in its own color -->
          <div
            class="group no-drag relative flex w-full cursor-pointer items-stretch overflow-hidden rounded-md border shadow-sm transition hover:shadow active:scale-[0.995]"
            :class="[colorClass(note.color), busyId === note.id && 'opacity-60']"
            :style="{
              background: 'var(--note-bg)',
              borderColor: 'var(--note-border)'
            }"
            role="button"
            tabindex="0"
            @click="tab === 'active' ? openNote(note.id) : undefined"
            @keydown.enter="tab === 'active' ? openNote(note.id) : undefined"
          >
            <!-- left accent bar, same as TitleBar -->
            <span
              class="w-1 shrink-0 self-stretch"
              :style="{ background: 'var(--note-bar)' }"
            />

            <div class="min-w-0 flex-1 px-2.5 py-2">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate text-[13px] font-medium text-black/75">
                  {{ note.title || '未命名便签' }}
                </span>
                <span class="shrink-0 text-[11px] tabular-nums text-black/35">
                  {{ formatDate(note.updatedAt) }}
                </span>
              </div>
              <p
                v-if="note.snippet"
                class="mt-0.5 line-clamp-2 text-[12px] leading-snug text-black/45"
              >
                {{ note.snippet }}
              </p>
              <div v-if="!note.deleted" class="mt-1.5 flex items-center gap-1.5">
                <span
                  v-if="note.visible"
                  class="rounded px-1.5 py-px text-[10px] font-medium"
                  :style="{
                    background: 'color-mix(in srgb, var(--note-bar) 18%, transparent)',
                    color: 'color-mix(in srgb, var(--note-bar) 70%, #000)'
                  }"
                >
                  显示中
                </span>
                <span
                  v-else
                  class="rounded bg-black/6 px-1.5 py-px text-[10px] text-black/40"
                >
                  已隐藏
                </span>
              </div>
            </div>

            <!-- hover actions -->
            <div
              class="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded border p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100"
              :style="{
                borderColor: 'var(--note-border)',
                background: 'color-mix(in srgb, var(--note-bg) 70%, #ffffff)'
              }"
              @click.stop
            >
              <template v-if="tab === 'active'">
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-black/55 hover:bg-black/8 hover:text-black/80"
                  title="打开"
                  @click="openNote(note.id)"
                >
                  打开
                </button>
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-red-700/70 hover:bg-red-500/12 hover:text-red-700"
                  title="删除"
                  @click="deleteNote(note.id, $event)"
                >
                  删除
                </button>
              </template>
              <template v-else>
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-black/55 hover:bg-black/8 hover:text-black/80"
                  title="恢复"
                  @click="restoreNote(note.id, $event)"
                >
                  恢复
                </button>
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-red-700/70 hover:bg-red-500/12 hover:text-red-700"
                  title="永久删除"
                  @click="purgeNote(note.id, $event)"
                >
                  清除
                </button>
              </template>
            </div>
          </div>
        </li>
      </ul>
    </main>

    <!-- Footer mirrors note footer -->
    <footer
      class="drag-region flex h-6 shrink-0 items-center justify-between border-t px-2 text-[11px] text-black/35"
      :style="{ borderColor: 'var(--note-border)' }"
    >
      <span class="no-drag tabular-nums">
        {{ filtered.length }}
        <template v-if="query"> / {{ tab === 'deleted' ? deletedCount : activeCount }}</template>
        条
      </span>
      <span class="no-drag">Ctrl+F 搜索 · Esc 关闭</span>
    </footer>
  </div>
</template>
