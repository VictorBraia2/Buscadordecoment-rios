import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || "https://swumxtcnknwuyramygwf.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_Y2qmuYPREDMqdfcvO_JU2w_8jHtGHmF";
  
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { authorization: authHeader } }
  });

  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: "Sessão inválida" });
  }

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('search_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { query, region, year, order, totalResults } = req.body;
    const { data, error } = await sb
      .from('search_history')
      .insert([{
        user_id: user.id,
        query,
        region,
        year,
        order_by: order,
        total_results: totalResults
      }]);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { error } = await sb
      .from('search_history')
      .delete()
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Método não permitido" });
}
