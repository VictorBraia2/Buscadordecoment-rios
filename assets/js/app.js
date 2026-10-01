// CONFIGURAÇÃO DO SUPABASE (Credenciais Reais)
const SUPABASE_URL = "https://swumxtcnknwuyramygwf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y2qmuYPREDMqdfcvO_JU2w_8jHtGHmF";

let sbClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function' && SUPABASE_URL.startsWith("https://")) {
  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (e) {
    console.warn("Supabase não pôde ser iniciado:", e);
  }
}

let videoOrder = 'relevance';
let videoCount = 20;
let currentVideos = [];
let currentQuery = '';
let allResults = [];
let keywords = [];

// AUTENTICAÇÃO SUPABASE + PERFIL
let authLoading = false;
let currentUser = null;      // usuário logado (null = deslogado)
let historyUserId = null;    // evita recarregar o histórico duas vezes para o mesmo usuário
let historyItems = [];       // itens do histórico atualmente exibidos

const AVATAR_FALLBACK = '/assets/img/avatar-placeholder.svg';
const GOOGLE_BUTTON_HTML = `<svg class="w-4 h-4" viewBox="0 0 24 24">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
</svg> Continuar com o Google`;

function resetLoginButton() {
  const button = document.getElementById('btnGoogleLogin');
  if (!button) return;
  authLoading = false;
  button.disabled = false;
  button.classList.remove('opacity-60', 'cursor-wait');
  button.innerHTML = GOOGLE_BUTTON_HTML;
}

function setProfileSearchCount(n) {
  const el = document.getElementById('profileSearchCount');
  if (el) el.textContent = String(Number(n) || 0);
}

function updateHistoryVisibility() {
  // O histórico faz parte do perfil: aparece nas duas abas, mas só para quem está logado.
  const card = document.getElementById('cardHistory');
  if (card) card.classList.toggle('hidden', !currentUser);
}

function setAuthView(user) {
  const loggedOut = document.getElementById('loggedOutView');
  const loggedIn = document.getElementById('loggedInView');
  if (!loggedOut || !loggedIn) return;
  currentUser = user || null;

  if (user) {
    // Primeiro some com o botão de login e mostra o perfil; o preenchimento dos dados vem depois,
    // para que um dado ausente (ex.: sem foto) nunca deixe o botão de login à mostra.
    loggedOut.classList.add('hidden');
    loggedIn.classList.remove('hidden');
    loggedIn.classList.add('flex');
    try {
      const meta = user.user_metadata || {};
      document.getElementById('userName').textContent = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Usuário');
      document.getElementById('userEmail').textContent = user.email || '';
      const avatarEl = document.getElementById('userAvatar');
      avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = AVATAR_FALLBACK; };
      avatarEl.src = meta.avatar_url || meta.picture || AVATAR_FALLBACK;
      const created = user.created_at ? new Date(user.created_at) : null;
      document.getElementById('profileCreatedAt').textContent =
        created && !isNaN(created) ? created.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    } catch (e) {
      console.warn('Erro ao preencher o perfil:', e);
    }
  } else {
    loggedIn.classList.add('hidden');
    loggedIn.classList.remove('flex');
    loggedOut.classList.remove('hidden');
    resetLoginButton();
    historyUserId = null;
    historyItems = [];
    setProfileSearchCount(0);
    const created = document.getElementById('profileCreatedAt');
    if (created) created.textContent = '—';
    const list = document.getElementById('historyListContainer');
    if (list) list.innerHTML = '';
  }
  updateHistoryVisibility();
}

async function loginWithGoogle() {
  if (!sbClient) return showErr('O Supabase não foi inicializado. Verifique as configurações do projeto.');
  if (authLoading) return;
  authLoading = true;
  hideErr();

  const button = document.getElementById('btnGoogleLogin');
  if (button) {
    button.disabled = true;
    button.classList.add('opacity-60', 'cursor-wait');
    button.textContent = 'Abrindo o Google...';
  }

  const { error } = await sbClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { access_type: 'offline', prompt: 'select_account' }
    }
  });

  if (error) {
    resetLoginButton();
    showErr(`Erro ao entrar com o Google: ${error.message}`);
  }
}

async function logout() {
  if (!sbClient) return;
  const { error } = await sbClient.auth.signOut();
  if (error) return showErr(`Erro ao sair: ${error.message}`);
  setAuthView(null);
  toast('Sessão encerrada.');
}

async function getAuthToken() {
  if (!sbClient) return null;
  const { data: { session } } = await sbClient.auth.getSession();
  return session?.access_token || null;
}

// Mostra erro devolvido pelo Google/Supabase no retorno do OAuth (ex.: redirect não autorizado).
function reportAuthErrorFromUrl() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(window.location.search);
  const desc = fromQuery.get('error_description') || fromHash.get('error_description');
  if (desc) showErr(`Erro no login: ${desc.replace(/\+/g, ' ')}`);
}

// Remove #access_token / ?code da barra de endereço depois que a sessão foi criada.
function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  const authKeys = ['code', 'error', 'error_code', 'error_description'];
  const hasHash = /access_token|refresh_token|error_description/.test(url.hash);
  const hasQuery = authKeys.some(k => url.searchParams.has(k));
  if (!hasHash && !hasQuery) return;
  authKeys.forEach(k => url.searchParams.delete(k));
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

function loadHistoryOnce(user) {
  if (!user || historyUserId === user.id) return;
  historyUserId = user.id;
  // Fora do callback do Supabase Auth, para evitar reentrância.
  setTimeout(() => renderHistoryUI(), 0);
}

async function initializeAuth() {
  if (!sbClient) {
    setAuthView(null);
    showErr('Não foi possível carregar o login com o Google. Recarregue a página ou verifique sua conexão.');
    return;
  }

  reportAuthErrorFromUrl();

  // Registrar o listener ANTES de pedir a sessão garante que nenhum evento do retorno do OAuth se perca.
  sbClient.auth.onAuthStateChange((event, session) => {
    const wasLoggedIn = !!currentUser;
    authLoading = false;
    setAuthView(session?.user || null);
    if (session?.user) {
      loadHistoryOnce(session.user);
      if (event === 'SIGNED_IN') {
        cleanAuthParamsFromUrl();
        if (!wasLoggedIn) toast('Login realizado com sucesso.');
      }
    }
  });

  try {
    const { data: { session }, error } = await sbClient.auth.getSession();
    if (error) console.warn('Erro ao restaurar a sessão:', error);
    setAuthView(session?.user || null);
    if (session?.user) {
      cleanAuthParamsFromUrl();
      loadHistoryOnce(session.user);
    }
  } catch (e) {
    console.error('Falha ao verificar a sessão:', e);
    setAuthView(null);
  }
}

