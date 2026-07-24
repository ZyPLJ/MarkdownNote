import { Menu, Tray, app, nativeImage, screen } from 'electron'
import { noteManager } from './note-manager'
import { loadResourceImage } from './paths'

let tray: Tray | null = null

/** Pick a tray size that matches the OS scale factor (Windows 100%→16, 150%→24, 200%→32 …). */
function trayPixelSize(): number {
  const scale = screen.getPrimaryDisplay()?.scaleFactor ?? 1
  const target = Math.round(16 * scale)
  // Snap to common sizes so we can load a pre-rendered asset when available
  const sizes = [16, 24, 32, 48, 64]
  return sizes.reduce((best, s) =>
    Math.abs(s - target) < Math.abs(best - target) ? s : best
  )
}

function createTrayIcon(): Electron.NativeImage {
  const size = trayPixelSize()

  // Prefer a pre-rendered size (sharpest), then tray.png, then other icons
  let icon = loadResourceImage(`tray-${size}.png`)
  if (icon.isEmpty()) icon = loadResourceImage('tray.png')
  if (icon.isEmpty()) icon = loadResourceImage('icon.png')
  if (icon.isEmpty()) icon = loadResourceImage('icon.ico')
  if (icon.isEmpty()) icon = loadResourceImage('logo.png')

  if (!icon.isEmpty()) {
    const { width, height } = icon.getSize()
    if (width !== size || height !== size) {
      icon = icon.resize({ width: size, height: size, quality: 'best' })
    }
  }
  return icon
}

export function createTray(): Tray {
  if (tray) return tray

  const icon = createTrayIcon()
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('便签')

  // Keep icon sharp when the user changes display scale
  const refreshIcon = (): void => {
    if (!tray) return
    const next = createTrayIcon()
    if (!next.isEmpty()) tray.setImage(next)
  }
  screen.on('display-metrics-changed', refreshIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '新建便签',
      accelerator: 'CommandOrControl+Alt+N',
      click: () => noteManager.createAndOpen()
    },
    { type: 'separator' },
    {
      label: '便签历史',
      click: () => noteManager.openHistory()
    },
    {
      label: '显示全部',
      click: () => noteManager.showAll()
    },
    {
      label: '隐藏全部',
      click: () => noteManager.hideAll()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        ;(global as { isQuitting?: boolean }).isQuitting = true
        noteManager.destroyAll()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Left-click / double-click → open history (not show-all notes)
  const openHistory = (): void => {
    noteManager.openHistory()
  }
  tray.on('click', openHistory)
  tray.on('double-click', openHistory)

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
