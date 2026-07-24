import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

function resourceCandidates(...parts: string[]): string[] {
  const list: string[] = []
  // Packaged: extraResources → process.resourcesPath/resources
  if (process.resourcesPath) {
    list.push(join(process.resourcesPath, 'resources', ...parts))
    list.push(join(process.resourcesPath, ...parts))
  }
  // Dev / asar-unpacked relative to compiled main (out/main → ../../resources)
  list.push(join(__dirname, '../../resources', ...parts))
  // app.getAppPath() — project root in dev, app.asar root when packaged
  try {
    list.push(join(app.getAppPath(), 'resources', ...parts))
  } catch {
    // app may not be ready yet
  }
  // CWD fallback (npm run dev from project root)
  list.push(join(process.cwd(), 'resources', ...parts))
  return list
}

export function resolveResource(...parts: string[]): string | null {
  for (const p of resourceCandidates(...parts)) {
    if (existsSync(p)) return p
  }
  return null
}

export function loadResourceImage(...parts: string[]): NativeImage {
  for (const p of resourceCandidates(...parts)) {
    try {
      if (!existsSync(p)) continue
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    } catch {
      // try next
    }
  }
  return nativeImage.createEmpty()
}

/** Window / taskbar icon. Prefer .ico on Windows for crisp taskbar rendering. */
export function getAppIcon(): NativeImage {
  if (process.platform === 'win32') {
    const ico = loadResourceImage('icon.ico')
    if (!ico.isEmpty()) return ico
  }
  const png = loadResourceImage('icon.png')
  if (!png.isEmpty()) return png
  return loadResourceImage('logo.png')
}

/** Absolute path to icon for BrowserWindow `icon` option (string path is more reliable on Windows). */
export function getAppIconPath(): string | undefined {
  if (process.platform === 'win32') {
    const ico = resolveResource('icon.ico')
    if (ico) return ico
  }
  return (
    resolveResource('icon.png') ||
    resolveResource('logo.png') ||
    undefined
  )
}