function bindUIEvents() {
  const on = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  on('btnGoogleLogin', 'click', loginWithGoogle);
  on('btnLogout', 'click', logout);
  on('btnAddKw', 'click', addKw);
  on('kwInput', 'keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKw();
    }
  });
  on('orderRel', 'click', () => setOrder('relevance'));
  on('orderDate', 'click', () => setOrder('date'));
  on('cnt10', 'click', () => setCount(10));
  on('cnt20', 'click', () => setCount(20));
  on('cnt50', 'click', () => setCount(50));
  on('btnClearHistory', 'click', clearSearchHistory);
  on('btnSearch', 'click', doSearch);
  on('btnVideoSearch', 'click', doVideoSearch);
  on('btnExport', 'click', doExport);
  on('btnClear', 'click', clearAll);
  on('tabComments', 'click', () => switchTab('comments'));
  on('tabVideos', 'click', () => switchTab('videos'));
  on('videoInput', 'input', onVideoInput);
  on('searchInline', 'input', applyInline);

  const tagArea = document.getElementById('tagArea');
  tagArea?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-keyword]');
    if (button) removeKw(button.dataset.removeKeyword || '');
  });

  const historyList = document.getElementById('historyListContainer');
  historyList?.addEventListener('click', event => {
    const item = event.target.closest('[data-history-index]');
    if (!item) return;
    const entry = historyItems[Number(item.dataset.historyIndex)];
    if (entry) loadSearchFromHistory(entry);
  });

  const videoArea = document.getElementById('videoResArea');
  videoArea?.addEventListener('click', event => {
    const button = event.target.closest('[data-send-comments]');
    if (button) sendToComments(button.dataset.sendComments || '');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  bindUIEvents();
  initializeAuth();
});

// Voltando do Google com o botão "Voltar" (cache de página), destrava o botão de login.
window.addEventListener('pageshow', event => {
  if (event.persisted && !currentUser) resetLoginButton();
});

function switchTab(tab) {
  const isC = (tab === 'comments');
  
  document.getElementById('tabComments').className = `pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${isC ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`;
  document.getElementById('tabVideos').className = `pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${!isC ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`;
  
  document.getElementById('panelComments').style.display = isC ? 'block' : 'none';
  document.getElementById('panelVideos').style.display = !isC ? 'block' : 'none';
  
  document.getElementById('cardVideosInput').style.display = isC ? 'block' : 'none';
  document.getElementById('cardKeywords').style.display = isC ? 'block' : 'none';
  document.getElementById('cardDisplayCols').style.display = isC ? 'block' : 'none';
  document.getElementById('cardExportOpts').style.display = isC ? 'block' : 'none';
  
  document.getElementById('cardVideoSearch').style.display = isC ? 'none' : 'block';
  document.getElementById('cardVideoFilters').style.display = isC ? 'none' : 'block';
  
  document.getElementById('btnSearch').style.display = isC ? 'flex' : 'none';
  document.getElementById('btnVideoSearch').style.display = isC ? 'none' : 'flex';
  
  if (!isC) {
    document.getElementById('btnExport').classList.add('hidden');
    document.getElementById('btnClear').classList.add('hidden');
  } else if (allResults && allResults.length > 0) {
    document.getElementById('btnExport').classList.remove('hidden');
    document.getElementById('btnClear').classList.remove('hidden');
  }
}

function setOrder(order) {
  videoOrder = order;
  const rel = document.getElementById('orderRel');
  const dat = document.getElementById('orderDate');
  
  rel.className = order === 'relevance' 
    ? 'flex-1 py-1.5 text-xs font-medium rounded-md bg-white shadow-sm text-brand-600 border border-slate-200' 
    : 'flex-1 py-1.5 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700';
    
  dat.className = order === 'date' 
    ? 'flex-1 py-1.5 text-xs font-medium rounded-md bg-white shadow-sm text-brand-600 border border-slate-200' 
    : 'flex-1 py-1.5 text-xs font-medium rounded-md text-slate-500 hover:text-slate-700';
}

function setCount(n) {
  videoCount = n;
  ['cnt10','cnt20','cnt50'].forEach(id => {
    const el = document.getElementById(id);
    const num = parseInt(el.textContent);
    el.className = (num === n) 
      ? 'flex-1 py-1.5 text-xs font-medium rounded-lg border border-brand-500 bg-brand-50 text-brand-700 transition-colors' 
      : 'flex-1 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors';
  });
}

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fmtNum(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1).replace('.0','') + 'bi';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace('.0','') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1).replace('.0','') + 'K';
  return String(n);
}
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; } }

function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = `<svg class="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> ${msg}`;
  t.classList.remove('translate-y-24', 'opacity-0');
  clearTimeout(t._t); 
  t._t = setTimeout(() => t.classList.add('translate-y-24', 'opacity-0'), 3000);
}

function showErr(msg) { document.getElementById('errorMsg').textContent=msg; document.getElementById('errorBox').classList.remove('hidden'); document.getElementById('errorBox').classList.add('flex'); }
function hideErr() { document.getElementById('errorBox').classList.add('hidden'); document.getElementById('errorBox').classList.remove('flex'); }

function sendToComments(url) {
  const ta = document.getElementById('videoInput');
  ta.value = ta.value.trim() ? ta.value.trim() + '\n' + url : url;
  onVideoInput();
  switchTab('comments');
  toast('Adicionado à fila de extração!');
}

function friendlyHistoryError(message) {
  return /search_history|schema cache|relation .* does not exist/i.test(message || '')
    ? 'A tabela search_history não está disponível no Supabase. Execute o arquivo supabase/schema.sql no SQL Editor.'
    : (message || 'Erro ao acessar o histórico.');
}

