/**
 * 打安装包（nsis）。
 *
 * 离线策略：
 * - win.signAndEditExecutable=false
 * - ELECTRON_BUILDER_NSIS_DIR → 使用 tools/nsis-3.0.4.1（本地已解压）
 * - afterPack + set-win-icon → 本地 rcedit 写图标
 *
 * 若仍提示下载 nsis-resources，请把 nsis-resources-3.4.1.7z
 * 放到 tools/ 下后重新运行（脚本会自动解压并 seed 缓存）。
 */
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(projectRoot)

const toolsDir = path.join(projectRoot, 'tools')
const nsisDir = path.join(toolsDir, 'nsis-3.0.4.1')
const nsis7z = path.join(toolsDir, 'nsis-3.0.4.1.7z')
const nsisResources7z = path.join(toolsDir, 'nsis-resources-3.4.1.7z')
// also accept if user left it in resources by mistake
const nsisResources7zAlt = path.join(projectRoot, 'resources', 'nsis-resources-3.4.1.7z')

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

/**
 * Resolve local NSIS if present. Returns null when missing so electron-builder
 * can download it (CI / online). Offline local builds should ship tools/*.7z.
 */
function ensureNsisExtracted() {
  const makensis = path.join(nsisDir, 'makensis.exe')
  if (fs.existsSync(makensis)) return nsisDir

  if (!fs.existsSync(nsis7z)) {
    console.warn(
      '[dist] 未找到本地 NSIS（tools/nsis-3.0.4.1 或 tools/nsis-3.0.4.1.7z）。\n' +
        '  将回退到 electron-builder 默认下载（需联网，适合 CI）。'
    )
    return null
  }

  console.log('[dist] 解压本地 NSIS →', nsisDir)
  fs.mkdirSync(nsisDir, { recursive: true })
  const seven = path.join(
    projectRoot,
    'node_modules',
    '7zip-bin',
    'win',
    'x64',
    '7za.exe'
  )
  const r = spawnSync(seven, ['x', '-bd', `-o${nsisDir}`, nsis7z], { stdio: 'inherit' })
  if (r.status !== 0 || !fs.existsSync(makensis)) {
    console.warn('[dist] 解压 NSIS 失败，回退到 electron-builder 默认下载')
    return null
  }
  return nsisDir
}

/**
 * 若本地有 nsis-resources 压缩包，启动临时 HTTP 镜像，
 * 让 electron-builder 从本机取，而不是 GitHub。
 * 返回 { server, env } 或 null。
 */
function maybeStartLocalMirror() {
  const res7z = fs.existsSync(nsisResources7z)
    ? nsisResources7z
    : fs.existsSync(nsisResources7zAlt)
      ? nsisResources7zAlt
      : null

  // 即使没有 nsis-resources，也可以用本地 nsis 7z 作为镜像（NSIS 已用 ELECTRON_BUILDER_NSIS_DIR）
  // 但 nsis-resources 若缺失，builder 仍会去 GitHub。这里尽量提供本地服务。
  const files = new Map()
  if (fs.existsSync(nsis7z)) {
    files.set('/nsis-3.0.4.1/nsis-3.0.4.1.7z', nsis7z)
  }
  if (res7z) {
    files.set('/nsis-resources-3.4.1/nsis-resources-3.4.1.7z', res7z)
  }

  if (files.size === 0) return null

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '').split('?')[0])
    // 兼容带/不带前导斜杠，以及 builder 拼接时可能的重复段
    const normalized = urlPath.replace(/^\/+/, '')
    const file = files.get(urlPath) || files.get(`/${normalized}`)
    console.log(`[mirror] ${req.method} ${urlPath} → ${file ? 'HIT' : 'MISS'}`)
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const data = fs.readFileSync(file)
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.length
    })
    res.end(data)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const mirror = `http://127.0.0.1:${port}/`
      console.log('[dist] 本地二进制镜像:', mirror)
      if (!res7z) {
        console.warn(
          '[dist] 未找到 tools/nsis-resources-3.4.1.7z，nsis-resources 仍可能从 GitHub 下载。\n' +
            '  下载地址: https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z\n' +
            '  放到: tools/nsis-resources-3.4.1.7z'
        )
      }
      resolve({
        server,
        env: {
          ELECTRON_BUILDER_BINARIES_MIRROR: mirror
        }
      })
    })
  })
}

