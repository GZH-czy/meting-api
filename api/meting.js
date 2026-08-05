/**
 * Meting API · Vercel Serverless Function
 * 自建网易云音乐 Meting 兼容 API，自带 CORS。
 *
 * 路由（Vercel 把 /api/meting 映射到本文件）：
 *   /api/meting?server=netease&type=playlist&id=<歌单ID>
 *   /api/meting?server=netease&type=song&id=<歌曲ID>
 *   /api/meting?server=netease&type=search&id=<关键词>
 *   /api/meting?server=netease&type=url&id=<歌曲ID>      → 302 到 mp3
 *   /api/meting?server=netease&type=pic&id=<图片完整URL>  → 302 到图片
 *   /api/meting?server=netease&type=lrc&id=<歌曲ID>      → 歌词文本
 *
 * 本地调试：npx vercel dev
 * 部署：    npx vercel --prod   或   在 vercel.com 导入本仓库
 */

const NETEASE = {
  playlist: 'https://music.163.com/api/playlist/detail?id=',
  song: 'https://music.163.com/api/song/detail?ids=[',
  search: 'https://music.163.com/api/search/get?s=',
  lyric: (id) =>
    `https://music.163.com/api/song/lyric?os=pc&id=${encodeURIComponent(id)}&lv=-1&kv=-1&tv=-1`,
  outerUrl: (id) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const CACHE_HEADERS = {
  ...CORS,
  'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
};

function json(res, data, status = 200) {
  return res.status(status).set(CACHE_HEADERS).json(data);
}

async function neteaseFetch(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: 'https://music.163.com/',
    },
  });
  if (!r.ok) throw new Error('网易云 API HTTP ' + r.status);
  return r.json();
}

function parseSong(s) {
  if (!s) return null;
  const artists = (s.artists || s.ar || []).map((a) => a.name).filter(Boolean);
  const album = s.album || s.al || {};
  // picUrl 是完整图片地址，统一升级 https
  const picUrl = (album.picUrl || album.img || '').replace(/^http:\/\//, 'https://');
  return {
    id: s.id || s.songid,
    name: s.name,
    artist: artists.join(' / ') || '未知歌手',
    album: album.name || '',
    // url/lrc 指回本 API，由本服务 302 跳转，保持 Meting 标准结构
    url: `/api/meting?type=url&id=${s.id}`,
    pic: picUrl || '',
    lrc: `/api/meting?type=lrc&id=${s.id}`,
  };
}

async function getPlaylist(id) {
  const data = await neteaseFetch(NETEASE.playlist + encodeURIComponent(id));
  const tracks = (data.result && data.result.tracks) || [];
  return tracks.map(parseSong).filter(Boolean);
}

async function getSong(id) {
  const data = await neteaseFetch(NETEASE.song + encodeURIComponent(id) + ']');
  return (data.songs || []).map(parseSong).filter(Boolean);
}

async function searchSongs(keyword) {
  const data = await neteaseFetch(
    NETEASE.search + encodeURIComponent(keyword) + '&type=1&offset=0&limit=20'
  );
  return ((data.result && data.result.songs) || []).map(parseSong).filter(Boolean);
}

export default async function handler(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.status(204).set(CORS).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).set(CORS).end();
    return;
  }

  const { type = '', id = '', server = 'netease' } = req.query;

  if (server !== 'netease') {
    return json(res, { error: '目前仅支持 server=netease' }, 400);
  }
  if (!type || !id) {
    return json(res, {
      usage: {
        playlist: '/api/meting?server=netease&type=playlist&id=<歌单ID>',
        song: '/api/meting?server=netease&type=song&id=<歌曲ID>',
        search: '/api/meting?server=netease&type=search&id=<关键词>',
        url: '/api/meting?server=netease&type=url&id=<歌曲ID>',
        pic: '/api/meting?server=netease&type=pic&id=<图片完整URL>',
        lrc: '/api/meting?server=netease&type=lrc&id=<歌曲ID>',
      },
    });
  }

  try {
    // 302 跳转类
    if (type === 'url') {
      res
        .status(302)
        .set({ ...CORS, Location: NETEASE.outerUrl(id), 'Cache-Control': 'public, s-maxage=86400' })
        .end();
      return;
    }
    if (type === 'pic') {
      // pic 入参直接是完整图片 URL（parseSong 已提供）
      const target = /^https?:\/\//i.test(id) ? id.replace(/^http:\/\//, 'https://') : `https://p1.music.126.net/${id}`;
      res
        .status(302)
        .set({ ...CORS, Location: target, 'Cache-Control': 'public, s-maxage=604800' })
        .end();
      return;
    }
    if (type === 'lrc') {
      const data = await neteaseFetch(NETEASE.lyric(id));
      const lrc = (data.lrc && data.lrc.lyric) || '';
      res
        .status(200)
        .set({ ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' })
        .send(lrc);
      return;
    }

    // JSON 类
    let result;
    if (type === 'playlist') result = await getPlaylist(id);
    else if (type === 'song') result = await getSong(id);
    else if (type === 'search') result = await searchSongs(id);
    else return json(res, { error: '未知 type: ' + type }, 400);

    return json(res, result);
  } catch (err) {
    console.error('[meting-api]', err);
    return json(res, { error: String(err && err.message || err) }, 502);
  }
}
