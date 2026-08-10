# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Windows 桌面 Markdown 便签（产品名「便签」，repo 名 MarkdownNote）。Electron 35 + electron-vite + Vue 3 + Pinia + Tailwind 3，编辑器为 CodeMirror 6，Markdown 渲染用 markdown-it + highlight.js。

- 数据持久化在 Electron `userData`：`%APPDATA%/bianqian/notes.json`（便签数据）与 `%APPDATA%/bianqian/_attachments/`（图片附件）
- 界面文案、代码注释均为中文
- 更完整的产品说明见 `Markdown桌面便签-设计方案.md`

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（electron-vite dev，热更新）
npm run build        # 编译到 out/（main / preload / renderer 三部分）
npm run pack         # 快速目录包：build + electron-builder --dir + rcedit 写图标 → release/win-unpacked/
npm run dist         # NSIS 安装包 → release/MarkdownNote-Setup-<version>.exe
npm run pack:icon    # 单独给已打包 exe 写入图标（需 tools/rcedit-x64.exe）
```

- 无测试、无 lint 脚本
- 类型检查：`npx tsc -b`（根 tsconfig 是 solution 式引用，指向 tsconfig.node.json 与 tsconfig.web.json）
- 打包细节见「Windows 打包」一节

## 架构

electron-vite 三 target 构建（见 `electron.vite.config.ts`），共享类型放在 `electron/shared/`：

```
electron/main/      主进程（out/main）
electron/preload/   contextBridge API（out/preload）
electron/shared/    主/渲染共享的类型与纯函数
src/                Vue 渲染层，两个独立入口（out/renderer）
```

### 主进程（electron/main/）

- **index.ts** — 入口。`attach://` 协议必须在 app ready 前通过 `registerSchemesAsPrivileged` 注册；单实例锁（`second-instance` → 打开历史窗）；全部 `ipcMain.handle`（`note:*` / `notes:*` / `app:*`）；全局快捷键（默认 `Ctrl+Alt+N`，来自 settings）；每次数据变更后向所有窗口广播 `notes:changed`
- **note-manager.ts** — 窗口管理：每个便签一个 `BrowserWindow`（`Map<id, win>`）+ 一个历史窗。窗口 `close` 被拦截为隐藏（除非全局 `isQuitting` 标志）；窗口移动/缩放时同步 bounds 回 store；`restoreVisible()` 决定启动时恢复哪些窗（无便签→欢迎便签；全隐藏→开历史窗）
- **store.ts** — `NoteStore` 同步读写单个 `notes.json`，原子写（先写 `.tmp` 再 rename）；删除是软删除（`deleted: true`），回收站恢复/`purge` 永久清除；`updatedAt` 每次更新都刷新，`title` 由内容经 `deriveTitle` 派生
- **image-store.ts** — 便签图片附件：base64 → 写 `_attachments/`，文件名 `uuid.ext`，MIME 映射 + 防路径穿越
- **tray.ts** — 托盘常驻（`window-all-closed` 为空实现，进程不退出）；图标按 DPI 取 `tray-<size>.png`；托盘点击 → 历史窗
- **paths.ts** — 图标等资源的路径解析，覆盖 dev / 打包后 / cwd 多种情况

### 渲染层（src/）

- **index.html + main.ts + App.vue** — 便签窗，通过 URL 查询参数 `?id=<uuid>` 加载单条便签
- **history.html + history-main.ts + HistoryPanel.vue** — 历史/回收站窗（托盘与 `notes:changed` 触发的实时刷新入口）
- **stores/note.ts** — Pinia store，核心是**乐观保存 + 500ms 防抖**：改动先合并进本地 `note` 和 `pendingPatch`，防抖窗口内多次改动合并成一次 `note:save`；`flushSave()` 在隐藏/退出前落盘
- **lib/markdown.ts** — markdown-it 实例（禁用 html、linkify、breaks、任务列表、highlight.js 按需注册语言），链接加 `target=_blank`
- **components/** — TitleBar / MarkdownPreview / MarkdownEditor（CodeMirror）/ HistoryPanel / ConfirmDialog

### 数据流（跨文件的关键路径）

1. 渲染进程只能通过 preload 暴露的 `window.api`（`contextBridge`）调 IPC
2. 变更统一走 `ipcMain.handle` → `NoteStore`/`NoteManager`，成功后广播 `notes:changed`
3. 历史窗订阅 `notes:changed` 实时刷新；`onNotesChanged` 返回退订函数
4. 图片链路：渲染进程粘贴/拖入 → base64 + MIME 调 `note:save-image` → 主进程存文件并返回 `attach://<uuid>.<ext>` → markdown 中以该 URL 引用 → 主进程 `protocol.handle('attach')` 从磁盘读文件回 MIME

### 关键约定

- 关闭便签窗 = 隐藏（数据保留）；「退出」只走托盘菜单或 `app:quit` IPC（先设 `isQuitting` 绕过 close 拦截）
- `NotePatch` 是部分更新语义，渲染层增量提交；`mode`（preview/edit）也作为 patch 持久化
- 便签窗 `skipTaskbar: false`（要出现在任务栏），历史窗 `skipTaskbar: true`
- 新增渲染层入口时需在 `electron.vite.config.ts` 的 renderer `rollupOptions.input` 注册（现有两个：index、history）

## Windows 打包

- `npm run dist` 走 `scripts/dist-win.mjs`：electron-vite build → electron-builder NSIS。离线环境下优先用 `tools/nsis-3.0.4.1`（`ELECTRON_BUILDER_NSIS_DIR` 指向它），`nsis-*.7z` / `rcedit-x64.exe` 放 `tools/` 会自动解压 seed 缓存
- 不做代码签名：`CSC_IDENTITY_AUTO_DISCOVERY=false`；exe 图标由 `scripts/electron-builder-hooks.cjs`（afterPack）和 `scripts/set-win-icon.mjs` 用本地 rcedit 写入
- 发布：推送 `v*` 标签触发 `.github/workflows/release.yml` 构建 NSIS 安装包并创建 GitHub Release；也可手动运行该工作流
- `resources/` 放运行时资源（tray-16/24/32/48/64.png、icon.png、logo.png），`build/icon.ico` 是安装包/窗口图标
