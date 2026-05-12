# 桌面播放器 MVP 实施方案

## 1. 一句话目标

做一个适配 Windows / macOS 的个人桌面播放器：界面有明显的交互感和“设备感”，首版先完成桌面壳、播放器体验、以及可扩展的 API bridge 合同层，不在这一轮接入真实第三方能力。

## 2. 边界与成功标准

### 边界

- 首版只做单窗口桌面播放器，不做多页面后台系统。
- 首版不直接打通网易云、Claude、CosyVoice、飞书、天气、UPnP 的真实接口。
- 这一轮只把 bridge 的调用协议、状态展示、mock 数据和可替换适配层搭好，后续由你配合补真实 API。
- 不做账号体系、云同步、自动更新、歌词版权策略等延伸能力。

### 成功标准

用户打开应用后，可以在 Win/mac 开发环境里看到一个完整可交互的桌面播放器，并完成下面的最短闭环：

1. 进入后看到有风格、有层次的播放器首页。
2. 可以播放 / 暂停 / 切歌 / 拖动进度 / 调整音量。
3. 可以看到播放队列、当前歌曲信息、设备状态和 bridge 状态。
4. 所有需要未来接 API 的位置，都已经通过统一 bridge 接口隔离。
5. 项目可以本地构建通过，桌面壳可同时面向 Windows / macOS 打包。

## 3. CEO Review（产品思考）

### 业务价值

- 这不是“平台级播放器”，而是“个人 AI 电台 / 私人听歌工作台”。
- 核心价值不在曲库规模，而在于把音乐播放、氛围信息、未来的 AI 编排能力，收敛到一个顺手的桌面入口。
- 因为是个人使用，优先级应当是：顺手 > 好看 > 可扩展 > 大而全。

### 用户核心路径

1. 打开播放器。
2. 直接看到正在播放的内容和下一首队列。
3. 一眼确认当前桥接状态：哪些能力已接、哪些能力待接。
4. 用很少的操作完成听歌控制，并且感受到界面的动态反馈。

### Edge Cases

- 没有歌曲时，要有空状态，不是空白页。
- bridge 未连接时，要能继续用 mock 数据，不阻塞 UI。
- 音频资源不可用时，要给出明确错误态。
- 窗口缩小时，布局要优雅降级，不出现不可点控件。
- Windows 与 macOS 的窗口头部交互要尽量统一，但不强行伪装成同一种系统。

### 产品参考矩阵

- 参考图里的结构：播放器界面 + 本地 Node 中枢 + 多 API 分工。
- 参考桌面软件的“设备感”：让控件像一个真实控制台，而不是网页卡片堆叠。
- 避免做成通用后台面板或普通音乐网站。

## 4. 视觉方向（Frontend Design）

### Aesthetic Name

Midnight Control Deck（午夜控制台）

### 设计意图

- 主体气质：深色、温暖、带一点模拟设备的控制台感。
- 记忆点：大面积暗色基底 + 发光进度轨道 + 像硬件面板一样的按钮和状态条。
- 目标感受：打开 3 秒内就知道这是一个“私人工作台播放器”，不是网页模板。

### DFII

- Aesthetic Impact: 4
- Context Fit: 5
- Implementation Feasibility: 5
- Performance Safety: 4
- Consistency Risk: 2

**DFII = 16 - 2 = 14**

### 设计系统快照

- Display Font：有存在感的标题字体，用于播放器标题和数字时间。
- Body Font：简洁耐读的正文无衬线字体，用于信息和按钮。
- 主色：炭黑 / 墨蓝。
- 强调色：暖橙或铜色，用于播放进度、激活态和桥接状态。
- 辅助色：冷灰绿，用于设备和状态标签。
- 动效原则：只做高价值交互动效，例如播放按钮呼吸、波形起伏、卡片浮动，不做全局花哨动画。

## 5. Eng Review（架构锁定）

### 技术选型

- **Electron**：适合 Win/mac 桌面交付，也天然适合承接你后面要补的本地 bridge / Node 能力。
- **React + TypeScript + Vite**：开发快，首版单窗口体验足够轻。
- **原生 CSS / 模块化样式**：避免把界面做成默认组件库味道，样式掌控力更高。

### 架构原则

- 不额外起一个复杂本地服务器进程，先把 Electron Main Process 作为本地 Node 中枢。
- Renderer 不直接碰 Node 或第三方 API，只通过 preload 暴露的 bridge 读写。
- 所有未来真实 API，都放到 adapter 层；首版提供 mock adapter 保证界面可运行。

### 目标文件清单

- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/main/bridge/bridge-service.ts`
- `src/main/bridge/adapters/mock-adapter.ts`
- `src/shared/contracts/bridge.ts`
- `src/renderer/main.tsx`
- `src/renderer/App.tsx`
- `src/renderer/components/*`
- `src/renderer/styles/*`
- `src/renderer/data/mock-tracks.ts`

### 数据流

1. Renderer 发起播放器或 bridge 请求。
2. Preload 暴露安全 API。
3. Main Process 接收请求并交给 Bridge Service。
4. Bridge Service 调用 mock adapter。
5. 结果返回 Renderer 更新界面。

### 首版模块切分

- 桌面窗口与运行时骨架
- 播放器主界面
- 音频控制与队列
- bridge 状态面板
- mock 数据与合同层

### 复杂度评估

- 实现复杂度：中等
- 风险点：Electron 打包、跨平台窗口细节、音频播放状态同步
- 控制手段：先做单窗口 MVP，所有外部接口先 mock，减少变量

## 6. 最小可行实现

首轮只落以下内容：

1. Electron 跨平台桌面壳
2. 一个高完成度的单页播放器界面
3. 可真实操作的播放控件和示例音频
4. bridge 合同层与 mock 实现
5. 明确的空状态 / 错误状态 / 连接状态

## 7. 验证方式

- `npm run build`
- 检查 `console.log` / `TODO` / `FIXME` 残留
- 本地启动桌面应用，验证播放、切歌、进度条、窗口交互和 bridge 状态展示

## 8. 当前建议

建议先按这个 MVP 方案推进。你负责后续真实 API bridge 接入，我这边先把桌面壳、交互 UI、以及桥接接口边界一次性打稳。
