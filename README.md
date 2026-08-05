# Meting API · 网易云音乐接口（Vercel）

自建的网易云音乐 Meting 兼容 API，部署在 Vercel，自带 CORS、零配置。

> 解决公共 Meting API 不带 CORS 头 / 跨域被浏览器拦截的问题。

## 接口

路由：`/api/meting?server=netease&type=<type>&id=<id>`

| type | 用途 | 返回 |
|------|------|------|
| `playlist` | 歌单 | JSON 歌曲列表 |
| `song` | 单曲详情 | JSON |
| `search` | 搜索（id 填关键词） | JSON |
| `url` | 播放地址 | 302 跳转到 mp3 |
| `pic` | 封面图（id 填完整图片 URL） | 302 跳转 |
| `lrc` | 歌词 | 文本 |

示例：
```
GET /api/meting?server=netease&type=playlist&id=8492133976
```

返回（Meting 标准格式）：
```json
[
  {
    "id": 1416778335,
    "name": "夜听雨",
    "artist": "森水垚 / 尚衡",
    "album": "...",
    "pic": "https://p1.music.126.net/...",
    "url": "/api/meting?type=url&id=1416778335",
    "lrc": "/api/meting?type=lrc&id=1416778335"
  }
]
```

## 部署到 Vercel

1. Fork 或导入本仓库到你的 GitHub
2. 打开 https://vercel.com/new ，导入该仓库
3. Framework Preset 选 **Other**，其余默认，点 **Deploy**
4. 几秒后拿到地址，如 `https://meting-api-xxx.vercel.app`
5. 验证：浏览器打开
   `https://meting-api-xxx.vercel.app/api/meting?server=netease&type=playlist&id=8492133976`

### 绑定自定义域名

Vercel 项目 → **Settings → Domains** → 添加域名（如 `meting.gzh-czy.cc.cd`），
按提示到你的 DNS 服务商加 CNAME 记录指向 `cname.vercel-dns.com`。

### 更新博客中转页配置

部署后拿到地址，改 `blog-landing` 仓库的 `config.js`：

```js
music: {
  netease: {
    enable: true,
    api: 'https://你的域名/api/meting',   // 或 vercel 默认地址
    id: '8492133976',
    type: 'playlist',
    fallbackOuter: true
  }
}
```

## 限制

- 网易云 `playlist/detail` 接口对非登录请求只返回前 10 首
- `url` 走官方外链 `music.163.com/song/media/outer/url`，VIP / 下架歌曲可能只有片段或 403
- Vercel 免费版：每月 100GB 流量、100k 次调用，个人博客足够

## 结构

```
.
├── api/
│   └── meting.js     # Serverless Function（全部逻辑）
├── vercel.json
├── package.json
└── README.md
```
