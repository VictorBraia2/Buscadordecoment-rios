export default async function handler(req, res) {
  const { q, order, maxResults, regionCode, publishedAfter, publishedBefore } = req.query;
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Chave da API do YouTube não configurada no servidor." });
  }

  const ytOrder = order === 'date' ? 'date' : 'viewCount';
  const limit = maxResults ? parseInt(maxResults) : 20;

  let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&order=${ytOrder}&maxResults=${limit}&key=${API_KEY}`;

  if (regionCode && regionCode !== 'ALL') {
    searchUrl += `&regionCode=${encodeURIComponent(regionCode)}`;
  }
  
  if (publishedAfter) {
    searchUrl += `&publishedAfter=${encodeURIComponent(publishedAfter)}`;
  }
  if (publishedBefore) {
    searchUrl += `&publishedBefore=${encodeURIComponent(publishedBefore)}`;
  }

  try {
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      throw new Error(searchData.error.message);
    }

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json({ videos: [] });
    }

    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${API_KEY}`;

    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();


    let videos = searchData.items.map((item, index) => {
      const stats = statsData.items[index]?.statistics || {};
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || '',
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        views: parseInt(stats.viewCount || 0),
        likes: parseInt(stats.likeCount || 0),
        comments: parseInt(stats.commentCount || 0),
        date: item.snippet.publishedAt
      };
    });

    if (ytOrder === 'viewCount') {
      videos.sort((a, b) => b.views - a.views);
    }

    res.status(200).json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
