import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: `Método ${req.method} não permitido` });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://swumxtcnknwuyramygwf.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Y2qmuYPREDMqdfcvO_JU2w_8jHtGHmF';

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
  }

  const table = sb.from('search_history');

  if (req.method === 'GET') {
    const { data, error, count } = await table
      .select('id, query, region, year, order_by, total_results, search_type, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.error('Erro ao consultar search_history:', error);
      const missingTable = /search_history|search_type|relation .* does not exist|schema cache/i.test(error.message || '');
      return res.status(500).json({
        error: missingTable
          ? 'A tabela search_history ainda não foi criada no Supabase. Execute supabase/schema.sql no SQL Editor.'
          : error.message
      });
    }

    return res.status(200).json({ items: data || [], total: count ?? (data || []).length });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const query = String(body.query || '').trim().slice(0, 2000);
    const region = String(body.region || 'BR').trim().slice(0, 10);
    const year = String(body.year || 'ALL').trim().slice(0, 10);
    const order = body.order === 'date' ? 'date' : 'relevance';
    const searchType = body.searchType === 'comments' ? 'comments' : 'videos';
    const totalResults = Math.max(0, Math.min(10000, Number.parseInt(body.totalResults, 10) || 0));

    if (!query) return res.status(400).json({ error: 'O termo da pesquisa é obrigatório.' });

    const { data, error } = await table.insert([{
      user_id: user.id,
      query,
      region,
      year,
      order_by: order,
      total_results: totalResults,
      search_type: searchType
    }]).select('id, query, region, year, order_by, total_results, search_type, created_at').single();

    if (error) {
      console.error('Erro ao inserir search_history:', error);
      const missingTable = /search_history|search_type|relation .* does not exist|schema cache/i.test(error.message || '');
      return res.status(500).json({
        error: missingTable
          ? 'A tabela search_history ainda não foi criada no Supabase. Execute supabase/schema.sql no SQL Editor.'
          : error.message
      });
    }

    return res.status(201).json({ success: true, data });
  }

  const { error } = await table.delete().eq('user_id', user.id);
  if (error) {
    console.error('Erro ao excluir search_history:', error);
    const missingTable = /search_history|search_type|relation .* does not exist|schema cache/i.test(error.message || '');
    return res.status(500).json({
      error: missingTable
        ? 'A tabela search_history ainda não foi criada no Supabase. Execute supabase/schema.sql no SQL Editor.'
        : error.message
    });
  }

  return res.status(200).json({ success: true });
}
