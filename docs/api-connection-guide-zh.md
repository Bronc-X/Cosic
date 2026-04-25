# Cosic API 接入说明（中文详细版）

## 0. 先说结论

你现在不用一口气把所有 API 都接完。

这个项目正确的顺序只有一个：

1. 先接 `音乐`
2. 再接 `LLM 策展`
3. 然后才是 `语音 / 日历 / 天气 / 投屏`

原因很简单：

- 这个产品的核心是“根据你的音乐库做私人策展”
- 没有音乐库，AI 聊天再漂亮也只是空壳

所以你现在只需要先搞懂一件事：

**怎么把你的网易云歌单拿进 Cosic**

---

## 1. 你现在最容易困惑的点：什么叫 bridge？

### 一句话解释

`bridge` 就是一个“中间翻译层”。

它负责：

- 去网易云拿你的歌单
- 去网易云拿歌曲信息
- 去网易云拿播放地址
- 然后把这些内容整理成 Cosic 能懂的格式

### 为什么不能“前端直连网易云”？

“前端直连”就是：

- 播放器界面自己直接请求网易云
- 或者把网易云 cookie 直接放在前端页面里

这不推荐，原因有 4 个：

1. cookie 很容易泄露
2. 网易云接口变化时，前端会直接挂掉
3. 登录、鉴权、反爬处理会很乱
4. 以后想换音乐源会很痛苦

### 正确做法

正确的数据流是：

1. Cosic 前端只跟你自己的 `bridge` 说话
2. 你的 `bridge` 再去跟网易云说话
3. LLM 不直接碰网易云，它只吃 bridge 整理好的音乐数据

你可以把它理解成：

- 网易云 = 仓库
- bridge = 搬运工 + 翻译官
- LLM = 策展人
- Cosic 前端 = 展示和播放的场地

---

## 2. 你现在到底要做什么？

你现在只做这 3 件事：

1. 准备一个本地音乐 bridge
2. 把 bridge 地址写进 Cosic 的 `.env.local`
3. 让 bridge 至少能返回“歌单、歌曲、播放地址”

只要这 3 步通了，我们就能从“假数据播放器”切到“你的真实网易云库播放器”。

---

## 3. 先改哪个文件？

你先打开项目根目录下的：

[.env.local](/C:/Users/Administrator/Desktop/Toni/Cosic/.env.local)

把音乐相关变量改成这样：

```dotenv
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=
COSIC_MUSIC_API_KEY=
```

### 每一项是什么意思？

#### `COSIC_MUSIC_PROVIDER=netease`

意思是：

- 告诉 Cosic：音乐来源是网易云

这个基本不用改。

#### `COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878`

意思是：

- 你的音乐 bridge 服务跑在本机 `7878` 端口

以后 Cosic 会去请求：

- `http://127.0.0.1:7878/health`
- `http://127.0.0.1:7878/user/playlists`
- `http://127.0.0.1:7878/tracks/...`

#### `COSIC_MUSIC_COOKIE=`

意思是：

- 如果你的 bridge 需要通过网易云网页登录 cookie 去拿数据，就填这里

注意：

- 这个 cookie 是给 `bridge` 用的
- 不是给前端页面直接用的

#### `COSIC_MUSIC_API_KEY=`

意思是：

- 如果你的 bridge 自己做了一层 token 鉴权，就填这里

所以音乐这一块通常有两种方式：

### 方式 A：bridge 用 cookie 登录网易云

那你填：

```dotenv
COSIC_MUSIC_COOKIE=你的网易云 cookie
```

### 方式 B：bridge 自己需要 token

那你填：

```dotenv
COSIC_MUSIC_API_KEY=你的 bridge token
```

有些 bridge 两个都要，有些只要一个。

---

## 4. 你本地的 bridge 至少要提供哪些接口？

你先不用想复杂，最小只要 7 个。

### 第 1 个：健康检查

```txt
GET /health
```

作用：

