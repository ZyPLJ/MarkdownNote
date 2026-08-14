<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useNoteStore } from './stores/note'
import { setupUpdatePrompt } from './lib/update-prompt'
import TitleBar from './components/TitleBar.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import MarkdownEditor from './components/MarkdownEditor.vue'

const store = useNoteStore()
const statusMsg = ref<string | null>(null)
let statusTimer: ReturnType<typeof setTimeout> | null = null

function setStatus(msg: string | null): void {
  statusMsg.value = msg
  if (statusTimer) {
    clearTimeout(statusTimer)
    statusTimer = null
  }
  // Auto-clear non-null statuses that weren't cleared by the emitter
  if (msg) {
    statusTimer = setTimeout(() => {
      statusMsg.value = null
    }, 4000)
  }
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    store.toggleMode()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    store.createNew()
  }
}

/**
 * Preview-mode image paste/drop: save images, append markdown, then enter edit
 * so the user immediately sees the insertion.
 */
async function handlePreviewImages(
  images: { file: File; mime: string }[]
): Promise<void> {
  if (images.length === 0) return

  setStatus(images.length > 1 ? `正在插入 ${images.length} 张图片…` : '正在保存图片…')
  try {
    const chunks: string[] = []
    for (let i = 0; i < images.length; i++) {
      const { file, mime } = images[i]
      if (images.length > 1) setStatus(`正在插入图片 ${i + 1}/${images.length}…`)
      try {
        const dataUrl = await readAsDataUrl(file)
        const optimized = await compressIfNeeded(dataUrl, mime)
        const uri = await window.api.saveImage(optimized.data, optimized.mime)
        const alt =
          file.name
            ?.replace(/\.[a-z0-9]+$/i, '')
            .replace(/[_\-]+/g, ' ')
            .trim()
            .slice(0, 40) || 'image'
        chunks.push(`![${alt}](${uri})`)
      } catch (err) {
        console.error(err)
        setStatus('图片保存失败')
      }
    }
    if (chunks.length > 0) {
      const base = store.content || ''
      const sep = !base || base.endsWith('\n') ? '' : '\n'
      store.setContent(`${base}${sep}${chunks.join('\n')}\n`)
      store.enterEdit()
    }
  } finally {
    setStatus(null)
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82
const COMPRESS_THRESHOLD = 400 * 1024

async function compressIfNeeded(
  dataUrl: string,
  mime: string
): Promise<{ data: string; mime: string }> {
  if (mime === 'image/gif' || mime === 'image/svg+xml') {
    return { data: dataUrl, mime }
  }
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const approxBytes = Math.floor((b64.length * 3) / 4)

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })

  const needsResize = img.width > MAX_EDGE || img.height > MAX_EDGE
  const needsReencode = approxBytes > COMPRESS_THRESHOLD
  if (!needsResize && !needsReencode) return { data: dataUrl, mime }

  let tw = img.width
  let th = img.height
  if (needsResize) {
    const scale = MAX_EDGE / Math.max(tw, th)
    tw = Math.round(tw * scale)
    th = Math.round(th * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return { data: dataUrl, mime }
  ctx.drawImage(img, 0, 0, tw, th)

  // Prefer jpeg unless clearly transparent PNG
  let hasAlpha = false
  if (mime === 'image/png') {
    try {
      const step = Math.max(1, Math.floor(Math.min(tw, th) / 24))
      for (let y = 0; y < th && !hasAlpha; y += step) {
        for (let x = 0; x < tw; x += step) {
          if (ctx.getImageData(x, y, 1, 1).data[3] < 250) {
            hasAlpha = true
            break
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (hasAlpha) return { data: canvas.toDataURL('image/png'), mime: 'image/png' }
  return { data: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mime: 'image/jpeg' }
}

onMounted(async () => {
  await store.load()
  window.addEventListener('keydown', onKeydown)
  // 自动更新提示（非打包环境无事件，静默）
  setupUpdatePrompt()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (statusTimer) clearTimeout(statusTimer)
})
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden rounded-md border shadow-md"
    :class="`note-${store.color}`"
    :style="{
      background: 'var(--note-bg)',
      borderColor: 'var(--note-border)'
    }"
  >
    <TitleBar />

    <main class="relative min-h-0 flex-1">
      <div
        v-if="store.loading"
        class="flex h-full items-center justify-center text-sm text-black/40"
      >
        加载中…
      </div>

      <div
        v-else-if="store.error"
        class="flex h-full items-center justify-center px-4 text-center text-sm text-red-600/80"
      >
        {{ store.error }}
      </div>

      <template v-else>
        <!-- 注意：v-show 作用于多根节点组件会静默失效（MarkdownEditor 是双根：
             CodeMirror 容器 + HighlightMenu），必须用单根容器包裹，否则编辑器
             在任何模式下都可见。两个组件保持挂载以各自保留滚动位置。 -->
        <div v-show="store.mode === 'edit'" class="h-full">
          <MarkdownEditor
            :model-value="store.content"
            @update:model-value="store.setContent"
            @escape="store.enterPreview"
            @status="setStatus"
          />
        </div>

        <MarkdownPreview
          v-show="store.mode !== 'edit'"
          :content="store.content"
          @dblclick="store.enterEdit"
          @paste-image="handlePreviewImages"
          @update-content="store.setContent"
          @status="setStatus"
        />
      </template>

      <!-- transient status toast -->
      <transition name="fade">
        <div
          v-if="statusMsg"
          class="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[12px] text-white shadow-lg"
        >
          {{ statusMsg }}
        </div>
      </transition>
    </main>

    <footer
      class="drag-region flex h-6 shrink-0 items-center justify-between border-t px-2 text-[11px] text-black/35"
      :style="{ borderColor: 'var(--note-border)' }"
    >
      <span class="no-drag">
        <template v-if="statusMsg">{{ statusMsg }}</template>
        <template v-else-if="store.mode === 'edit'">编辑中 · Esc 预览 · 粘贴/拖入图片</template>
        <template v-else>预览 · 双击编辑 · 可勾选任务 · 可粘贴图片</template>
      </span>
      <span class="no-drag tabular-nums">
        {{ store.content.replace(/\s/g, '').length }} 字
      </span>
    </footer>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
