# Cosic Electron 前端设计 Brief

## 1. 一句话定位

Cosic 不是普通音乐播放器，而是一个「私人 AI 电台控制台」式的 Electron 桌面应用：它读取用户自己的音乐库，理解长期品味和当下场景，然后生成此刻最适合播放的歌单。

## 2. 这次要交付的不是“好看界面”，而是清晰的产品感

前端设计的目标不是做成通用 SaaS 面板，也不是做成泛聊天应用，而是让用户在打开 3 秒内感受到：

- 这是一个桌面级播放器，不是网页套壳
- 这是一个有“设备感”的控制台，不是卡片堆叠后台
- 这是一个 AI 策展入口，不只是播放按钮旁边塞了个聊天框

## 3. 设计成功标准

设计稿或最终界面至少要满足下面几点：

- 首屏同时看清三件事：当前在播什么、接下来播什么、AI 正在帮我做什么
- 播放控制、队列、输入框都必须在首屏可见，不能被情绪化大留白吃掉
- 用户能明显区分“我的音乐库”和“AI 当前生成的临时歌单”
- Bridge / 连接 / 分析 / 生成这些系统状态必须被感知到，但不能吵
- 整体气质偏“深夜、克制、专业、温暖”，不要做成夜店 cyberpunk

## 4. 推荐设计方向

### Aesthetic Name

`Midnight Broadcast Console / 午夜电台控制台`

### 方向说明

整体视觉要像一台私人广播设备：

- 深色底，但不是纯黑死板
- 有少量暖橙或铜色做能量点
- 层级像真实控制台，有主舞台、有信息轨、有操作区
- 聊天面板更像“策展终端”或“值班日志”，不是 IM 聊天气泡墙

### Differentiation Anchor

如果把 logo 去掉，这个产品依然应该一眼被认成：

“一个音乐策展控制台，而不是普通聊天软件或普通播放器。”

### DFII

- Aesthetic Impact: 4
- Context Fit: 5
- Implementation Feasibility: 5
- Performance Safety: 4
- Consistency Risk: 2

`DFII = 14`

这是一个值得直接执行的方向。

## 5. 对当前界面的判断

当前方向其实是对的，尤其是：

- 深色暖调是对的
- 左播放器 + 右策展区的双栏结构是对的
- 标题栏、磨砂、状态胶囊这些“桌面感”是对的

但目前还可以继续收紧：

- 左侧播放器下半部分留白偏多，设备感还不够强
- 右侧聊天区现在更像“空白聊天面板”，还不像“策展工作台”
- 队列、Bridge 状态、AI 分析状态之间的关系不够明确
- 现在更像“一个播放器加一个聊天框”，还没完全长成“控制台”

## 6. 推荐页面结构

建议维持双栏，但把功能层次更明确地做成三层：

### 顶部：Title Bar / Session Header

- 左侧是品牌与当前连接来源
- 中间是当前 session 状态，例如「你的网易云 / 本地演示库 / Curating now」
- 右侧是原生窗口控制

### 左侧主舞台：Player Deck

- 大封面 + 当前曲目标题 + 艺术家信息
- 当前播放场景说明，例如专注、收尾、夜读、通勤
- 主控制区固定露出：播放、暂停、上一首、下一首、进度、音量
- 主舞台下方不要留空，建议放：
  - 当前队列摘要
  - 下一首预告
  - 波形或信号条
  - Bridge 状态小条

### 右侧策展面板：Curator Console

- 顶部是策展身份和当前状态，不要像普通聊天标题
- 中部是消息流，但要更像“策展记录”
- 中下部是 AI 生成结果卡片，包含：
  - 歌单名
  - 场景意图
  - 简短策展说明
  - 可点击曲目列表
- 底部输入框必须固定，始终可见
- 输入框上方可以放少量 prompt chips，但不要做成标签云

## 7. 每个模块应该传达什么感觉

### Player Deck

像一块正在工作的硬件面板，稳定、沉浸、可信。

### Queue Rail

像“即将播出”的节目单，信息密度比卡片感更重要。

### Curator Console

像一个懂你口味的私人 DJ / 编辑台，不像客服聊天框。

### Signal / Bridge Status

