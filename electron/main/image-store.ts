import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'png',
  'image/x-icon': 'png',
  'image/avif': 'png'
}

export function extFromMime(mimeOrExt: string): string {
  const raw = (mimeOrExt || '').toLowerCase().trim()
  if (MIME_TO_EXT[raw]) return MIME_TO_EXT[raw]
  // bare extension like "png" or "jpeg"
  if (raw === 'jpeg') return 'jpg'
  if (raw === 'svg+xml') return 'svg'
  if (/^[a-z0-9]{2,5}$/.test(raw)) return raw
  return 'png'
}

function attachmentsDir(): string {
  const dir = join(app.getPath('userData'), '_attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function saveAttachImage(filename: string, data: string): string {
  const dir = attachmentsDir()
  const base64 = data.replace(/^data:image\/[\w+.-]+;base64,/, '')
  writeFileSync(join(dir, filename), Buffer.from(base64, 'base64'))
  return join(dir, filename)
}

export function resolveAttachPath(filename: string): string {
  // Guard against path traversal — only allow simple filenames
  const safe = filename.replace(/[/\\]/g, '').replace(/\.\./g, '')
  return join(attachmentsDir(), safe)
}
