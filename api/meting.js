/**
 * Meting API · Vercel Edge Function
 * 自建网易云音乐 Meting 兼容 API，自带 CORS。
 *
 * Edge Runtime 节点离网易云更近，不易超时。
 */

export const config = {
  runtime: 'edge',
};

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

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  ...CORS,
  'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function neteaseFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch(url, {
    signal: ctrl.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: 'https://music.163.com/',
    },
  });
  clearTimeout(timer);
  if (!r.ok) throw new Error('网易云 API HTTP ' + r.status);
  return r.json();
}

const API_BASE = 'https://meting-api.gzh-czy.cc.cd';

function parseSong(s) {
  if (!s) return null;
  const artists = (s.artists || s.ar || []).map((a) => a.name).filter(Boolean);
  const album = s.album || s.al || {};
  const picUrl = (album.picUrl || album.img || '').replace(/^http:\/\//, 'https://');
  return {
    id: s.id || s.songid,
    name: s.name,
    artist: artists.join(' / ') || '未知歌手',
    album: album.name || '',
    url: `${API_BASE}/api/meting?type=url&id=${s.id}`,
    pic: picUrl || '',
    lrc: `${API_BASE}/api/meting?type=lrc&id=${s.id}`,
  };
}

async function getPlaylist(id) {
  const data = await neteaseFetch(NETEASE.playlist + encodeURIComponent(id));
  return (data.result?.tracks || []).map(parseSong).filter(Boolean);
}

async function getSong(id) {
  const data = await neteaseFetch(NETEASE.song + encodeURIComponent(id) + ']');
  return (data.songs || []).map(parseSong).filter(Boolean);
}

async function searchSongs(keyword) {
  const data = await neteaseFetch(
    NETEASE.search + encodeURIComponent(keyword) + '&type=1&offset=0&limit=20'
  );
  return (data.result?.songs || []).map(parseSong).filter(Boolean);
}

export default async function handler(request) {
  const url = new URL(request.url);

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const type = (url.searchParams.get('type') || '').toLowerCase();
  const id = url.searchParams.get('id') || '';
  const server = (url.searchParams.get('server') || 'netease').toLowerCase();

  if (server !== 'netease') {
    return jsonResponse({ error: '目前仅支持 server=netease' }, 400);
  }
  if (!type || !id) {
    return jsonResponse({
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
    if (type === 'url') {
      return Response.redirect(NETEASE.outerUrl(id), 302);
    }
    if (type === 'pic') {
      const target = /^https?:\/\//i.test(id)
        ? id.replace(/^http:\/\//, 'https://')
        : `https://p1.music.126.net/${id}`;
      return Response.redirect(target, 302);
    }
    if (type === 'lrc') {
      const data = await neteaseFetch(NETEASE.lyric(id));
      const lrc = data.lrc?.lyric || '';
      return new Response(lrc, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          ...CORS,
          'Cache-Control': 'public, s-maxage=86400',
        },
      });
    }

    let result;
    if (type === 'playlist') result = await getPlaylist(id);
    else if (type === 'song') result = await getSong(id);
    else if (type === 'search') result = await searchSongs(id);
    else return jsonResponse({ error: '未知 type: ' + type }, 400);

    return jsonResponse(result);
  } catch (err) {
    console.error('[meting-api] error:', err?.message || err);
    return jsonResponse({ error: String(err?.message || err) }, 502);
  }
}
