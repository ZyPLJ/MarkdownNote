# Windows Markdown 桌面便签 — 设计方案

> 应用名：**便签**
> 状态：一期完成，二期核心能力完成（历史 + 图片）
> 创建：2026-07-17
> 更新：2026-07-20

---

## 0. 已确认决策

| 项 | 决策 |
|----|------|
| 技术栈 | **Electron + Vue 3 + TypeScript** |
| 编辑体验 | **A. 预览为主** — 双击内容区进入编辑，`Esc` 回预览；`Ctrl+E` 切换 |
| 关闭行为 | **隐藏**（不删除数据；删除需单独操作） |
| 应用名 | **便签** |
| 历史面板视觉 | **与便签本体同语言** — 暖色底、色条标题栏、列表项为迷你色卡 |
| 删除策略 | **软删除** → 回收站可恢复；永久清除需二次确认 |

---

## 1. 产品定位

做一个**轻量、始终置顶、支持 Markdown 实时预览**的 Windows 桌面便签，对标「系统便签 + Typora 的极简子集」，不做成完整笔记软件。

| 维度 | 目标 |
|------|------|
| 场景 | 贴在桌面、快速记录、Markdown 预览、截图粘贴 |
| 量级 | 本地单机，便签数量 < 200 即可 |
| 不做（一期） | 云同步、协作、复杂文件夹、插件市场、开机自启 |

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 壳 | **Electron** | Node 环境已具备；Windows 桌面窗口/托盘/置顶成熟；Markdown 生态好 |
| UI | **Vue 3 + TypeScript** | 响应式强，多窗口组件复用方便 |
| 状态 | Pinia | 单便签窗口内状态管理 |
| Markdown | `markdown-it` + `highlight.js` + `markdown-it-task-lists` | 轻、可扩展 |
| 编辑器 | **CodeMirror 6**（源码模式） | 比 textarea 体验好，比 Monaco 轻 |
| 样式 | Tailwind CSS + CSS 变量（`--note-bg/bar/border`） | 主题色与历史色卡复用 |
| 持久化 | 本地 JSON（`app.getPath('userData')`） | 零依赖、易备份 |
| 打包 | electron-builder → NSIS 安装包 | 一键生成 `.exe` |

### 备选方案对照（已弃用）

| 方案 | 弃用原因 |
|------|----------|
| Tauri | 需装 Rust；当前环境无，上手成本高；后期可再评估减体积 |
| WPF / WinUI | Markdown 渲染与实时预览开发慢 |
| Python + PyQt | 体积与 UI 精致度不如 Electron 生态 |
| 纯 Win32 + WebView2 | 工程基建都要自写，性价比低 |

---

## 3. 功能规划

### MVP（一期）✅ 已完成

1. **多便签窗口**
   - 每个便签独立无边框窗口
   - 可拖拽移动、右下角缩放
   - 置顶 / 取消置顶
   - 透明度调节（约 0.5–1.0）

2. **Markdown 交互（方案 A）**
   - 默认 **预览模式**（渲染后的 HTML）
   - **双击内容区** → 进入编辑（CodeMirror 源码）
   - **`Esc`** → 回到预览
   - **`Ctrl+E`** → 切换编辑/预览

3. **支持语法**
   - 标题、粗斜体、删除线
   - 有序/无序列表、任务列表 `- [ ]`
   - 代码块 + 语法高亮
   - 链接、引用、表格、分割线
   - 行内代码、图片（`attach://`）

4. **便签管理**
   - 新建 / 软删除 / 复制
   - 颜色主题：黄 / 粉 / 蓝 / 绿 / 紫 / 灰
   - 标题（取第一行 `#` 标题，否则取正文前 20 字）
   - 自动保存（防抖 500ms）
   - 字数统计（不含空格）

5. **系统集成**
   - 托盘图标：新建、便签历史、显示/隐藏全部、退出
   - 全局热键 `Ctrl+Alt+N` 新建便签
   - 关闭按钮 = **隐藏便签**（数据保留）

6. **数据**
   - 路径：`%APPDATA%/bianqian/notes.json`
   - 软删除：`deleted: true`，历史面板回收站可恢复 / 永久清除
   - 见第 5 节数据模型

### 二期 ✅ 核心已完成

- ~~便签历史列表面板~~ ✅
  - 搜索（标题 + 摘要）
  - 全部 / 回收站双 Tab
  - 迷你色卡列表、显示中/已隐藏状态
  - 恢复 / 永久清除 / 清空回收站
  - `notes:changed` 广播实时刷新
  - 视觉与便签本体对齐（暖色底 + 色条标题栏）
- ~~图片粘贴~~ ✅
  - 编辑态 / 预览态均可粘贴或拖入
  - 多图顺序插入
  - 大图自动缩放 / 转 JPEG（GIF/SVG 原样）
  - MIME → 扩展名修正；`attach://` 特权协议 + 路径穿越防护
