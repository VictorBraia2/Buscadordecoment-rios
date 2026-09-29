import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Utilizador não autenticado.' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { query, region, year, order, totalResults } = req.body;

      const { data, error } = await supabase
        .from('search_history')
        .insert([
          {
            user_id: user.id,
            query: query,
            region: region,
            year: year,
            order_by: order,
            total_results: totalResults
          }
        ]);

      if (error) throw error;
      return res.status(201).json({ message: 'Histórico salvo com sucesso.' });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('search_history')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      return res.status(200).json({ message: 'Histórico limpo com sucesso.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
