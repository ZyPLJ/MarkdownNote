<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** downloading = 下载进度态；downloaded = 已就绪确认态 */
    mode: 'downloading' | 'downloaded'
    percent?: number
    version?: string
    currentVersion?: string
  }>(),
  { percent: 0 }
)

const emit = defineEmits<{
  close: []
  cancel: []
  confirm: []
}>()

const visible = ref(false)

function onClose(): void {
  visible.value = false
  emit('close')
}

function onCancel(): void {
  visible.value = false
  emit('cancel')
}

function onConfirm(): void {
  visible.value = false
  emit('confirm')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    props.mode === 'downloading' ? onClose() : onCancel()
  } else if (e.key === 'Enter' && props.mode === 'downloaded') {
    e.preventDefault()
    e.stopPropagation()
    onConfirm()
  }
}

onMounted(() => {
  // next frame so enter transition plays
  requestAnimationFrame(() => {
    visible.value = true
  })
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div class="confirm-root no-drag" role="presentation">
      <!-- backdrop -->
      <transition name="confirm-fade">
        <div
          v-if="visible"
          class="confirm-backdrop"
          @click="mode === 'downloading' ? onClose() : onCancel()"
        />
      </transition>

      <!-- panel -->
      <transition name="confirm-pop">
        <div
          v-if="visible"
          class="confirm-panel"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="'update-title'"
        >
          <div class="confirm-accent" />

          <div class="confirm-body">
            <div class="confirm-header">
              <span class="confirm-icon is-info">i</span>
              <h2 id="update-title" class="confirm-title">
                {{ mode === 'downloading' ? '正在下载新版本…' : `发现新版本 v${version}` }}
              </h2>
            </div>

            <template v-if="mode === 'downloading'">
              <p class="confirm-message">
                新版本正在后台下载，可继续使用便签。
              </p>
              <div class="progress-track">
                <div class="progress-bar" :style="{ width: `${percent}%` }" />
              </div>
              <div class="progress-label">{{ percent }}%</div>
              <div class="confirm-actions">
                <button type="button" class="btn btn-ghost" @click="onClose">
                  后台下载
                </button>
              </div>
            </template>

            <template v-else>
              <p class="confirm-message">
                当前版本 v{{ currentVersion }}，新版本已下载完成。重启并安装？
              </p>
              <div class="confirm-actions">
                <button type="button" class="btn btn-ghost" @click="onCancel">
                  稍后
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  autofocus
                  @click="onConfirm"
                >
                  重启并安装
                </button>
              </div>
            </template>
          </div>
        </div>
      </transition>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
}

.confirm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(30, 25, 15, 0.28);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

.confirm-panel {
  position: relative;
  z-index: 1;
  width: min(300px, 100%);
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fffef8;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 12px 32px rgba(0, 0, 0, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  pointer-events: auto;
}

.confirm-accent {
  height: 3px;
  background: linear-gradient(
    90deg,
    #f9a825 0%,
    #ffca28 45%,
    #ff8a65 100%
  );
}

.confirm-body {
  padding: 16px 16px 14px;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  color: #1565c0;
  background: rgba(21, 101, 192, 0.12);
}

.confirm-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.78);
  letter-spacing: 0.02em;
}

.confirm-message {
  margin: 0 0 16px;
  padding-left: 30px;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(0, 0, 0, 0.55);
  white-space: pre-wrap;
  word-break: break-word;
}

.progress-track {
  height: 6px;
  margin: -4px 0 6px 30px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #f9a825, #ff8a65);
  transition: width 0.2s ease;
}

.progress-label {
  margin: 0 0 16px 30px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  min-width: 64px;
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

.btn:active {
  transform: scale(0.97);
}

.btn-ghost {
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
}

.btn-ghost:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.75);
}

.btn-primary {
  color: #fff;
  background: linear-gradient(180deg, #66bb6a 0%, #43a047 100%);
  box-shadow: 0 1px 3px rgba(67, 160, 71, 0.35);
}

.btn-primary:hover {
  background: linear-gradient(180deg, #81c784 0%, #388e3c 100%);
}

/* transitions */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.16s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-pop-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
.confirm-pop-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.confirm-pop-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(4px);
}
.confirm-pop-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(2px);
}
</style>