- 让 Cosic 知道你的 bridge 活着没

返回示例：

```json
{
  "ok": true,
  "provider": "netease",
  "authMode": "cookie"
}
```

---

### 第 2 个：拿你的总音乐库

```txt
GET /user/library
```

作用：

- 给 Cosic 一个“全库候选池”
- 后面 LLM 会从这里面挑歌

如果你暂时做不了全库，也可以先只做歌单列表，再慢慢补。

---

### 第 3 个：拿你的歌单列表

```txt
GET /user/playlists
```

作用：

- 让 Cosic 看见你有哪些歌单

返回示例：

```json
{
  "items": [
    {
      "id": "pl_001",
      "name": "深夜工作",
      "trackCount": 128,
      "coverUrl": "https://example.com/cover.jpg",
      "updatedAt": "2026-04-22T06:00:00.000Z"
    },
    {
      "id": "pl_002",
      "name": "通勤返程",
      "trackCount": 67,
      "coverUrl": "https://example.com/cover2.jpg",
      "updatedAt": "2026-04-20T12:30:00.000Z"
    }
  ]
}
```

这里最重要的是：

- `id`
- `name`
- `trackCount`

---

### 第 4 个：拿某个歌单的歌曲

```txt
GET /playlists/:id
```

比如：

```txt
GET /playlists/pl_001
```

作用：

- 让 Cosic 拿到这个歌单里面到底有哪些歌

返回示例：

```json
{
  "id": "pl_001",
  "name": "深夜工作",
  "description": "我的工作歌单",
  "tracks": [
    {
      "id": "t_001",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration": 233,
      "year": "2024",
      "coverUrl": "https://example.com/track.jpg"
    },
    {
      "id": "t_002",
      "title": "Track 2",
      "artist": "Artist 2",
      "album": "Album 2",
      "duration": 210,
      "year": "2023",
      "coverUrl": "https://example.com/track2.jpg"
    }
  ]
}
```

最重要的是 `tracks` 里的：

- `id`
- `title`
- `artist`
- `album`
- `duration`

---

### 第 5 个：拿单曲详情

```txt
GET /tracks/:id
```

作用：

- 某些地方可能只需要单曲详情，不一定每次都走整个歌单

这个不是最先必须，但建议你顺手做掉。

---

### 第 6 个：拿歌词

```txt
GET /tracks/:id/lyric
```

作用：

- 后面 AI 策展会更懂歌的语义
- 以后接 AI 语音介绍时也能用

返回示例：

```json
{
  "trackId": "t_001",
  "lyric": "这里是歌词正文",
  "translatedLyric": ""
}
```

---

### 第 7 个：拿播放地址

```txt
GET /tracks/:id/stream
```

作用：

- 这是最关键的一个
- 没有它，Cosic 知道歌名也播不出来

返回示例：

```json
{
  "trackId": "t_001",
  "url": "https://example.com/audio.mp3",
  "expiresAt": "2026-04-22T08:00:00.000Z"
}
```

最重要的是：

- `url`

因为播放器最终就是靠这个地址播放。

---

## 5. 怎么判断你的 bridge 是不是已经“能用”了？

你可以先不用连 Cosic，自己在浏览器里打开这些地址试。

比如如果你的 bridge 跑在：

```txt
http://127.0.0.1:7878
```

那你至少要能在浏览器里打开：

```txt
http://127.0.0.1:7878/health
http://127.0.0.1:7878/user/playlists
```

### 如果你想用 PowerShell 测

打开 PowerShell，分别运行：

```powershell
Invoke-RestMethod http://127.0.0.1:7878/health
```

```powershell
Invoke-RestMethod http://127.0.0.1:7878/user/playlists
```

```powershell
Invoke-RestMethod http://127.0.0.1:7878/playlists/pl_001
```

如果能正常返回 JSON，说明 bridge 基本通了。

---

## 6. Cosic 现在已经准备好了哪些部分？

我这边已经把以下东西接好了：

