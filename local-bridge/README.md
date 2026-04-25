# Local Music Bridge

这是 Cosic 的本地音乐桥。

它不是另一个复杂系统，也不是云服务。
它就是你电脑上跑着的一个很小的本地 Node 服务，用来做这件事：

1. 拿你的网易云登录态
2. 去网易云请求真实数据
3. 再把结果整理成 Cosic 固定需要的 4 个接口

服务地址默认是：

```txt
http://127.0.0.1:7878
```

## 你只需要准备什么

在项目根目录的 `.env.local` 里写这 4 行：

```env
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=MUSIC_U=你的值; __csrf=你的值
COSIC_MUSIC_API_KEY=
```

注意：

- `COSIC_MUSIC_COOKIE` 现在最小只需要 `MUSIC_U` 和 `__csrf`
- 不需要把浏览器里所有 cookie 都塞进来
- `.env.local` 已被 `.gitignore` 忽略，不会被正常提交

## 怎么启动

在项目根目录运行：

```bash
npm run bridge:music
```

## 启动后怎么验证

浏览器打开这 4 个地址：

- `http://127.0.0.1:7878/health`
- `http://127.0.0.1:7878/user/playlists`
- `http://127.0.0.1:7878/playlists/歌单ID`
- `http://127.0.0.1:7878/tracks/歌曲ID/stream`

## 这 4 个接口分别干什么

### `GET /health`

看 bridge 有没有连上网易云登录态。

你会看到类似：

- `configured: true`
- `authMode: "cookie"`
- `mode: "netease-live"`

### `GET /user/playlists`

拿当前登录账号自己的歌单列表。

返回示例结构：

```json
{
  "account": {
    "userId": 123,
    "nickname": "Your Name"
  },
  "items": [
    {
      "id": "91621295",
      "name": "喜欢的音乐",
      "trackCount": 1201,
      "coverUrl": "https://...",
      "updatedAt": "2026-04-22T08:00:00.000Z"
    }
  ]
}
```

### `GET /playlists/:id`

拿某一个歌单的详细歌曲列表。

返回示例结构：

```json
{
  "id": "13698892829",
  "name": "IE900",
  "trackCount": 8,
  "tracks": [
    {
      "id": "2704589900",
      "title": "没有我你怎么办",
      "artist": "郑杰伦",
      "album": "没有我你怎么办",
      "duration": 201,
      "year": "2025",
      "coverUrl": "https://..."
    }
  ]
}
```

### `GET /tracks/:id/stream`

拿某首歌当前可播放的真实地址。

返回示例结构：

```json
{
  "trackId": "2704589900",
  "url": "http://m704.music.126.net/...",
  "bitrate": 320000,
  "type": "mp3",
  "expiresAt": "2026-04-22T08:21:35.671Z"
}
```

## 代码在哪里

- [music-bridge.mjs](/C:/Users/Administrator/Desktop/Toni/Cosic/local-bridge/music-bridge.mjs)

## 现在已经处理好的事情

- 能识别 `.env.local`
- 能验证网易云是否已登录
- 能返回你的真实歌单列表
- 能返回真实歌单详情
- 能补全大歌单超过 1000 首时缺失的歌曲详情
- 能返回真实歌曲播放地址

## 下一步接什么

bridge 已经是真实的了。

下一步就不是继续折腾 cookie 了，而是把 Cosic 主应用的音乐数据源从 `mockTracks` 切到这个本地 bridge：

1. 启动 `bridge:music`
2. 主应用启动时请求 `/user/playlists`
3. 选中歌单后请求 `/playlists/:id`
4. 播放时请求 `/tracks/:id/stream`

到这一步，前端播放器和 AI 策展界面就能开始吃你的真实网易云数据。