- 导出单条为 `.md` / 全部备份 zip — ⏳
- 开机自启 — ⏳
- 暗色/亮色跟随系统 — ⏳
- 全文搜索（跨便签正文，不仅历史摘要）— ⏳

### 三期（可选）

- 文件夹/标签分类
- 快捷短语 / 模板
- 简易同步（OneDrive 目录或 WebDAV）
- 迁移到 Tauri 减体积

---

## 4. 信息架构与窗口模型

```
主进程 (main)
├── Tray（托盘）
├── NoteManager（便签生命周期 + 历史窗）
├── NoteStore（notes.json 读写 / 软删 / 恢复 / 永久清除）
├── ImageStore（_attachments/ + MIME 扩展名）
├── GlobalShortcut
├── ProtocolHandler（attach://，registerSchemesAsPrivileged）
└── 多个 BrowserWindow（每个便签一个 + 历史面板）

渲染进程 · 便签窗
├── TitleBar（颜色/置顶/透明度/历史/菜单/隐藏）
├── MarkdownPreview（默认；支持粘贴/拖入图片）
├── MarkdownEditor（CodeMirror 6；粘贴/拖入 + 压缩）
└── IPC ↔ main

渲染进程 · 历史窗
├── HistoryPanel（搜索 / Tab / 迷你色卡列表 / 回收站）
└── onNotesChanged 实时刷新
```

**交互要点**

- 无边框 + 自定义标题栏（拖拽区）
- 关闭 = **隐藏**到托盘，不是退出应用，也不是删除
- 双击托盘 = 显示全部**未删除**便签
- 删除：菜单「删除」二次确认 → 软删除；可在历史 → 回收站恢复
- 永久清除：仅回收站内，二次确认后从 `notes.json` 移除
- 图片：预览/编辑均可 `Ctrl+V` 或拖入 → `_attachments/` → 插入 `![alt](attach://uuid.ext)`
- 历史列表变更后主进程广播 `notes:changed`，所有窗口可订阅刷新

---

## 5. 数据模型

```json
{
  "version": 1,
  "settings": {
    "globalHotkey": "CommandOrControl+Alt+N",
    "defaultColor": "yellow",
    "defaultOpacity": 0.95,
    "closeBehavior": "hide"
  },
  "notes": [
    {
      "id": "uuid",
      "title": "会议待办",
      "content": "# 会议待办\n- [ ] 写方案\n![截图](attach://uuid.jpg)",
      "color": "yellow",
      "opacity": 0.95,
      "alwaysOnTop": true,
      "mode": "preview",
      "bounds": { "x": 100, "y": 100, "width": 320, "height": 280 },
      "createdAt": "2026-07-17T09:00:00.000Z",
      "updatedAt": "2026-07-17T10:00:00.000Z",
      "visible": true,
      "deleted": false
    }
  ]
}
```

### 列表摘要 `NoteSummary`（IPC `notes:list` 返回）

| 字段 | 说明 |
|------|------|
| `id` / `title` / `color` | 基础展示 |
| `snippet` | `deriveSnippet(content)`：跳过标题行后的首段摘要（约 72 字） |
| `updatedAt` / `createdAt` | 时间 |
| `visible` / `deleted` | 显示状态 / 软删标记 |

**持久化约定**

- 写入：防抖 500ms + 原子写（写临时文件再 rename），避免半截 JSON
- 启动：读文件 → 恢复所有 `visible: true && !deleted` 的窗口
- 软删除：`deleted: true` + `visible: false`；数据仍在 `notes.json`
- 恢复：`deleted: false`；可选立即 `openNote`
- 永久清除：从 `notes` 数组 `splice` 掉（仅允许已 `deleted` 的项）
- 存储路径：`app.getPath('userData')/notes.json`
- 图片附件：`app.getPath('userData')/_attachments/`

---

## 6. 界面草图

### 单便签

```
┌─────────────────────────────────────────────┐
│ ▌ 会议待办          🎨 📌 ◐ 📋 ⋯ ✕         │  ← 色条标题栏（✕ = 隐藏）
├─────────────────────────────────────────────┤
│ # 会议待办                                   │
│                                             │
│ - [x] 梳理需求                               │
│ - [ ] 写技术方案                             │
│                                             │
│ ┌─────────────────┐                         │
│ │   粘贴的截图     │                         │
│ └─────────────────┘                         │
│                                             │
│   预览 · 双击编辑 · 可粘贴图片      128 字   │
└─────────────────────────────────────────────┘
```

### 便签历史（与本体同视觉语言）

