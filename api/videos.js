export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Método ${req.method} não permitido` });
  }

  try {
    const { q, regionCode = 'BR', dateFilter = 'ALL', order = 'relevance', maxResults = 20 } = req.body;

    if (!q) {
      return res.status(400).json({ error: 'O termo de busca (q) é obrigatório.' });
    }

    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'Chave de API do YouTube não configurada nas variáveis de ambiente da Vercel.' });
    }

    let youtubeUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${maxResults}&order=${order}&regionCode=${regionCode}&key=${YOUTUBE_API_KEY}`;
    if (dateFilter && dateFilter !== 'ALL') {
      const publishedAfter = `${dateFilter}-01-01T00:00:00Z`;
      const publishedBefore = `${dateFilter}-12-31T23:59:59Z`;
      youtubeUrl += `&publishedAfter=${publishedAfter}&publishedBefore=${publishedBefore}`;
    }

    const response = await fetch(youtubeUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erro ao consultar a API do YouTube.');
    }

    const videos = (data.items || []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    return res.status(200).json({ videos });

  } catch (error) {
    console.error('Erro na API de vídeos:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor.' });
  }
}
