/**
 * 快速打包（目录包）：
 * 1. electron-vite build
 * 2. electron-builder --dir
 * 3. 用本地 tools/rcedit-x64.exe 写图标
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(projectRoot)

function run(cmd, args, { optional = false, env } = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: env ? { ...process.env, ...env } : process.env
  })
  if (r.status !== 0 && !optional) {
    process.exit(r.status ?? 1)
  }
  return r.status ?? 0
}

const t0 = Date.now()

run('npx', ['electron-vite', 'build'])

// CSC_IDENTITY_AUTO_DISCOVERY=false 跳过代码签名探测，进一步加速
const builderStatus = run('npx', ['electron-builder', '--dir'], {
  optional: true,
  env: {
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }
})

const exeDir = path.join(projectRoot, 'release', 'win-unpacked')
const hasExe =
  fs.existsSync(exeDir) &&
  fs.readdirSync(exeDir).some((f) => f.toLowerCase().endsWith('.exe'))

if (!hasExe) {
  console.error('[pack] 未生成 release/win-unpacked/*.exe，打包失败')
  process.exit(builderStatus || 1)
}

const iconStatus = run('node', ['scripts/set-win-icon.mjs'])
if (iconStatus !== 0) {
  process.exit(iconStatus)
}

if (builderStatus !== 0) {
  console.warn('[pack] electron-builder 返回非零，但 exe 与图标已就绪，可直接使用。')
}

const sec = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`[pack] 完成 (${sec}s) → release/win-unpacked/`)
