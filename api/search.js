function parseISO8601Duration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, order, maxResults, regionCode, publishedAfter, publishedBefore, dateFilter } = req.query;
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Chave da API do YouTube não configurada no servidor." });
  }

  if (!q || !q.trim()) {
    return res.status(400).json({ error: "Informe um termo de busca." });
  }

  const requestedLimit = parseInt(maxResults) || 20;
  const ytOrder = order === 'date' ? 'date' : 'viewCount';

  let pAfter = publishedAfter;
  let pBefore = publishedBefore;

  if (!pAfter && dateFilter && dateFilter !== 'ALL') {
    if (/^\d{4}$/.test(dateFilter)) {
      const year = parseInt(dateFilter, 10);
      pAfter = new Date(year, 0, 1).toISOString();
      pBefore = new Date(year, 11, 31, 23, 59, 59).toISOString();
    }
  }

  try {
    let items = [];
    let nextPageToken = '';
    
    // Puxa 2 páginas (até 100 vídeos) para expandir a amostragem e capturar vídeos nacionais de alto acesso
    for (let page = 0; page < 2; page++) {
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('q', q.trim());
      searchUrl.searchParams.set('order', ytOrder);
      searchUrl.searchParams.set('maxResults', '50');
      searchUrl.searchParams.set('key', API_KEY);

      if (regionCode && regionCode !== 'ALL') {
        searchUrl.searchParams.set('regionCode', regionCode);
        if (regionCode === 'BR' || regionCode === 'PT') {
          searchUrl.searchParams.set('relevanceLanguage', 'pt');
        } else if (regionCode === 'US') {
          searchUrl.searchParams.set('relevanceLanguage', 'en');
        }
      }

      if (pAfter) searchUrl.searchParams.set('publishedAfter', pAfter);
      if (pBefore) searchUrl.searchParams.set('publishedBefore', pBefore);
      if (nextPageToken) searchUrl.searchParams.set('pageToken', nextPageToken);

      const searchRes = await fetch(searchUrl.toString());
      const searchData = await searchRes.json();

      if (searchData.error) {
        return res.status(400).json({ error: searchData.error.message });
      }

      const pageItems = searchData.items || [];
      items.push(...pageItems);

      nextPageToken = searchData.nextPageToken;
      if (!nextPageToken || pageItems.length < 50) break;
    }

    if (!items.length) {
      return res.status(200).json({ videos: [] });
    }

    // Consulta detalhes e estatísticas de todos os vídeos obtidos
    const ids = items.map(i => i.id.videoId).join(',');
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
    statsUrl.searchParams.set('id', ids);
    statsUrl.searchParams.set('key', API_KEY);

    const statsRes = await fetch(statsUrl.toString());
    const statsData = await statsRes.json();

    const statsMap = {};
    for (const item of (statsData.items || [])) {
      const durationSec = parseISO8601Duration(item.contentDetails?.duration);
      const audioLang = (item.snippet?.defaultAudioLanguage || item.snippet?.defaultLanguage || '').toLowerCase();
      statsMap[item.id] = {
        views: parseInt(item.statistics?.viewCount || 0),
        likes: parseInt(item.statistics?.likeCount || 0),
        comments: parseInt(item.statistics?.commentCount || 0),
        durationSec: durationSec,
        audioLang: audioLang
      };
    }

    let videos = [];
    const seenIds = new Set();

    for (const item of items) {
      const id = item.id.videoId;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const s = item.snippet;
      const st = statsMap[id] || { views: 0, likes: 0, comments: 0, durationSec: 0, audioLang: '' };
      const titleLower = (s.title || '').toLowerCase();

      // 1. Filtro Anti-Shorts (descarta <= 60s ou títulos com #shorts)
      if (st.durationSec > 0 && st.durationSec <= 60) continue;
      if (titleLower.includes('#shorts') || titleLower.includes('#short')) continue;

      // 2. Filtro de Idioma Tolerante: descarta apenas se for estritamente inglês marcado
      if ((regionCode === 'BR' || regionCode === 'PT') && (st.audioLang === 'en' || st.audioLang === 'en-us')) {
        continue;
      }

      videos.push({
        id,
        title: s.title,
        channel: s.channelTitle,
        publishedAt: s.publishedAt,
        thumbnail: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
        views: st.views,
        likes: st.likes,
        comments: st.comments,
        duration: st.durationSec,
        url: `https://www.youtube.com/watch?v=${id}`
      });
    }

    // Ordenação matemática por número de visualizações
    if (ytOrder === 'viewCount') {
      videos.sort((a, b) => b.views - a.views);
    }

    videos = videos.slice(0, requestedLimit);

    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
