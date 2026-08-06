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

  // 匹配每个 timeline-item 块（含 headline）
  // 格式：<div class='timeline-item...'>...<div class='item-circle'><p>日期</p></div>...<div class='timeline-item-content'><p>内容</p></div>...</div>
  const itemRegex = /<div\s+class=['"][^'"]*timeline-item[^'"]*['"][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

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