// Salva uma pesquisa no histórico do perfil (só quando há usuário logado).
async function saveHistoryEntry({ query, region = 'BR', year = 'ALL', order = 'relevance', totalResults = 0, searchType = 'videos' }) {
  try {
    const token = await getAuthToken();
    if (!token) return;
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query, region, year, order, totalResults, searchType })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Não foi possível salvar o histórico.');
    await renderHistoryUI();
  } catch (e) {
    console.error('Erro ao salvar histórico:', e);
    showErr(friendlyHistoryError(e.message));
  }
}

function shortenSource(value) {
  const v = String(value || '').trim();
  const id = v.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return id ? `youtu.be/${id[1]}` : (v.length > 34 ? v.slice(0, 34) + '…' : v);
}

async function renderHistoryUI() {
  const container = document.getElementById('historyListContainer');
  if (!container) return;
  try {
    const token = await getAuthToken();
    if (!token) {
      container.innerHTML = '<p class="text-slate-400 p-1">Faça login para salvar o histórico.</p>';
      return;
    }
    const res = await fetch('/api/history', { headers: { 'Authorization': `Bearer ${token}` } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      container.innerHTML = `<p class="text-red-400 p-1">${esc(friendlyHistoryError(payload.error))}</p>`;
      return;
    }
    // A API devolve { items, total }; aceita também o formato antigo (array puro).
    const items = Array.isArray(payload) ? payload : (payload.items || []);
    const total = Array.isArray(payload) ? items.length : (Number(payload.total) || items.length);
    historyItems = items;
    setProfileSearchCount(total);

    if (!items.length) {
      container.innerHTML = '<p class="text-slate-400 p-1">Nenhuma pesquisa registrada ainda.</p>';
      return;
    }
    container.innerHTML = items.map((item, idx) => {
      const isComments = item.search_type === 'comments';
      const when = new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      let title, meta;
      if (isComments) {
        const urls = String(item.query || '').split('\n').map(u => u.trim()).filter(Boolean);
        title = shortenSource(urls[0]) + (urls.length > 1 ? ` (+${urls.length - 1})` : '');
        meta = `Comentários • ${Number(item.total_results) || 0} extraído(s)`;
      } else {
        title = item.query;
        meta = `Vídeos • ${item.region} • ${item.year} • ${Number(item.total_results) || 0} vídeo(s)`;
      }
      return `
      <div class="history-item p-2 hover:bg-slate-100 rounded-lg border border-slate-100 transition-colors cursor-pointer flex justify-between items-center gap-2" data-history-index="${idx}" title="Abrir esta pesquisa novamente">
        <div class="truncate">
          <div class="font-semibold text-slate-800 truncate">${esc(title)}</div>
          <div class="text-[10px] text-slate-400 truncate">${esc(meta)}</div>
        </div>
        <span class="text-[10px] text-slate-400 flex-shrink-0">${esc(when)}</span>
      </div>`;
    }).join('');
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
    container.innerHTML = '<p class="text-red-400 p-1">Não foi possível carregar o histórico.</p>';
  }
}

async function clearSearchHistory() {
  try {
    const token = await getAuthToken();
    if (!token) return;
    const res = await fetch('/api/history', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Não foi possível limpar o histórico.');
    await renderHistoryUI();
    toast('Histórico limpo.');
  } catch (e) {
    showErr(friendlyHistoryError(e.message));
  }
}

function loadSearchFromHistory(item) {
  if (!item) return;
  if (item.search_type === 'comments') {
    // Reabre as fontes na aba de comentários; a extração só roda quando o usuário clicar (gasta cota da API).
    document.getElementById('videoInput').value = item.query || '';
    onVideoInput();
    switchTab('comments');
    toast('Fontes carregadas. Clique em "Extrair Comentários".');
    return;
  }
  switchTab('videos');
  if (item.query) document.getElementById('videoQuery').value = item.query;
  if (item.region) document.getElementById('regionSelect').value = item.region;
  if (item.year) document.getElementById('dateSelect').value = item.year;
  if (item.order_by) setOrder(item.order_by);
  setCount(Math.max(10, Math.min(50, Number(item.total_results) || 20)));
  doVideoSearch({ skipHistory: true }); // reabrir uma pesquisa não cria um novo registro duplicado
}

function onVideoInput() {
  const val = document.getElementById('videoInput').value.trim();
  const badge = document.getElementById('videoBadge');
  if (!val) { badge.innerHTML = ''; return; }
  const lines = val.split('\n').filter(l => l.trim().length > 0);
  badge.innerHTML = `<span class="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-medium">${lines.length} fonte(s) identificada(s)</span>`;
}

function addKw() {
  const input = document.getElementById('kwInput');
  const val = input.value.trim().toLowerCase();
  if (!val || keywords.includes(val)) return;
  keywords.push(val);
  input.value = '';
  renderTags();
}

function removeKw(kw) {
  keywords = keywords.filter(k => k !== kw);
  renderTags();
}

function renderTags() {
  const area = document.getElementById('tagArea');
  if (!keywords.length) {
    area.innerHTML = '<span class="text-xs text-slate-400">Sem filtros (exibe todos)</span>';
    return;
  }
  area.innerHTML = keywords.map(k => `
    <span class="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-md border border-brand-100 font-medium">
      ${esc(k)}
      <button type="button" data-remove-keyword="${esc(k)}" class="hover:text-brand-900 font-bold ml-1" aria-label="Remover filtro ${esc(k)}">&times;</button>
    </span>
  `).join('');
}

async function doSearch() {
  const raw = document.getElementById('videoInput').value.trim();
  if (!raw) return showErr('Informe ao menos uma URL ou ID do YouTube.');
  hideErr();

  const urls = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const progCard = document.getElementById('progCard');
  const progList = document.getElementById('progList');
  progCard.classList.remove('hidden');
  progList.innerHTML = '';

  allResults = [];
  let succeeded = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const itemEl = document.createElement('div');
    itemEl.className = 'flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100';
    itemEl.innerHTML = `<span class="truncate max-w-[200px]">${esc(url)}</span><span class="font-bold text-brand-600">Extraindo...</span>`;
    progList.appendChild(itemEl);

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url, keywords })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na requisição');

      allResults.push(...(data.comments || []));
      succeeded++;
      itemEl.querySelector('span:last-child').className = 'font-bold text-green-600';
      itemEl.querySelector('span:last-child').textContent = `${data.comments?.length || 0} comentário(s)`;
    } catch (err) {
      itemEl.querySelector('span:last-child').className = 'font-bold text-red-500';
      itemEl.querySelector('span:last-child').textContent = `Erro: ${err.message}`;
    }
  }

  renderComments();
  if (currentUser && succeeded > 0) {
    saveHistoryEntry({ query: urls.join('\n').slice(0, 2000), region: '-', year: '-', totalResults: allResults.length, searchType: 'comments' });
  }
}

