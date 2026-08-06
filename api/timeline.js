/**
 * Timeline Proxy · Vercel Edge Function
 * 抓取博客时间轴页面，解析为 JSON，自带 CORS。
 *
 * 用法：GET /api/timeline?url=https://love.gzh-czy.cc.cd/timeline/
 */

export const config = {
  runtime: 'edge',
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
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// 解析 Butterfly 主题时间轴 HTML
function parseButterflyTimeline(html) {
  const items = [];

  // 用 indexOf 找到每个 timeline-item 的起始位置，手动解析
  let searchFrom = 0;
  while (true) {
    // 找 <div class="timeline-item ..."> 或 <div class='timeline-item ...'>
    const startMatch = html.match(/<div\s+class=['"][^'"]*timeline-item[^'"]*['"][^>]*>/i);
    if (!startMatch) break;
    const startIdx = html.indexOf(startMatch[0], searchFrom);
    if (startIdx === -1) break;

    // 找对应的结束标签（简单计数法）
    const afterStart = startIdx + startMatch[0].length;
    let depth = 1;
    let pos = afterStart;
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        pos = nextClose + 6;
      }
    }
    const block = html.substring(afterStart, pos - 6);
    searchFrom = pos;

    // 提取日期（item-circle 里的文本）
    const dateMatch = block.match(/class=['"][^'"]*item-circle['"][^>]*>([\s\S]*?)<\/div>/i);
    const date = dateMatch ? stripTags(dateMatch[1]).trim() : '';

    // 提取内容（timeline-item-content 里的文本）
    const contentMatch = block.match(/class=['"][^'"]*timeline-item-content['"][^>]*>([\s\S]*?)<\/div>/i);
    const content = contentMatch ? stripTags(contentMatch[1]).trim() : '';

    if (content) {
      items.push({ date, content, tag: '博客' });
    }
  }

  return items;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
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

  const targetUrl = url.searchParams.get('url') || 'https://love.gzh-czy.cc.cd/timeline/';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(targetUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TimelineBot/1.0)',
        Accept: 'text/html',
      },
    });
    clearTimeout(timer);

    if (!res.ok) return jsonResponse({ error: 'HTTP ' + res.status }, res.status);

    const html = await res.text();
    const items = parseButterflyTimeline(html);

    return jsonResponse(items);
  } catch (err) {
    console.error('[timeline-proxy] error:', err?.message || err);
    return jsonResponse({ error: String(err?.message || err) }, 502);
  }
}
