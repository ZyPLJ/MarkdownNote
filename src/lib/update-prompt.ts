import { createApp, h, ref, type App } from 'vue'
import UpdatePrompt from '../components/UpdatePrompt.vue'

type PromptState =
  | { mode: 'downloading'; percent: number }
  | { mode: 'downloaded'; version: string }

let mounted = false // 模块级：同一渲染进程只初始化一次
let instance: { app: App; host: HTMLElement } | null = null
const state = ref<PromptState | null>(null) // 响应式驱动组件状态切换
const currentVersion = ref('')

function render(): void {
  if (state.value === null) return
  if (instance) return // 已挂载：根 render 追踪 state，进度推进自动重渲染
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render() {
      // 局部解构：既收窄联合类型，又保持对 state/currentVersion 的响应式追踪
      const s = state.value
      if (s === null) return null
      return h(UpdatePrompt, {
        mode: s.mode,
        percent: s.mode === 'downloading' ? s.percent : 0,
        version: s.mode === 'downloaded' ? s.version : undefined,
        currentVersion: currentVersion.value,
        onClose: dismiss,
        onCancel: dismiss,
        onConfirm: () => {
          dismiss()
          // 应用随即退出，无需等待
          void window.api.quitAndInstall()
        }
      })
    }
  })
  instance = { app, host }
  app.mount(host)
}

function dismiss(): void {
  if (!instance) return
  const { app, host } = instance
  instance = null
  // allow leave transition to paint before unmount
  setTimeout(() => {
    app.unmount()
    host.remove()
  }, 160)
}

/**
 * 订阅自动更新状态并弹出提示（便签窗 / 历史窗各调一次）。
 * checking / error 静默；主进程只向主窗口广播，此模块再兜底去重。
 */
export function setupUpdatePrompt(): void {
  if (mounted) return
  mounted = true

  window.api.getAppVersion().then((v) => {
    currentVersion.value = v
  })

  window.api.onUpdateStatus((info) => {
    switch (info.status) {
      case 'downloading':
        state.value = { mode: 'downloading', percent: info.percent }
        render()
        break
      case 'downloaded':
        state.value = { mode: 'downloaded', version: info.version }
        render()
        break
      case 'checking':
      case 'error':
        // 启动检查/失败一律静默
        break
    }
  })
}