function renderComments() {
  const area = document.getElementById('resArea');
  const resHeader = document.getElementById('resHeader');
  const badge = document.getElementById('badgeCount');

  if (!allResults.length) {
    area.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">Nenhum comentário encontrado com os filtros selecionados.</div>`;
    resHeader.classList.add('hidden');
    return;
  }

  badge.textContent = `${allResults.length} comentário(s)`;
  resHeader.classList.remove('hidden');
  document.getElementById('btnExport').classList.remove('hidden');
  document.getElementById('btnClear').classList.remove('hidden');

  area.innerHTML = allResults.map(c => `
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
      <div class="flex items-center justify-between text-xs text-slate-500">
        <span class="font-bold text-slate-700">${esc(c.author || 'Anônimo')}</span>
        <span>${fmtDate(c.publishedAt)}</span>
      </div>
      <p class="text-sm text-slate-800 whitespace-pre-line">${esc(c.text)}</p>
      <div class="flex items-center justify-between pt-2 text-xs text-slate-400 border-t border-slate-50">
        <span>👍 ${c.likes || 0}</span>
        ${c.url ? `<a href="${c.url}" target="_blank" class="text-brand-600 hover:underline">Ver no YouTube</a>` : ''}
      </div>
    </div>
  `).join('');
}

async function doVideoSearch(opts) {
  const skipHistory = !!(opts && opts.skipHistory === true); // o clique no botão passa um Event, que é ignorado
  const q = document.getElementById('videoQuery').value.trim();
  if (!q) return showErr('Digite um termo para pesquisar vídeos.');
  hideErr();

  const regionCode = document.getElementById('regionSelect').value;
  const dateFilter = document.getElementById('dateSelect').value;

  try {
    const token = await getAuthToken();
    const res = await fetch('/api/videos', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ q, regionCode, dateFilter, order: videoOrder, maxResults: videoCount })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao buscar vídeos');

    currentVideos = data.videos || [];
    currentQuery = q;

    if (!skipHistory && currentUser) {
      saveHistoryEntry({ query: q, region: regionCode, year: dateFilter, order: videoOrder, totalResults: currentVideos.length, searchType: 'videos' });
    }
    renderVideos();
  } catch (err) {
    showErr(err.message);
  }
}

