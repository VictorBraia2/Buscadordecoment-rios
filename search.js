export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, order, maxResults } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Informe um termo de busca.' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });

  const limit     = Math.min(parseInt(maxResults) || 20, 50);
  const sortOrder = order === 'date' ? 'date' : 'relevance';

  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', q.trim());
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('order', sortOrder);
    searchUrl.searchParams.set('maxResults', limit);
    searchUrl.searchParams.set('key', apiKey);

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

    const videos = items.map(item => {
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

    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
