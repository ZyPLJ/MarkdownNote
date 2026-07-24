<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  dblclick: []
  pasteImage: [files: { file: File; mime: string }[]]
  status: [message: string | null]
  updateContent: [value: string]
}>()

const html = computed(() => renderMarkdown(props.content))
const dragging = ref(false)
let dragDepth = 0

/** GFM task marker: "- [ ]" / "* [x]" / "1. [X]" (leading indent kept) */
const TASK_ITEM_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\](\s+)/

/**
 * Set the Nth task-list checkbox in markdown source (0-based) to checked/unchecked.
 * Skips fenced code blocks so example tasks in ``` don't shift the index.
 * Returns null if the index is out of range.
 */
function setTaskAt(source: string, index: number, checked: boolean): string | null {
  const lines = source.split('\n')
  let seen = 0
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    // Toggle fence on ``` / ~~~ open/close lines
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const m = lines[i].match(TASK_ITEM_RE)
    if (!m) continue
    if (seen === index) {
      const mark = checked ? 'x' : ' '
      lines[i] = lines[i].replace(TASK_ITEM_RE, `$1[${mark}]$3`)
      return lines.join('\n')
    }
    seen += 1
  }
  return null
}

function taskCheckboxes(root: ParentNode): HTMLInputElement[] {
  return Array.from(
    root.querySelectorAll('li.task-list-item input[type="checkbox"]')
  ) as HTMLInputElement[]
}

/**
 * change fires after the checkbox is toggled (including when activated via
 * its <label>), so target.checked is the desired new state.
 */
function onTaskChange(e: Event): void {
  const target = e.target
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return
  if (!target.closest('li.task-list-item')) return

  e.stopPropagation()
  const root = (e.currentTarget as HTMLElement).querySelector('.md-preview-body')
  if (!root) return

  const index = taskCheckboxes(root).indexOf(target)
  if (index < 0) return

  const next = setTaskAt(props.content, index, target.checked)
  if (next != null && next !== props.content) {
    emit('updateContent', next)
  }
}

function onClick(e: MouseEvent): void {
  const target = e.target as HTMLElement

  // Keep task interactions from bubbling (e.g. selection quirks)
  if (
    (target instanceof HTMLInputElement && target.type === 'checkbox') ||
    target.closest('li.task-list-item label')
  ) {
    e.stopPropagation()
  }

  const anchor = target.closest('a')
  if (anchor && (anchor as HTMLAnchorElement).href) {
    e.preventDefault()
    window.open((anchor as HTMLAnchorElement).href, '_blank')
  }
}

function onDblClick(e: MouseEvent): void {
  // Don't enter edit mode when double-clicking a checkbox / task label
  const target = e.target as HTMLElement
  if (
    (target instanceof HTMLInputElement && target.type === 'checkbox') ||
    target.closest('li.task-list-item input[type="checkbox"]') ||
    target.closest('li.task-list-item label')
  ) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  emit('dblclick')
}

function collectImages(list: DataTransferItemList | FileList | null | undefined): {
  file: File
  mime: string
}[] {
  if (!list) return []
  const out: { file: File; mime: string }[] = []
  if (list instanceof FileList || Array.isArray(list)) {
    for (const file of Array.from(list as FileList)) {
      if (file.type.startsWith('image/')) {
        out.push({ file, mime: file.type || 'image/png' })
      }
    }
    return out
  }
  // Clipboard often lists the same bitmap under several MIME types
  // (png + bmp …). Prefer one best format so paste never doubles.
  const preferred = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/svg+xml'
  ]
  const byMime = new Map<string, { file: File; mime: string }>()
  for (const item of Array.from(list as DataTransferItemList)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file && !byMime.has(item.type)) {
        byMime.set(item.type, { file, mime: item.type })
      }
    }
  }
  if (byMime.size === 0) return []
  for (const mime of preferred) {
    const hit = byMime.get(mime)
    if (hit) return [hit]
  }
  return [byMime.values().next().value!]
}

function onPaste(e: ClipboardEvent): void {
  const images = collectImages(e.clipboardData?.items)
  if (images.length === 0) return
  e.preventDefault()
  e.stopPropagation()
  emit('pasteImage', images)
}

function onDragEnter(e: DragEvent): void {
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.preventDefault()
  dragDepth += 1
  dragging.value = true
}

function onDragLeave(e: DragEvent): void {
  if (!e.dataTransfer?.types?.includes('Files')) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDragOver(e: DragEvent): void {
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDrop(e: DragEvent): void {
  dragDepth = 0
  dragging.value = false
  const images = collectImages(e.dataTransfer?.files)
  if (images.length === 0) return
  e.preventDefault()
  emit('pasteImage', images)
}

onUnmounted(() => {
  dragDepth = 0
})
</script>

<template>
  <div
    class="note-content note-scroll md-preview relative h-full overflow-auto px-3.5 py-3"
    title="双击进入编辑 · 可粘贴/拖入图片 · 可勾选任务"
    @dblclick="onDblClick"
    @click="onClick"
    @change="onTaskChange"
    @paste="onPaste"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <div class="md-preview-body" v-html="html" />

    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-black/25 bg-white/70 text-[13px] font-medium text-black/55 backdrop-blur-[1px]"
    >
      松开以插入图片
    </div>
  </div>
</template>