function renderVideos() {
  const container = document.getElementById('videoResArea');
  if (!currentVideos.length) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">Nenhum vídeo retornado para esta busca.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${currentVideos.map(v => `
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            ${v.thumbnail ? `<img src="${v.thumbnail}" class="w-full aspect-video object-cover" />` : ''}
            <div class="p-4 space-y-2">
              <h3 class="font-bold text-sm text-slate-800 line-clamp-2">${esc(v.title)}</h3>
              <p class="text-xs text-slate-500 truncate">${esc(v.channel)} •${fmtDate(v.publishedAt)}</p>
              <div class="flex gap-4 text-xs text-slate-600 pt-1">
                <span>👁 ${fmtNum(v.views || 0)}</span>
                <span>👍 ${fmtNum(v.likes || 0)}</span>
                <span>💬 ${fmtNum(v.comments || 0)}</span>
              </div>
            </div>
          </div>
          <div class="p-4 pt-0 flex gap-2">
            <button type="button" data-send-comments="${esc(v.url)}" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg text-xs transition-colors cursor-pointer text-center">
              Extrair Comentários
            </button>
            <a href="${v.url}" target="_blank" class="px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 text-center">
              Ver no YouTube ↗
            </a>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================
// EXPORTAÇÃO DE RELATÓRIOS
// ============================
// Nomes de formas do PptxGenJS (equivalentes a pptx.ShapeType.*), usáveis fora das funções de exportação
const SHAPE = { line: 'line', rect: 'rect', roundRect: 'roundRect' };

const REPORT = {
  font: 'Aptos', navy: '0F172A', accent: 'DC2626', light: 'F8FAFC', white: 'FFFFFF', slate: '475569', border: 'E2E8F0'
};

function safeFileName(value, fallback = 'relatorio') {
  const name = String(value || fallback).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (name || fallback).slice(0, 80);
}
function formatDuration(sec) {
  const s = Number(sec) || 0, h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function commentMetrics(comments) {
  const totalLikes = comments.reduce((sum, c) => sum + Number(c.likes || 0), 0);
  const uniqueAuthors = new Set(comments.map(c => c.author || 'Anônimo')).size;
  const uniqueVideos = new Set(comments.map(c => c.url || c.videoTitle || 'N/A')).size;
  const avgLikes = comments.length ? totalLikes / comments.length : 0;
  const byAuthor = {}, byVideo = {};
  comments.forEach(c => {
    const author = c.author || 'Anônimo', video = c.videoTitle || 'Vídeo sem título';
    byAuthor[author] = (byAuthor[author] || 0) + 1;
    byVideo[video] = (byVideo[video] || 0) + 1;
  });
  return {
    totalLikes, uniqueAuthors, uniqueVideos, avgLikes,
    topAuthors: Object.entries(byAuthor).sort((a,b) => b[1]-a[1]).slice(0, 10),
    topVideos: Object.entries(byVideo).sort((a,b) => b[1]-a[1]).slice(0, 10)
  };
}
function videoMetrics(videos) {
  const totalViews = videos.reduce((sum, v) => sum + Number(v.views || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + Number(v.likes || 0), 0);
  const totalComments = videos.reduce((sum, v) => sum + Number(v.comments || 0), 0);
  const avgViews = videos.length ? totalViews / videos.length : 0;
  const avgEngagement = videos.length ? videos.reduce((sum, v) => {
    const views = Number(v.views || 0);
    return sum + (views ? ((Number(v.likes || 0) + Number(v.comments || 0)) / views) * 100 : 0);
  }, 0) / videos.length : 0;
  const channels = {};
  videos.forEach(v => { const channel = v.channel || 'Canal não informado'; channels[channel] = (channels[channel] || 0) + Number(v.views || 0); });
  return { totalViews, totalLikes, totalComments, avgViews, avgEngagement, topChannels: Object.entries(channels).sort((a,b) => b[1]-a[1]).slice(0,10) };
}
function styleSheetHeader(ws, row, startCol, endCol) {
  for (let c = startCol; c <= endCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c });
    if (!ws[addr]) ws[addr] = { v: '' };
    ws[addr].s = { fill: { fgColor: { rgb: REPORT.navy } }, font: { bold: true, color: { rgb: REPORT.white }, sz: 11 }, alignment: { vertical: 'center', horizontal: 'left', wrapText: true } };
  }
}
function styleTitle(ws, addr) {
  if (!ws[addr]) return;
  ws[addr].s = { fill: { fgColor: { rgb: REPORT.accent } }, font: { bold: true, color: { rgb: REPORT.white }, sz: 18 }, alignment: { vertical: 'center', horizontal: 'left' } };
}
function finalizeWorksheet(ws, opts = {}) {
  if (opts.freeze) ws['!freeze'] = opts.freeze;
  if (opts.autofilter) ws['!autofilter'] = { ref: opts.autofilter };
  if (opts.cols) ws['!cols'] = opts.cols;
  if (opts.rows) ws['!rows'] = opts.rows;
}
function addSummarySheet(workbook, title, subtitle, metrics, highlights) {
  const rows = [[title], [subtitle], [], ['INDICADORES PRINCIPAIS'], ...metrics.map(m => [m[0], m[1]]), [], ['DESTAQUES'], ...highlights.map(h => [h[0], h[1]])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
  styleTitle(ws, 'A1');
  ws['A2'].s = { font: { italic: true, color: { rgb: REPORT.slate }, sz: 10 } };
  for (let c = 0; c < 2; c++) { const a = XLSX.utils.encode_cell({ r: 3, c }); if (ws[a]) ws[a].s = { fill: { fgColor: { rgb: REPORT.light } }, font: { bold: true, color: { rgb: REPORT.navy } } }; }
  for (let r = 5; r < 5 + metrics.length; r++) {
    if (ws[`A${r}`]) ws[`A${r}`].s = { font: { bold: true, color: { rgb: REPORT.slate } } };
    if (ws[`B${r}`]) ws[`B${r}`].s = { font: { bold: true, color: { rgb: REPORT.navy }, sz: 13 } };
  }
  const highStart = 6 + metrics.length;
  for (let c = 0; c < 2; c++) { const a = XLSX.utils.encode_cell({ r: highStart - 1, c }); if (ws[a]) ws[a].s = { fill: { fgColor: { rgb: REPORT.light } }, font: { bold: true, color: { rgb: REPORT.navy } } }; }
  ws['!cols'] = [{ wch: 40 }, { wch: 72 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, ws, 'Resumo');
}
function exportCommentsToExcel(comments) {
  if (!comments?.length) return showErr('Não há comentários para exportar.');
  const now = new Date(), m = commentMetrics(comments), workbook = XLSX.utils.book_new();
  addSummarySheet(workbook, 'RELATÓRIO ANALÍTICO DE COMENTÁRIOS — YOUTUBE', `Emissão: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, [
    ['Comentários mapeados', comments.length], ['Curtidas somadas', m.totalLikes], ['Média de curtidas/comentário', Number(m.avgLikes.toFixed(1))], ['Autores únicos', m.uniqueAuthors], ['Vídeos analisados', m.uniqueVideos]
  ], [
    ['Autor com mais comentários', `${m.topAuthors[0]?.[0] || 'N/A'} (${m.topAuthors[0]?.[1] || 0})`], ['Vídeo com mais comentários', `${m.topVideos[0]?.[0] || 'N/A'} (${m.topVideos[0]?.[1] || 0})`], ['Filtros aplicados', keywords.length ? keywords.join(', ') : 'Nenhum filtro de palavras'], ['Observação', 'A coleta segue os limites retornados pela YouTube Data API.']
  ]);
  const detailHeader = ['#','Autor','Comentário','Curtidas','Data de Publicação','Vídeo de Origem','Link do Vídeo'];
  const detailRows = comments.map((c,i) => [i+1, c.author || 'Anônimo', c.text || '', Number(c.likes || 0), fmtDate(c.publishedAt), c.videoTitle || 'N/A', c.url || '']);
  const ws = XLSX.utils.aoa_to_sheet([['DETALHAMENTO DOS COMENTÁRIOS'], [`Total: ${comments.length} comentário(s)`], [], detailHeader, ...detailRows]);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  styleTitle(ws, 'A1'); styleSheetHeader(ws, 4, 0, 6);
  detailRows.forEach((_, i) => { const row = i+5; for (let c=0;c<7;c++) { const cell=ws[XLSX.utils.encode_cell({r:row-1,c})]; if(cell) cell.s={alignment:{vertical:'top',wrapText:c===2},border:{bottom:{style:'hair',color:{rgb:REPORT.border}}}}; } const link=ws[`G${row}`]; if(link?.v) link.l={Target:link.v,Tooltip:'Abrir vídeo no YouTube'}; });
  finalizeWorksheet(ws, { freeze:{xSplit:0,ySplit:4}, autofilter:`A4:G${detailRows.length+4}`, cols:[{wch:7},{wch:24},{wch:76},{wch:12},{wch:18},{wch:38},{wch:45}], rows:[{hpt:28}] });
  XLSX.utils.book_append_sheet(workbook, ws, 'Comentários');
  const wa = XLSX.utils.aoa_to_sheet([['Autor','Comentários','Participação (%)'], ...m.topAuthors.map(([n,c])=>[n,c,Number(((c/comments.length)*100).toFixed(2))])]); styleSheetHeader(wa,1,0,2); wa['!cols']=[{wch:35},{wch:15},{wch:20}]; XLSX.utils.book_append_sheet(workbook,wa,'Autores');
  const wv = XLSX.utils.aoa_to_sheet([['Vídeo','Comentários','Participação (%)'], ...m.topVideos.map(([n,c])=>[n,c,Number(((c/comments.length)*100).toFixed(2))])]); styleSheetHeader(wv,1,0,2); wv['!cols']=[{wch:70},{wch:15},{wch:20}]; XLSX.utils.book_append_sheet(workbook,wv,'Vídeos');
  XLSX.writeFile(workbook, `Relatorio_Comentarios_${Date.now()}.xlsx`);
  toast('Relatório Excel de comentários exportado.');
}
function exportVideosToExcel(videos, queryTerm) {
  if (!videos?.length) return showErr('Nenhum vídeo disponível para exportar.');
  const now=new Date(), m=videoMetrics(videos), workbook=XLSX.utils.book_new();
  addSummarySheet(workbook,'RELATÓRIO DE PESQUISA DE VÍDEOS — YOUTUBE',`Termo: ${queryTerm || 'N/A'} | Emissão: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`,[
    ['Vídeos encontrados',videos.length],['Visualizações somadas',m.totalViews],['Curtidas somadas',m.totalLikes],['Comentários somados',m.totalComments],['Média de visualizações',Number(m.avgViews.toFixed(0))],['Taxa média de engajamento',`${m.avgEngagement.toFixed(2)}%`]
  ],[
    ['Canal com maior alcance no conjunto',`${m.topChannels[0]?.[0] || 'N/A'} (${fmtNum(m.topChannels[0]?.[1] || 0)} visualizações)`],['Ordenação usada',videoOrder === 'date' ? 'Mais recentes' : 'Visualizações'],['Região',document.getElementById('regionSelect')?.value || 'BR'],['Ano',document.getElementById('dateSelect')?.value || 'ALL']
  ]);
  const rows=[['Posição','Título do Vídeo','Canal','Visualizações','Curtidas','Comentários','Engajamento (%)','Duração','Publicação','Link'],...videos.map((v,i)=>{const engagement=Number(v.views||0)?(((Number(v.likes||0)+Number(v.comments||0))/Number(v.views))*100):0;return[i+1,v.title||'',v.channel||'',Number(v.views||0),Number(v.likes||0),Number(v.comments||0),Number(engagement.toFixed(2)),formatDuration(v.duration),fmtDate(v.publishedAt),v.url||''];})];
  const ws=XLSX.utils.aoa_to_sheet(rows); styleSheetHeader(ws,1,0,9); rows.slice(1).forEach((_,i)=>{const row=i+2;const link=ws[`J${row}`];if(link?.v)link.l={Target:link.v,Tooltip:'Abrir vídeo no YouTube'};}); finalizeWorksheet(ws,{freeze:{xSplit:0,ySplit:1},autofilter:`A1:J${rows.length}`,cols:[{wch:10},{wch:52},{wch:30},{wch:18},{wch:14},{wch:14},{wch:17},{wch:12},{wch:16},{wch:45}]}); XLSX.utils.book_append_sheet(workbook,ws,'Vídeos');
  const wc=XLSX.utils.aoa_to_sheet([['Canal','Visualizações no conjunto','Vídeos'],...m.topChannels.map(([channel,views])=>[channel,views,videos.filter(v=>(v.channel||'Canal não informado')===channel).length])]); styleSheetHeader(wc,1,0,2); wc['!cols']=[{wch:40},{wch:26},{wch:12}]; XLSX.utils.book_append_sheet(workbook,wc,'Canais');
  XLSX.writeFile(workbook,`Relatorio_Videos_${safeFileName(queryTerm)}_${Date.now()}.xlsx`); toast('Relatório Excel de vídeos exportado.');
}
function addPptHeader(slide,title,subtitle=''){slide.addText(title,{x:.55,y:.35,w:12.25,h:.45,fontFace:REPORT.font,fontSize:23,bold:true,color:REPORT.navy,margin:0});if(subtitle)slide.addText(subtitle,{x:.55,y:.84,w:12,h:.3,fontFace:REPORT.font,fontSize:9.5,color:REPORT.slate,margin:0});slide.addShape(SHAPE.line,{x:.55,y:1.22,w:12.15,h:0,line:{color:REPORT.border,pt:1}});}
function addMetricCard(slide,x,y,w,label,value){slide.addShape(SHAPE.roundRect,{x,y,w,h:1,rectRadius:.08,fill:{color:REPORT.light},line:{color:REPORT.border,pt:1}});slide.addText(label,{x:x+.18,y:y+.16,w:w-.36,h:.25,fontFace:REPORT.font,fontSize:9,color:REPORT.slate,margin:0});slide.addText(String(value),{x:x+.18,y:y+.42,w:w-.36,h:.42,fontFace:REPORT.font,fontSize:20,bold:true,color:REPORT.navy,margin:0});}
function addBarList(slide,title,entries,valueFormatter=fmtNum,xBase=.65){slide.addText(title,{x:xBase,y:1.55,w:5.2,h:.35,fontFace:REPORT.font,fontSize:14,bold:true,color:REPORT.navy,margin:0});const max=Math.max(...entries.map(e=>Number(e[1])||0),1);entries.slice(0,7).forEach(([label,value],i)=>{const y=2.02+i*.62,ratio=Math.max(.02,(Number(value)||0)/max);slide.addText(String(label).slice(0,42),{x:xBase,y,w:3.05,h:.26,fontFace:REPORT.font,fontSize:9,color:REPORT.slate,margin:0,fit:'shrink'});slide.addShape(SHAPE.roundRect,{x:xBase+3.1,y:y+.02,w:2,h:.18,rectRadius:.05,fill:{color:REPORT.border},line:{color:REPORT.border,transparency:100}});slide.addShape(SHAPE.roundRect,{x:xBase+3.1,y:y+.02,w:2*ratio,h:.18,rectRadius:.05,fill:{color:REPORT.accent},line:{color:REPORT.accent,transparency:100}});slide.addText(valueFormatter(value),{x:xBase+5.25,y:y-.02,w:.9,h:.24,fontFace:REPORT.font,fontSize:9,bold:true,color:REPORT.navy,margin:0,align:'right'});});}
function addFooter(slide,pageText){slide.addText('Análise YouTube',{x:.55,y:7.03,w:2,h:.2,fontFace:REPORT.font,fontSize:8,color:'94A3B8',margin:0});slide.addText(pageText,{x:11.5,y:7.03,w:1.2,h:.2,fontFace:REPORT.font,fontSize:8,color:'94A3B8',margin:0,align:'right'});}
async function exportCommentsToPowerPoint(comments){
  if(!comments?.length)return showErr('Não há comentários para exportar.'); if(!window.PptxGenJS)return showErr('A biblioteca de PowerPoint não foi carregada. Recarregue a página.');
  const m=commentMetrics(comments),pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='Análise YouTube';pptx.subject='Relatório analítico de comentários';pptx.title='Relatório Analítico de Comentários — YouTube';pptx.lang='pt-BR';const totalPages=4+Math.ceil(comments.length/8);let page=1;
  let slide=pptx.addSlide();slide.background={color:REPORT.navy};slide.addText('RELATÓRIO ANALÍTICO',{x:.72,y:1.12,w:11.6,h:.45,fontFace:REPORT.font,fontSize:28,bold:true,color:REPORT.white,margin:0});slide.addText('Comentários de vídeos do YouTube',{x:.72,y:1.67,w:11.6,h:.45,fontFace:REPORT.font,fontSize:22,color:'E2E8F0',margin:0});slide.addText(`Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,{x:.72,y:5.45,w:6.6,h:.3,fontFace:REPORT.font,fontSize:10,color:'CBD5E1',margin:0});slide.addShape(SHAPE.rect,{x:.72,y:6.15,w:2.4,h:.08,fill:{color:REPORT.accent},line:{color:REPORT.accent,transparency:100}});addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Resumo executivo','Indicadores consolidados da coleta atual');addMetricCard(slide,.65,1.55,2.75,'Comentários',comments.length);addMetricCard(slide,3.55,1.55,2.75,'Curtidas somadas',fmtNum(m.totalLikes));addMetricCard(slide,6.45,1.55,2.75,'Autores únicos',m.uniqueAuthors);addMetricCard(slide,9.35,1.55,2.75,'Vídeos analisados',m.uniqueVideos);slide.addText(`A média é de ${m.avgLikes.toFixed(1)} curtidas por comentário. ${keywords.length?`Filtro aplicado: ${keywords.join(', ')}.`:'Nenhum filtro de palavras foi aplicado.'}`,{x:.65,y:3.42,w:11.3,h:.75,fontFace:REPORT.font,fontSize:12,color:REPORT.slate,margin:0,fit:'shrink'});addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Onde está a concentração da conversa?','Autores e vídeos com maior volume de comentários no conjunto');addBarList(slide,'Top autores',m.topAuthors,v=>String(v),.65);addBarList(slide,'Top vídeos',m.topVideos,v=>String(v),6.7);addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Metodologia e filtros','Contexto para interpretação do relatório');[['Palavras-chave',keywords.length?keywords.join(', '):'Nenhuma'],['Quantidade de comentários',String(comments.length)],['Vídeos de origem',String(m.uniqueVideos)],['Métrica de interação','Curtidas por comentário e distribuição do volume'],['Observação','A API do YouTube pode retornar somente parte dos comentários disponíveis para um vídeo.']].forEach(([label,value],i)=>{const y=1.62+i*.83;slide.addText(label,{x:.75,y,w:2.7,h:.25,fontFace:REPORT.font,fontSize:10,bold:true,color:REPORT.navy,margin:0});slide.addText(value,{x:3.25,y,w:8.9,h:.45,fontFace:REPORT.font,fontSize:11,color:REPORT.slate,margin:0,fit:'shrink'});});addFooter(slide,`${page++}/${totalPages}`);
  for(let start=0;start<comments.length;start+=8){slide=pptx.addSlide();addPptHeader(slide,'Detalhamento dos comentários',`Registros ${start+1}–${Math.min(start+8,comments.length)} de ${comments.length}`);comments.slice(start,start+8).forEach((c,idx)=>{const y=1.48+idx*.63;slide.addShape(SHAPE.roundRect,{x:.58,y:y-.04,w:12.15,h:.55,rectRadius:.04,fill:{color:idx%2?REPORT.white:REPORT.light},line:{color:REPORT.border,pt:.5}});slide.addText(`${start+idx+1}. ${c.author||'Anônimo'}`,{x:.75,y,w:2.05,h:.2,fontFace:REPORT.font,fontSize:8.5,bold:true,color:REPORT.navy,margin:0,fit:'shrink'});slide.addText(String(c.text||'').slice(0,135),{x:2.9,y:y-.01,w:6.2,h:.34,fontFace:REPORT.font,fontSize:8.5,color:REPORT.slate,margin:0,fit:'shrink'});slide.addText(`${c.likes||0} curtidas`,{x:9.25,y,w:1,h:.2,fontFace:REPORT.font,fontSize:8.5,bold:true,color:REPORT.navy,margin:0,align:'right'});slide.addText(fmtDate(c.publishedAt),{x:10.35,y,w:1.05,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0,align:'right'});});addFooter(slide,`${page++}/${totalPages}`);}
  await pptx.writeFile({fileName:`Relatorio_Comentarios_${Date.now()}.pptx`});toast('Relatório PowerPoint de comentários exportado.');
}
async function exportVideosToPowerPoint(videos,queryTerm){
  if(!videos?.length)return showErr('Nenhum vídeo disponível para exportar.');if(!window.PptxGenJS)return showErr('A biblioteca de PowerPoint não foi carregada. Recarregue a página.');
  const m=videoMetrics(videos),pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='Análise YouTube';pptx.subject='Relatório de pesquisa de vídeos';pptx.title=`Pesquisa de Vídeos — ${queryTerm||'YouTube'}`;pptx.lang='pt-BR';const totalPages=4+Math.ceil(videos.length/10);let page=1;
  let slide=pptx.addSlide();slide.background={color:REPORT.navy};slide.addText('RELATÓRIO DE PESQUISA',{x:.72,y:1.12,w:11.6,h:.45,fontFace:REPORT.font,fontSize:28,bold:true,color:REPORT.white,margin:0});slide.addText(queryTerm||'Pesquisa YouTube',{x:.72,y:1.67,w:11.6,h:.45,fontFace:REPORT.font,fontSize:22,color:'E2E8F0',margin:0});slide.addText(`Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,{x:.72,y:5.45,w:6.6,h:.3,fontFace:REPORT.font,fontSize:10,color:'CBD5E1',margin:0});slide.addShape(SHAPE.rect,{x:.72,y:6.15,w:2.4,h:.08,fill:{color:REPORT.accent},line:{color:REPORT.accent,transparency:100}});addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Resumo da pesquisa',`${videos.length} vídeos no conjunto atual`);addMetricCard(slide,.65,1.55,2.75,'Vídeos',videos.length);addMetricCard(slide,3.55,1.55,2.75,'Visualizações',fmtNum(m.totalViews));addMetricCard(slide,6.45,1.55,2.75,'Curtidas',fmtNum(m.totalLikes));addMetricCard(slide,9.35,1.55,2.75,'Comentários',fmtNum(m.totalComments));slide.addText(`Média de visualizações: ${fmtNum(Math.round(m.avgViews))}. Taxa média de engajamento: ${m.avgEngagement.toFixed(2)}%.`,{x:.65,y:3,w:11.2,h:.45,fontFace:REPORT.font,fontSize:13,color:REPORT.slate,margin:0});addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Alcance por canal','Soma das visualizações dos vídeos retornados');addBarList(slide,'Top canais',m.topChannels,v=>fmtNum(v),.65);addFooter(slide,`${page++}/${totalPages}`);
  slide=pptx.addSlide();addPptHeader(slide,'Critérios da pesquisa','Parâmetros utilizados no conjunto atual');[['Termo',queryTerm||'N/A'],['Ordenação',videoOrder==='date'?'Mais recentes':'Visualizações'],['Região',document.getElementById('regionSelect')?.value||'BR'],['Ano',document.getElementById('dateSelect')?.value||'ALL'],['Quantidade solicitada',String(videoCount)]].forEach(([label,value],i)=>{const y=1.62+i*.83;slide.addText(label,{x:.75,y,w:2.7,h:.25,fontFace:REPORT.font,fontSize:10,bold:true,color:REPORT.navy,margin:0});slide.addText(value,{x:3.25,y,w:8.9,h:.35,fontFace:REPORT.font,fontSize:11,color:REPORT.slate,margin:0,fit:'shrink'});});addFooter(slide,`${page++}/${totalPages}`);
  for(let start=0;start<videos.length;start+=10){slide=pptx.addSlide();addPptHeader(slide,'Detalhamento dos vídeos',`Registros ${start+1}–${Math.min(start+10,videos.length)} de ${videos.length}`);const headers=[['#',.65,.35],['Título',1.1,4.35],['Canal',5.55,2.15],['Views',7.8,1.05],['Likes',8.9,1],['Com.',9.95,.85],['Data',10.85,1.15]];headers.forEach(([label,x,w])=>slide.addText(label,{x,y:1.5,w,h:.23,fontFace:REPORT.font,fontSize:8.5,bold:true,color:REPORT.navy,margin:0}));videos.slice(start,start+10).forEach((v,idx)=>{const y=1.82+idx*.48;slide.addText(String(start+idx+1),{x:.65,y,w:.35,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0});slide.addText(String(v.title||'').slice(0,68),{x:1.1,y,w:4.35,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.navy,margin:0,fit:'shrink'});slide.addText(String(v.channel||'').slice(0,30),{x:5.55,y,w:2.15,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0,fit:'shrink'});slide.addText(fmtNum(v.views||0),{x:7.8,y,w:1.05,h:.2,fontFace:REPORT.font,fontSize:8,bold:true,color:REPORT.navy,margin:0,align:'right'});slide.addText(fmtNum(v.likes||0),{x:8.9,y,w:1,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0,align:'right'});slide.addText(fmtNum(v.comments||0),{x:9.95,y,w:.85,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0,align:'right'});slide.addText(fmtDate(v.publishedAt),{x:10.85,y,w:1.15,h:.2,fontFace:REPORT.font,fontSize:8,color:REPORT.slate,margin:0,align:'right'});slide.addShape(SHAPE.line,{x:.65,y:y+.29,w:11.35,h:0,line:{color:REPORT.border,pt:.6}});});addFooter(slide,`${page++}/${totalPages}`);}
  await pptx.writeFile({fileName:`Relatorio_Videos_${safeFileName(queryTerm)}_${Date.now()}.pptx`});toast('Relatório PowerPoint de vídeos exportado.');
}
async function doExport(){
  const isXlsx=document.getElementById('exp_xlsx').checked,isPptx=document.getElementById('exp_pptx').checked;if(!isXlsx&&!isPptx)return showErr('Selecione Excel e/ou PowerPoint para exportar.');hideErr();const isVideosPanel=document.getElementById('panelVideos').style.display==='block';
  try{if(isVideosPanel){if(isXlsx)exportVideosToExcel(currentVideos,currentQuery);if(isPptx)await exportVideosToPowerPoint(currentVideos,currentQuery);}else{if(isXlsx)exportCommentsToExcel(allResults);if(isPptx)await exportCommentsToPowerPoint(allResults);}}catch(e){console.error('Erro na exportação:',e);showErr(`Erro ao gerar o relatório: ${e.message||e}`);}
}

function clearAll() {
  allResults = [];
  document.getElementById('videoInput').value = '';
  document.getElementById('resHeader').classList.add('hidden');
  document.getElementById('btnExport').classList.add('hidden');
  document.getElementById('btnClear').classList.add('hidden');
  document.getElementById('resArea').innerHTML = `
    <div class="h-64 flex flex-col items-center justify-center text-slate-400 text-center">
      <svg class="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      <p class="text-sm">Preencha as URLs na barra lateral e clique em <strong class="text-slate-600">Extrair</strong></p>
    </div>`;
  toast('Sessão limpa!');
}

function applyInline() {
  const term = document.getElementById('searchInline').value.toLowerCase();
  if (!term) return renderComments();
  const filtered = allResults.filter(c => c.text && c.text.toLowerCase().includes(term));
  
  const area = document.getElementById('resArea');
  area.innerHTML = filtered.map(c => `
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
      <div class="flex items-center justify-between text-xs text-slate-500">
        <span class="font-bold text-slate-700">${esc(c.author || 'Anônimo')}</span>
        <span>${fmtDate(c.publishedAt)}</span>
      </div>
      <p class="text-sm text-slate-800 whitespace-pre-line">${esc(c.text)}</p>
    </div>
  `).join('');
}


