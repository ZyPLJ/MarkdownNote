/**
 * electron-builder afterPack hook：在打包出 exe 后立刻写图标。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const root = context.packager.projectDir
  const iconPath = path.join(root, 'build', 'icon.ico')
  const rcedit = path.join(root, 'tools', 'rcedit-x64.exe')
  const appOutDir = context.appOutDir
  const productFilename = context.packager.appInfo.productFilename
  const exe = path.join(appOutDir, `${productFilename}.exe`)

  if (!fs.existsSync(rcedit)) {
    console.warn('[afterPack] 找不到 tools/rcedit-x64.exe，跳过写图标')
    return
  }
  if (!fs.existsSync(exe)) {
    console.warn('[afterPack] 找不到 exe:', exe)
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] 找不到图标:', iconPath)
    return
  }

  console.log('[afterPack] 写入图标 →', exe)
  execFileSync(rcedit, [exe, '--set-icon', iconPath], { stdio: 'inherit' })
}
