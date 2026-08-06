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
  // Butterfly timeline 格式：
  // <div class="timeline-item headline">...<div class="timeline-item-title"><div class="item-circle">日期</div></div>...
  // 或者 <div class="timeline-item"><div class="timeline-item-title"><div class="item-circle">日期</div></div><div class="timeline-item-content">内容</div></div>

  // 匹配 timeline-item
  const itemRegex = /<div[^>]*class=['"][^'"]*timeline-item[^'"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

    // 提取日期（item-circle 里的内容）
    const dateMatch = block.match(/<div[^>]*class=['"][^'"]*item-circle[^'"]*"[^>]*>([\s\S]*?)<\/div>/);
    const date = dateMatch ? stripTags(dateMatch[1]).trim() : '';

    // 提取内容（timeline-item-content 里的内容）
    const contentMatch = block.match(/<div[^>]*class=['"][^'"]*timeline-item-content[^'"]*"[^>]*>([\s\S]*?)<\/div>/);
    const content = contentMatch ? stripTags(contentMatch[1]).trim() : '';

    if (content) {
      items.push({ date, content, tag: '博客' });
    }
  }

  // 如果没匹配到，尝试另一种常见格式
  if (items.length === 0) {
    const altRegex = /<div[^>]*class=['"][^'"]*timeline[^'"]*"[^>]*>([\s\S]*?)<\/div>/g;
    while ((match = altRegex.exec(html)) !== null) {
      const block = match[1];
      // 尝试找日期和内容
      const lines = block.split(/<br\s*\/?>|\n/).map(l => stripTags(l).trim()).filter(Boolean);
      if (lines.length >= 2) {
        items.push({ date: lines[0], content: lines.slice(1).join(' '), tag: '博客' });
      }
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