### 1. 前端可以生成“AI 策展歌单”

也就是你输入：

- “我现在要深度工作”
- “今晚想放松一点”
- “给我一个适合收尾的歌单”

Cosic 已经能走一套“策展流程”。

### 2. LLM 返回格式已经定好了

模型返回的内容应该长这样：

```json
{
  "title": "稳定推进，保持清醒",
  "intent": "deep focus",
  "note": "前段稳态推进，中段维持专注，尾段避免疲劳塌陷。",
  "trackIds": ["t_12", "t_18", "t_44", "t_03"]
}
```

意思是：

- `title`：这套歌单的名字
- `intent`：用途，比如深度工作、放松、返程
- `note`：简短的策展说明
- `trackIds`：按顺序排列的歌曲 id

### 3. 现在缺的不是“聊天界面”

现在最缺的是：

- 真正的 `music bridge`

因为只有接上你的网易云库，LLM 才能从“你的歌”里面挑。

---

## 7. 你和我分别负责什么？

为了不混乱，我给你拆成“你做”和“我做”。

### 你做的部分

你负责：

1. 准备网易云 bridge
2. 告诉我 bridge 的地址
3. 告诉我是 cookie 鉴权还是 token 鉴权
4. 给我至少 3 个接口的真实返回样例

最少给我这三个就够我开工：

- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id/stream`

### 我做的部分

我负责：

1. 把 Cosic 的 mock 音乐流替换成真实 bridge
2. 把你返回的歌单数据转成播放器内部格式
3. 把 `trackIds` 和真实歌曲对象对起来
4. 把 AI 策展结果切成可立即播放的队列
5. 把 UI 里的“基础库”和“策展歌单”切换打通

---

## 8. 先不要管 voice / calendar / weather / cast

这些现在都不是第一优先级。

### Voice

以后是用来：

- 做 AI 语音开场
- 做播报
- 做 station id

现在先不影响你的核心链路。

### Calendar

以后是用来：

- 知道你今天是会议日还是写作日
- 给策展上下文加一层现实场景

现在也不是必须。

### Weather

以后是用来：

- 给“此刻氛围”加一个环境变量

优先级也低。

### Cast

以后是用来：

- 把播放从电脑切到家里音箱

先更不急。

---

## 9. 你现在第一步到底该干嘛？

我给你一个最简单版本。

### 第一步

先让你的 bridge 只实现：

- `GET /health`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id/stream`

只做这 4 个。

### 第二步

把 `.env.local` 填成这样：

```dotenv
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=你的网易云cookie
COSIC_MUSIC_API_KEY=
```

如果你的 bridge 不吃 cookie，而是吃 token：

```dotenv
COSIC_MUSIC_API_KEY=你的bridge token
```

### 第三步

在浏览器里试：

```txt
http://127.0.0.1:7878/health
```

如果你能看到：

```json
{
  "ok": true
}
```

说明 bridge 至少启动成功了。

### 第四步

把下面 3 个 JSON 返回给我看：

1. `GET /user/playlists`
2. `GET /playlists/:id`
3. `GET /tracks/:id/stream`

你直接把返回内容贴给我就行。

我拿到这 3 个以后，就能开始把 Cosic 接到真实音乐库上。

---

## 10. 你如果还是不确定，最小只回复我这 2 句话

你只要告诉我：

1. `我的 bridge 地址是 http://127.0.0.1:xxxx`
2. `它用 cookie / token 鉴权`

然后把一个接口的 JSON 回我，我就能继续往下接。

---

## 11. 相关文档

- [英文 API 接入说明](/C:/Users/Administrator/Desktop/Toni/Cosic/docs/api-connection-guide.md)
- [Provider 配置说明](/C:/Users/Administrator/Desktop/Toni/Cosic/docs/bridge-provider-setup.md)
- [最终产品架构](/C:/Users/Administrator/Desktop/Toni/Cosic/docs/final-product-architecture.md)
