import { createClient } from '@supabase/supabase-js';

// Traduz o erro do Supabase/PostgREST em algo que o front-end consiga explicar de forma precisa.
function classifyError(error) {
  const message = error?.message || '';
  const code = error?.code || '';
  let kind = 'unknown';
  if (code === 'PGRST205' || code === '42P01' || /could not find the table|relation .* does not exist/i.test(message)) {
    kind = 'missing_table';
  } else if (code === 'PGRST204' || code === '42703' || (/search_type/i.test(message) && /column|schema cache/i.test(message))) {
    kind = 'missing_column';
  } else if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    kind = 'permission';
  }
  return { kind, code, detail: message };
}

function fail(res, label, error) {
  console.error(label, error);
  const { kind, code, detail } = classifyError(error);
  return res.status(500).json({ error: detail || 'Erro ao acessar o histórico.', kind, code, detail });
}

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
    return res.status(401).json({ error: 'Não autorizado', kind: 'auth' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://swumxtcnknwuyramygwf.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Y2qmuYPREDMqdfcvO_JU2w_8jHtGHmF';

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.', kind: 'auth' });
  }

  const table = () => sb.from('search_history');

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit, 10) || 15));

    const { data, error, count } = await table()
      .select('id, query, region, year, order_by, total_results, search_type, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return fail(res, 'Erro ao consultar search_history:', error);

    const { count: commentsCount, error: countError } = await table()
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('search_type', 'comments');
    if (countError) return fail(res, 'Erro ao contar search_history:', countError);

    const total = count ?? (data || []).length;
    return res.status(200).json({
      items: data || [],
      total,
      comments: commentsCount || 0,
      videos: Math.max(0, total - (commentsCount || 0))
    });
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

    const { data, error } = await table().insert([{
      user_id: user.id,
      query,
      region,
      year,
      order_by: order,
      total_results: totalResults,
      search_type: searchType
    }]).select('id, query, region, year, order_by, total_results, search_type, created_at').single();
    if (error) return fail(res, 'Erro ao inserir search_history:', error);

    return res.status(201).json({ success: true, data });
  }

  // DELETE: com ?id=123 remove um item; sem id, limpa todo o histórico do usuário.
  const id = Number.parseInt(req.query?.id, 10);
  let query = table().delete().eq('user_id', user.id);
  if (Number.isFinite(id)) query = query.eq('id', id);
  const { error } = await query;
  if (error) return fail(res, 'Erro ao excluir search_history:', error);

  return res.status(200).json({ success: true });
}
