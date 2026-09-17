export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { videoId, pageToken } = req.query;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'videoId inválido' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Chave de API não configurada no servidor' });

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) return res.status(400).json({ error: data.error.message });

    const comments = (data.items || []).map(item => {
      const s = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        text: s.textDisplay || s.textOriginal || '',
        author: s.authorDisplayName || '',
        date: s.publishedAt || '',
        likes: s.likeCount || 0,
        videoId
      };
    });

    return res.status(200).json({
      comments,
      nextPageToken: data.nextPageToken || null
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
