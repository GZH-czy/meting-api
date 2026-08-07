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

  // 找所有年份 headline（timeline-item headline 里的 item-circle）
  const yearRegex = /class=['"][^'"]*timeline-item headline['"][^>]*>[\s\S]*?class=['"][^'"]*item-circle['"][^>]*>([\s\S]*?)<\/div>/gi;
  const yearPositions = [];
  let ym;
  while ((ym = yearRegex.exec(html)) !== null) {
    yearPositions.push({ start: ym.index, year: stripTags(ym[1]).trim() });
  }

  // 找所有日期（item-circle）和内容
  const dateRegex = /class=['"][^'"]*item-circle['"][^>]*>([\s\S]*?)<\/div>/gi;
  const contentRegex = /class=['"][^'"]*timeline-item-content['"][^>]*>([\s\S]*?)<\/div>/gi;

  const contentPositions = [];
  let cp;
  while ((cp = contentRegex.exec(html)) !== null) {
    const text = stripTags(cp[1]).trim();
    if (text) contentPositions.push({ start: cp.index, text });
  }

  // 找每个 content 前面最近的日期，并补上年份
  for (const cp of contentPositions) {
    let nearestDate = '';
    let nearestDist = Infinity;
    const dRegex = /class=['"][^'"]*item-circle['"][^>]*>([\s\S]*?)<\/div>/gi;
    let d;
    while ((d = dRegex.exec(html)) !== null) {
      const dateText = stripTags(d[1]).trim();
      if (!dateText) continue;
      // 跳过年份（4位纯数字）
      if (/^\d{4}$/.test(dateText)) continue;
      const dist = cp.start - d.index;
      if (dist > 0 && dist < nearestDist) {
        nearestDist = dist;
        nearestDate = dateText;
      }
    }

    // 找该 content 前面最近的年份
    let nearestYear = '';
    let yearDist = Infinity;
    for (const yp of yearPositions) {
      const dist = cp.start - yp.start;
      if (dist > 0 && dist < yearDist) {
        yearDist = dist;
        nearestYear = yp.year;
      }
    }

    // 拼接年份+日期
    const fullDate = nearestYear ? `${nearestYear}-${nearestDate}` : nearestDate;
    items.push({ date: fullDate, content: cp.text, tag: '博客' });
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