像设备上的信号灯和连接读数，只做提示，不抢主视觉。

## 8. 视觉系统建议

### 字体

- 英文展示字体：`Space Grotesk` 这类有结构感的字形可以保留
- 中文正文字体：`Noto Sans SC`
- 数据、状态、时间、编号：`IBM Plex Mono`

不要换成 Inter，也不要走“默认极简 SaaS 字体栈”。

### 配色

- 主背景：炭黑 / 墨黑 / 深棕黑
- 主文本：暖白，不要纯白刺眼
- 强调色：铜橙或暖橙，只给播放状态、激活态、生成态
- 次级信号色：低饱和绿，用于在线、成功、已连接

建议避免：

- 紫色科技渐变
- 高饱和霓虹蓝紫
- 过于泛滥的大面积玻璃拟态

### 空间

- 保持大面板，但不要大面积无效空白
- 重要区域之间要有“压缩后的专业密度”
- 面板圆角可以保留，但不要每个元素都像卡片玩具

## 9. 动效原则

只保留高价值动效：

- 播放状态的轻微呼吸感
- 波形或电平的细弱起伏
- 激活卡片的轻微位移
- 页面首次进入时的分层出现

不要做：

- 到处都在浮动
- 聊天气泡频繁弹跳
- 过强的拟物转场

## 10. 前端必须覆盖的状态

设计稿至少要把这些状态画清楚：

- Loading
- Bridge 未连接
- 音乐库为空
- 正在分析用户口味
- 正在生成歌单
- 已生成歌单，可点击播放
- 播放失败 / 资源错误

如果这些状态没设计，开发后一定会回头补，成本会更高。

## 11. 明确告诉前端不要做成什么

- 不要做成后台管理面板
- 不要做成普通 IM 对话窗
- 不要做成音乐网站首页
- 不要做成过度赛博朋克的“炫技 UI”
- 不要让播放器、队列、输入框在首屏互相抢空间

## 12. 你可以直接发给前端的话术

下面这段可以直接复制给前端设计师或前端开发：

> 我这个 Electron 产品不是普通播放器，而是一个「私人 AI 电台控制台」。它核心不是推荐陌生音乐，而是读取用户自己的音乐库，然后结合长期品味和当下输入，实时生成最适合此刻的歌单。  
> 视觉上我想要的是“深夜、专业、克制、带设备感”的方向，不要做成 SaaS 后台，也不要做成普通聊天软件。  
> 首页首屏必须同时看到三件事：当前播放内容、队列/下一首、AI 策展输入与结果。播放控制、队列和输入框都要首屏可见。  
> 结构上建议维持左侧播放器主舞台，右侧 AI 策展控制台，但右侧不要只是聊天框，要更像策展终端或值班日志；左侧也不要留下大面积空白，要让它更像真正工作的桌面控制台。  
> 配色可以走深色暖调，以炭黑、暖白、铜橙为主，少量状态绿。动效克制，只保留播放、信号、激活态这些关键反馈。  
> 如果最后把 logo 去掉，我希望别人依然能一眼认出来：这是一个音乐策展控制台，而不是模板化播放器。

## 13. 如果对方要 AI Prompt，再发这一版

> Design an Electron desktop app for an AI-powered personal music curator.  
> The app should feel like a midnight broadcast console, not a generic SaaS dashboard and not a normal chat app.  
> Keep a dual-column layout: left is the player deck, right is the curator console.  
> The first screen must show playback, queue, and AI input/result at the same time.  
> Use a dark warm palette with charcoal black, warm white, and copper orange accents.  
> The UI should feel like a premium desktop control surface: calm, editorial, technical, and slightly cinematic.  
> Avoid generic cards, purple gradients, default dashboard layouts, and excessive cyberpunk decoration.  
> The curator area should feel like a private DJ/editor terminal, and the player area should feel like an active device panel.  
> Motion should be sparse and meaningful: signal pulse, playback glow, subtle stage transitions.

## 14. 下一步建议

如果你愿意，下一步最合适的是二选一：

- 我直接继续，把这份 brief 落成一版界面改造方案，开始改现有 Electron 前端
- 我先基于这份 brief，继续给你出一版更细的线框结构和组件层级说明
