export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, order, maxResults, regionCode, dateFilter } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Informe um termo de busca.' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });

  const requestedLimit = parseInt(maxResults) || 20;
  const searchLimit = Math.max(requestedLimit, 50);
  
  const sortOrder = order === 'date' ? 'date' : 'relevance';

  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', q.trim());
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('order', sortOrder);
    searchUrl.searchParams.set('maxResults', searchLimit);
    searchUrl.searchParams.set('key', apiKey);

    if (regionCode && regionCode !== 'ALL') {
      searchUrl.searchParams.set('regionCode', regionCode);
      if (regionCode === 'BR') {
        searchUrl.searchParams.set('relevanceLanguage', 'pt');
      }
    }

    if (dateFilter && dateFilter !== 'ALL') {
      const now = new Date();
      if (dateFilter === 'year') {
        now.setFullYear(now.getFullYear() - 1);
      } else if (dateFilter === 'month') {
        now.setMonth(now.getMonth() - 1);
      } else if (dateFilter === 'week') {
        now.setDate(now.getDate() - 7);
      } else if (dateFilter === 'today') {
        now.setDate(now.getDate() - 1);
      }
      searchUrl.searchParams.set('publishedAfter', now.toISOString());
    }

    const searchRes  = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();
    if (searchData.error) return res.status(400).json({ error: searchData.error.message });

    const items = searchData.items || [];
    if (!items.length) return res.status(200).json({ videos: [] });

    const ids      = items.map(i => i.id.videoId).join(',');
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.set('part', 'statistics');
    statsUrl.searchParams.set('id', ids);
    statsUrl.searchParams.set('key', apiKey);

    const statsRes  = await fetch(statsUrl.toString());
    const statsData = await statsRes.json();

    const statsMap = {};
    for (const item of (statsData.items || [])) {
      statsMap[item.id] = {
        views:    parseInt(item.statistics?.viewCount    || 0),
        likes:    parseInt(item.statistics?.likeCount    || 0),
        comments: parseInt(item.statistics?.commentCount || 0),
      };
    }

    let videos = items.map(item => {
      const id = item.id.videoId;
      const s  = item.snippet;
      const st = statsMap[id] || { views: 0, likes: 0, comments: 0 };
      return {
        id,
        title:       s.title,
        channel:     s.channelTitle,
        publishedAt: s.publishedAt,
        thumbnail:   s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
        views:       st.views,
        likes:       st.likes,
        comments:    st.comments,
        url:         `https://www.youtube.com/watch?v=${id}`,
      };
    });

    videos.sort((a, b) => b.views - a.views);
    videos = videos.slice(0, requestedLimit);

    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
