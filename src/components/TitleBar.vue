<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { NOTE_COLORS, type NoteColor } from '../../electron/shared/types'
import { useNoteStore } from '../stores/note'

const store = useNoteStore()
const opacityOpen = ref(false)

const colorLabel: Record<NoteColor, string> = {
  yellow: '黄',
  pink: '粉',
  blue: '蓝',
  green: '绿',
  purple: '紫',
  gray: '灰'
}

function openHistory(): void {
  window.api.openHistory()
}

function onDocClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest?.('[data-menu]')) {
    store.menuOpen = false
    store.colorPickerOpen = false
    opacityOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <header
    class="drag-region flex h-9 shrink-0 items-center gap-1 border-b px-2"
    :style="{
      background: 'color-mix(in srgb, var(--note-bar) 22%, var(--note-bg))',
      borderColor: 'var(--note-border)'
    }"
  >
    <!-- accent bar -->
    <span
      class="no-drag mr-1 h-4 w-1.5 shrink-0 rounded-sm"
      :style="{ background: 'var(--note-bar)' }"
    />

    <div class="min-w-0 flex-1 truncate text-[13px] font-medium text-black/70">
      {{ store.title }}
    </div>

    <div class="no-drag flex items-center gap-0.5">
      <!-- Color -->
      <div class="relative" data-menu>
        <button
          class="flex h-7 w-7 items-center justify-center rounded hover:bg-black/8"
          title="颜色"
          @click.stop="
            store.colorPickerOpen = !store.colorPickerOpen;
            store.menuOpen = false;
            opacityOpen = false
          "
        >
          <span
            class="h-3.5 w-3.5 rounded-full border border-black/20"
            :style="{ background: 'var(--note-bar)' }"
          />
        </button>
        <div
          v-if="store.colorPickerOpen"
          class="absolute right-0 top-8 z-50 flex gap-1.5 rounded-lg border border-black/10 bg-white p-2 shadow-lg"
        >
          <button
            v-for="c in NOTE_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border border-black/15 transition hover:scale-110"
            :class="[
              c === 'yellow' && 'bg-note-yellow',
              c === 'pink' && 'bg-note-pink',
              c === 'blue' && 'bg-note-blue',
              c === 'green' && 'bg-note-green',
              c === 'purple' && 'bg-note-purple',
              c === 'gray' && 'bg-note-gray',
              store.color === c && 'ring-2 ring-black/40'
            ]"
            :title="colorLabel[c]"
            @click="store.setColor(c)"
          />
        </div>
      </div>

      <!-- Pin -->
      <button
        class="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-black/8"
        :class="store.alwaysOnTop ? 'text-black/80' : 'text-black/30'"
        :title="store.alwaysOnTop ? '取消置顶' : '置顶'"
        @click="store.toggleAlwaysOnTop()"
      >
        📌
      </button>

      <!-- Opacity -->
      <div class="relative" data-menu>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-xs text-black/60 hover:bg-black/8"
          title="透明度"
          @click.stop="
            opacityOpen = !opacityOpen;
            store.menuOpen = false;
            store.colorPickerOpen = false
          "
        >
          ◐
        </button>
        <div
          v-if="opacityOpen"
          class="absolute right-0 top-8 z-50 w-40 rounded-lg border border-black/10 bg-white p-3 shadow-lg"
        >
          <div class="mb-1 flex justify-between text-[11px] text-black/50">
            <span>透明度</span>
            <span>{{ Math.round(store.opacity * 100) }}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="100"
            :value="Math.round(store.opacity * 100)"
            class="w-full accent-black/60"
            @input="
              store.setOpacity(
                Number(($event.target as HTMLInputElement).value) / 100
              )
            "
          />
        </div>
      </div>

      <!-- History -->
      <button
        class="flex h-7 w-7 items-center justify-center rounded text-xs text-black/60 hover:bg-black/8"
        title="便签历史"
        @click="openHistory()"
      >
        📋
      </button>

      <!-- Menu -->
      <div class="relative" data-menu>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-black/60 hover:bg-black/8"
          title="菜单"
          @click.stop="
            store.menuOpen = !store.menuOpen;
            store.colorPickerOpen = false;
            opacityOpen = false
          "
        >
          ⋯
        </button>
        <div
          v-if="store.menuOpen"
          class="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-lg border border-black/10 bg-white py-1 text-[13px] shadow-lg"
        >
          <button
            class="block w-full px-3 py-1.5 text-left hover:bg-black/5"
            @click="store.createNew()"
          >
            新建便签
          </button>
          <button
            class="block w-full px-3 py-1.5 text-left hover:bg-black/5"
            @click="store.duplicate()"
          >
            复制便签
          </button>
          <button
            class="block w-full px-3 py-1.5 text-left hover:bg-black/5"
            @click="store.toggleMode()"
          >
            {{ store.mode === 'preview' ? '编辑' : '预览' }}
            <span class="float-right text-[11px] text-black/35">Ctrl+E</span>
          </button>
          <div class="my-1 border-t border-black/8" />
          <button
            class="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
            @click="store.remove()"
          >
            删除
          </button>
        </div>
      </div>

      <!-- Hide (close) -->
      <button
        class="flex h-7 w-7 items-center justify-center rounded text-black/50 hover:bg-red-500/15 hover:text-red-600"
        title="隐藏"
        @click="store.hide()"
      >
        ✕
      </button>
    </div>
  </header>
</template>
