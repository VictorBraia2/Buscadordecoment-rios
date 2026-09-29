export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: `Método ${req.method} não permitido` });
  }

  // Captura do corpo da requisição (POST) com fallback para query string
  const { url, keywords } = req.body || req.query || {};
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: "Chave YOUTUBE_API_KEY não configurada no servidor." });
  }

  function extractVideoId(input) {
    if (!input) return null;
    const str = input.trim();
    if (str.length === 11 && !str.includes('/') && !str.includes('?')) return str;
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = str.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const videoId = extractVideoId(url);

  if (!videoId) {
    return res.status(400).json({ error: "videoId inválido" });
  }

  try {
    let videoTitle = "";
    try {
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`);
      const vData = await vRes.json();
      if (vData.items && vData.items.length > 0) {
        videoTitle = vData.items[0].snippet.title;
      }
    } catch (e) {
      console.error("Erro ao obter título do vídeo:", e);
    }

    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&order=relevance&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(commentsUrl);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message || "Erro na API do YouTube" });
    }

    let comments = (data.items || []).map(item => {
      const top = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        author: top.authorDisplayName,
        text: top.textDisplay,
        likes: top.likeCount,
        publishedAt: top.publishedAt,
        videoTitle: videoTitle,
        url: `https://www.youtube.com/watch?v=${videoId}`
      };
    });

    // Filtrar por palavras-chave se o utilizador as definiu
    if (Array.isArray(keywords) && keywords.length > 0) {
      comments = comments.filter(c => {
        const textLower = (c.text || '').toLowerCase();
        return keywords.some(kw => textLower.includes(kw.toLowerCase()));
      });
    }

    return res.status(200).json({ comments });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