```
┌──────────────────────────────────┐
│ ▌ 便签历史              ＋新建 ✕ │  ← note-yellow 标题栏
├──────────────────────────────────┤
│  ⌕  搜索标题或摘要…              │
│  [全部 3]  [回收站 1]            │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │▌ 会议待办          2 分钟前  │ │  ← 迷你色卡（各色 note-bg）
│ │  梳理需求、写技术方案…       │ │
│ │  显示中                      │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │▌ 购物清单              昨天  │ │
│ │  牛奶 鸡蛋 面包              │ │
│ │  已隐藏                      │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ 2 条          Ctrl+F 搜索 · Esc  │
└──────────────────────────────────┘
```

**视觉约定**

| 元素 | 做法 |
|------|------|
| 外壳 | `note-yellow` + `rounded-md border shadow-md`，窗口 `backgroundColor: #fff9c4` |
| 标题栏 | 与 `TitleBar.vue` 相同：`h-9` + `color-mix(note-bar, note-bg)` + 左侧 accent bar |
| 列表项 | `note-{color}` 底 + 左侧 `var(--note-bar)` 色条 + 轻阴影 |
| 状态徽标 | 「显示中」用当前色 `note-bar` 混色；「已隐藏」半透明黑 |
| 页脚 | 与便签 footer 同高 `h-6`、同 border 变量 |
| CSS 变量 | `--note-bg` / `--note-bar` / `--note-border`（见 `main.css`） |

---

## 7. 项目结构

```
便签/
├── package.json
├── electron.vite.config.ts
├── electron/
│   ├── main/
│   │   ├── index.ts            # IPC / 协议 / 热键 / notes:changed 广播
│   │   ├── store.ts            # notes.json；create/update/软删/恢复/永久清除
│   │   ├── note-manager.ts     # 便签窗 + 历史窗生命周期
│   │   ├── tray.ts             # 系统托盘
│   │   └── image-store.ts      # _attachments/；MIME→扩展名；路径安全
│   ├── preload/
│   │   └── index.ts            # contextBridge API + onNotesChanged
│   └── shared/
│       └── types.ts            # Note / NoteSummary / deriveTitle / deriveSnippet
├── src/
│   ├── main.ts                 # 便签窗 Vue 入口
│   ├── history-main.ts         # 历史窗 Vue 入口
│   ├── App.vue                 # 单便签根组件（状态 toast、预览贴图）
│   ├── index.html / history.html
│   ├── components/
│   │   ├── TitleBar.vue
│   │   ├── MarkdownEditor.vue  # CM6 + 粘贴/拖入 + 压缩
│   │   ├── MarkdownPreview.vue # 渲染 + 双击编辑 + 粘贴/拖入
│   │   └── HistoryPanel.vue    # 历史列表（色卡 UI）
│   ├── stores/note.ts
│   ├── lib/markdown.ts
│   └── styles/main.css         # 主题变量 + 预览排版
├── resources/
├── Markdown桌面便签-设计方案.md  # 本文档
└── README.md
```

---

## 8. 关键技术点

| 点 | 做法 |
|----|------|
| 无边框拖拽 | `-webkit-app-region: drag` + 按钮区域 `no-drag` |
| 多窗口状态 | 主进程为 SSOT；渲染进程通过 IPC 读写 |
| 自动保存 | 渲染进程 `debounce(500)` → `note:save` → 主进程原子写 |
| 置顶 | `win.setAlwaysOnTop(true, 'floating')` |
| 透明度 | `win.setOpacity(n)` |
| Markdown XSS | `markdown-it` `html: false` 默认转义 |
| 关闭=隐藏 | `close` 事件 `preventDefault` + `win.hide()` + `visible: false` |
| 软删除 / 恢复 / 清除 | `deleted` 标记；`restoreNote` / `purgeNote` / `purgeAllDeleted` |
| 列表实时刷新 | 主进程 `webContents.send('notes:changed')`；preload `onNotesChanged` |
| 图片粘贴 | Clipboard / Drop → 可选 canvas 压缩 → `note:save-image` → `attach://` |
| 图片压缩 | 边长 >1600 或体积 >400KB 时缩放；无透明转 JPEG 0.82；GIF/SVG 跳过 |
| 图片协议 | `protocol.registerSchemesAsPrivileged` + `protocol.handle('attach')`；文件名消毒 |
| 历史视觉 | 复用 `note-*` CSS 变量；列表项动态 `note-{color}` class |

### IPC 接口

