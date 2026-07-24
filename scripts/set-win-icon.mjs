/**
 * 给 release/win-unpacked/*.exe 写入图标与版本信息。
 *
 * 图标与版本信息由本地 tools/rcedit-x64.exe 写入。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconPath = path.join(root, 'build', 'icon.ico')
const unpacked = path.join(root, 'release', 'win-unpacked')
const localRcedit = path.join(root, 'tools', 'rcedit-x64.exe')

function readPackageMeta() {
  try {
    const require = createRequire(import.meta.url)
    return require(path.join(root, 'package.json'))
  } catch {
    return { productName: '便签', version: '1.0.0', description: '便签' }
  }
}

function findRcedit() {
  if (fs.existsSync(localRcedit)) return localRcedit
  return null
}

function findExe() {
  if (!fs.existsSync(unpacked)) return null
  return (
    fs
      .readdirSync(unpacked)
      .filter((f) => f.toLowerCase().endsWith('.exe'))
      .map((f) => path.join(unpacked, f))
      .find((f) => !/uninstall/i.test(f)) || null
  )
}

const rcedit = findRcedit()
const exe = findExe()
const pkg = readPackageMeta()
const productName = pkg.build?.productName || pkg.productName || pkg.name || '便签'
const version = pkg.version || '1.0.0'
const description = pkg.description || productName

if (!fs.existsSync(iconPath)) {
  console.error('[set-win-icon] 找不到图标:', iconPath)
  process.exit(1)
}
if (!exe) {
  console.error('[set-win-icon] 找不到 exe:', unpacked)
  process.exit(1)
}
if (!rcedit) {
  console.error(
    '[set-win-icon] 找不到 rcedit-x64.exe。\n' +
      '请确认 tools/rcedit-x64.exe 存在。'
  )
  process.exit(1)
}

console.log('[set-win-icon] rcedit:', rcedit)
console.log('[set-win-icon] exe   :', exe)
console.log('[set-win-icon] icon  :', iconPath)

execFileSync(rcedit, [exe, '--set-icon', iconPath], { stdio: 'inherit' })
execFileSync(
  rcedit,
  [
    exe,
    '--set-version-string',
    'ProductName',
    productName,
    '--set-version-string',
    'FileDescription',
    description,
    '--set-version-string',
    'CompanyName',
    pkg.author || '',
    '--set-version-string',
    'LegalCopyright',
    `Copyright © ${new Date().getFullYear()} ${pkg.author || ''}`,
    '--set-file-version',
    version,
    '--set-product-version',
    version
  ],
  { stdio: 'inherit' }
)

console.log('[set-win-icon] 图标与版本信息已写入')
