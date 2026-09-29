export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Variáveis do Supabase não configuradas no servidor." });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/search_history?select=*&order=created_at.desc&limit=20`, { headers });
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { query, region, year, order, totalResults } = req.body || {};
      if (!query) return res.status(400).json({ error: "Termo de busca é obrigatório." });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/search_history`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          region: region || 'BR',
          year: year || 'ALL',
          order_by: order || 'relevance',
          total_results: totalResults || 0
        })
      });
      const data = await response.json();
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      await fetch(`${SUPABASE_URL}/rest/v1/search_history?id=gt.0`, {
        method: 'DELETE',
        headers
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido." });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