/**
 * 把本地 nsis-resources 7z 解压到 electron-builder 缓存，
 * 这样即使没种过缓存、不联网也能直接打包，不会卡在 GitHub。
 * electron-builder 25.x 实际读取的是 nsis/nsis-resources-3.4.1（含 plugins/）。
 */
function seedNsisResourcesCache(res7z) {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    console.warn('[dist] LOCALAPPDATA 未设置，跳过 nsis-resources 缓存 seed')
    return
  }
  const cacheRoot = path.join(localAppData, 'electron-builder', 'Cache')
  // app-builder 解压后会把内容放在 .../nsis/nsis-resources-3.4.1/ 供打包直接用。
  const targets = [
    path.join(cacheRoot, 'nsis-resources', 'nsis-resources-3.4.1'),
    path.join(cacheRoot, 'nsis', 'nsis-resources-3.4.1')
  ]

  // 已 seed 过（含 plugins 目录）就跳过
  const allSeeded = targets.every((t) => fs.existsSync(path.join(t, 'plugins')))
  if (allSeeded) {
    console.log('[dist] nsis-resources 缓存已就位，跳过 seed')
    return
  }

  if (!fs.existsSync(res7z)) {
    console.warn(`[dist] 找不到 ${res7z}，无法 seed 缓存，可能仍需联网下载`)
    return
  }

  const seven = path.join(projectRoot, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  for (const target of targets) {
    const pluginsDir = path.join(target, 'plugins')
    if (fs.existsSync(pluginsDir)) continue
    console.log('[dist] seed nsis-resources 缓存 →', target)
    fs.mkdirSync(target, { recursive: true })
    const r = spawnSync(seven, ['x', '-bd', '-y', `-o${target}`, res7z], { stdio: 'inherit' })
    if (r.status !== 0 || !fs.existsSync(pluginsDir)) {
      console.warn(`[dist] seed 到 ${target} 失败`)
    }
  }
}

const t0 = Date.now()

const resolvedNsisDir = ensureNsisExtracted()
if (resolvedNsisDir) {
  console.log('[dist] ELECTRON_BUILDER_NSIS_DIR =', resolvedNsisDir)
} else {
  console.log('[dist] ELECTRON_BUILDER_NSIS_DIR 未设置（使用 builder 默认）')
}

// 若本地有 nsis-resources 7z，先 seed 缓存，避免任何联网下载
const res7zForSeed = fs.existsSync(nsisResources7z)
  ? nsisResources7z
  : fs.existsSync(nsisResources7zAlt)
    ? nsisResources7zAlt
    : null
if (res7zForSeed) seedNsisResourcesCache(res7zForSeed)

run('npx', ['electron-vite', 'build'])

const mirror = resolvedNsisDir || res7zForSeed ? await maybeStartLocalMirror() : null

const env = {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ...(resolvedNsisDir ? { ELECTRON_BUILDER_NSIS_DIR: resolvedNsisDir } : {}),
  ...(mirror?.env || {})
}

const builderStatus = run('npx', ['electron-builder', '--win'], {
  optional: true,
  env
})

if (mirror?.server) {
  mirror.server.close()
}

// afterPack 已写一次；兜底再写
const exeDir = path.join(projectRoot, 'release', 'win-unpacked')
if (fs.existsSync(exeDir)) {
  run('node', ['scripts/set-win-icon.mjs'], { optional: true })
}

const releaseDir = path.join(projectRoot, 'release')
const hasSetup =
  fs.existsSync(releaseDir) &&
  fs.readdirSync(releaseDir).some((f) => /Setup.*\.exe$/i.test(f) || (/\.exe$/i.test(f) && !f.includes('unpacked')))

const hasUnpacked = fs.existsSync(exeDir)

if (!hasUnpacked && !hasSetup) {
  console.error('[dist] 未生成任何产物')
  process.exit(builderStatus || 1)
}

if (builderStatus !== 0) {
  console.warn('[dist] electron-builder 返回非零。release/ 现有文件：')
  if (fs.existsSync(releaseDir)) {
    for (const f of fs.readdirSync(releaseDir)) console.warn('  -', f)
  }
}

const sec = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`[dist] 完成 (${sec}s) → release/`)
if (hasSetup) {
  const setups = fs.readdirSync(releaseDir).filter((f) => /\.exe$/i.test(f) && !fs.statSync(path.join(releaseDir, f)).isDirectory())
  for (const s of setups) console.log('  安装包:', path.join(releaseDir, s))
}