| 通道 | 方向 | 说明 |
|------|------|------|
| `note:get` | r→m | 按 id 取便签 |
| `note:save` | r→m | 保存 patch；广播 `notes:changed` |
| `note:create` | r/tray→m | 新建并开窗；广播 |
| `note:hide` | r→m | 隐藏当前窗；广播 |
| `note:delete` | r→m | 软删除；广播 |
| `note:restore` | r→m | 从回收站恢复 |
| `note:purge` | r→m | 永久删除单条（须已 soft-deleted） |
| `notes:purge-deleted` | r→m | 清空回收站，返回清除数量 |
| `note:duplicate` | r→m | 复制并开窗 |
| `note:open` | r→m | 打开/聚焦指定便签（忽略已删除） |
| `note:save-image` | r→m | 存图，入参 `(dataUrl, mimeOrExt)`，返回 `attach://…` |
| `note:set-always-on-top` | r→m | 置顶 |
| `note:set-opacity` | r→m | 透明度 |
| `note:set-color` | r→m | 颜色；广播 |
| `notes:list` | r→m | `NoteSummary[]`；`{ includeDeleted?: boolean }` |
| `notes:show-all` / `notes:hide-all` | tray/r→m | 显示/隐藏全部未删除 |
| `notes:changed` | m→r | 事件推送（非 invoke） |
| `app:open-history` / `app:close-history` | r→m | 历史窗 |
| `app:quit` | tray→m | 退出 |

### Preload API 摘要（`window.api`）

`getNote` · `saveNote` · `createNote` · `hideNote` · `deleteNote` · `restoreNote` · `purgeNote` · `purgeAllDeleted` · `duplicateNote` · `setAlwaysOnTop` · `setOpacity` · `setColor` · `showAll` · `hideAll` · `getAllNotes` · `openNote` · `saveImage` · `openHistory` · `closeHistory` · `onNotesChanged` · `quit`

---

## 9. 开发进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 脚手架 | Electron + Vue 3 + TS + electron-vite | ✅ |
| 单便签窗口 | TitleBar + Preview + Editor | ✅ |
| 自动保存 | 防抖 500ms + 原子写 | ✅ |
| 多窗口管理 | 颜色、置顶、透明度、恢复布局 | ✅ |
| 系统集成 | 托盘、全局热键、打包 | ✅ |
| 便签历史 v1 | 列表、打开、软删除 | ✅ |
| 图片粘贴 v1 | Clipboard、`_attachments/`、`attach://` | ✅ |
| 历史增强 | 搜索 / 回收站 / 恢复清除 / 实时刷新 | ✅ |
| 历史视觉对齐 | 暖色外壳 + 迷你色卡列表 | ✅ |
| 图片增强 | 预览粘贴、拖入、多图、压缩、MIME 修正 | ✅ |
| 导出 | 单条 `.md` / 全部备份 zip | ⏳ |
| 开机自启 | `app.setLoginItemSettings` | ⏳ |
| 暗色模式 | 跟随系统 | ⏳ |
| 全文搜索 | 跨便签正文（不仅历史摘要） | ⏳ |

---

## 10. 风险与取舍

1. **Electron 体积大（约 80–120MB）** — 一期接受；后期可评估 Tauri
2. **多窗口内存** — 每个窗口一个渲染进程；控制在几十个便签内可接受
3. **Markdown 范围** — 不追求完整扩展，够日常记录即可
4. **数据安全** — 仅本地明文 JSON；不做加密（除非后续明确需要）
5. **关闭易误解** — UI 上关闭提示「隐藏」，删除走菜单 + 回收站
6. **图片存储** — `attach://` 而非 `file://`，避免路径编码与 CSP 问题；大图压缩控制 userData 体积
7. **永久清除不可逆** — 仅回收站提供，且二次确认；附件文件暂不随 purge 清理（后续可加 GC）

---

## 11. 默认配置汇总

| 项 | 值 |
|----|-----|
| 应用名 | 便签 |
| 框架 | Electron + Vue 3 + TS |
| 编辑器 | CodeMirror 6 |
| 默认模式 | 预览（双击进编辑，`Esc` 回预览） |
| 关闭按钮 | 隐藏便签 |
| 删除方式 | 软删除 → 历史回收站可恢复 / 永久清除 |
| 默认色 | 淡黄 `yellow`（`#fff9c4`） |
| 默认置顶 | 开 |
| 默认透明度 | 0.95 |
| 新建热键 | `Ctrl+Alt+N` |
| 历史搜索 | `Ctrl+F`（历史窗内） |
| 图片 | `attach://`，`_attachments/`；>1600px 或 >400KB 压缩 |
| 历史窗默认尺寸 | 360 × 500，底色 `#fff9c4` |
| 同步 | 不做 |

---

## 12. 下一步

1. 导出功能（单条 `.md` / 全部备份 zip，含附件）
2. 开机自启
3. 暗色/亮色跟随系统
4. 全文搜索（跨便签正文）
5. 附件 GC：永久清除便签时清理未引用图片

---

*基于本地需求讨论整理。实现以本文档与代码为准；文档随迭代同步更新。*
