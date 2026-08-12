import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type NsisUpdater } from 'electron-updater'
import type { UpdateStatusInfo } from '../shared/types'
import { noteManager } from './note-manager'

// 本轮更新提示固定的目标窗口（下载开始即 pin，保证进度与确认在同一窗口展示）
let targetWindow: BrowserWindow | null = null
// 无窗口可展示时的挂起状态（只保留最新一条）
let pendingStatus: UpdateStatusInfo | null = null

function pickPrimaryWindow(): BrowserWindow | null {
  const hist = noteManager.getHistoryWindow()
  if (hist) return hist
  return noteManager.getLastNoteWindow()
}

function sendUpdateStatus(payload: UpdateStatusInfo): void {
  if (targetWindow && targetWindow.isDestroyed()) {
    targetWindow = null
  }
  if (!targetWindow) {
    targetWindow = pickPrimaryWindow()
    if (!targetWindow) {
      // 全部窗口隐藏（仅托盘运行）→ 挂起，等窗口创建后补发
      pendingStatus = payload
      return
    }
  }
  pendingStatus = null
  // 目标窗口可能是隐藏的便签窗，先亮出来再弹提示
  if (!targetWindow.isVisible()) {
    targetWindow.show()
  }
  targetWindow.focus()
  targetWindow.webContents.send('app:update-status', payload)
}

/**
 * 自动更新：仅启动时检查一次，发现新版后台下载，下载完成提示重启安装。
 * dev / preview（app.isPackaged=false）跳过；检查/下载失败一律静默，不打扰用户。
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  // 用户点了「稍后」之后，退出应用时仍会自动安装（保证更新最终落地）
  autoUpdater.autoInstallOnAppQuit = true
  // 未签名安装包：显式禁用 Authenticode 校验。
  // 6.x 中该属性为函数（返回 null = 校验通过），且仅在 app-update.yml 配置了
  // publisherName 时才会触发——显式覆盖以防将来配置引入 publisherName 后拦截未签名包。
  ;(autoUpdater as unknown as NsisUpdater).verifyUpdateCodeSignature = async () => null

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' })
  })
  autoUpdater.on('update-available', () => {
    // 静默：autoDownload=true 会自动开始后台下载
  })
  autoUpdater.on('download-progress', (p) => {
    sendUpdateStatus({ status: 'downloading', percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    // 无网络 / GitHub 被墙 / 404 / 无 app-update.yml → 一律静默，不打扰
    console.warn('[updater]', err && err.message ? err.message : err)
  })

  // 挂起状态补发：等新窗口渲染完成后再 send（过早 send 会丢消息）
  app.on('browser-window-created', (_e, win) => {
    win.webContents.once('did-finish-load', () => {
      if (pendingStatus) sendUpdateStatus(pendingStatus)
    })
  })

  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:quit-and-install', () => {
    // NSIS assisted 安装器：isSilent 无效，退出后弹出安装向导
    autoUpdater.quitAndInstall()
    return true
  })

  // 仅启动时检查一次；任何失败都吞掉（与 'error' 事件双保险）
  autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[updater] check failed:', err && err.message ? err.message : err)
  })
}
