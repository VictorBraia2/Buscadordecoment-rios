Buscador de Comentários — YouTube

Ferramenta web para buscar e filtrar comentários de vídeos do YouTube por palavras-chave, com exportação para Excel e CSV.

O que faz

Você cola um ou mais links de vídeos do YouTube, define os termos que quer encontrar nos comentários e o sistema retorna tudo que bate com esses termos. Os resultados aparecem na tela com os termos destacados, e você pode exportar para Excel ou CSV com um clique.

Funciona em celular, tablet e computador. Não precisa instalar nada.

Estrutura do projeto


├── index.html          # interface completa (HTML + CSS + JS em um arquivo só)
├── vercel.json         # configuração de roteamento e headers
└── api/
    ├── comments.js     # busca os comentários via YouTube Data API v3
    └── title.js        # busca o título do vídeo
    
O frontend nunca fala direto com o YouTube. Ele chama as funções em `/api`, que rodam no servidor do Vercel. A chave de API fica nas variáveis de ambiente do Vercel e nunca chega ao navegador.

Como publicar no Vercel

1. Obtenha uma chave de API do YouTube**

Acesse o [Google Cloud Console](https://console.cloud.google.com), crie um projeto, ative a **YouTube Data API v3** e gere uma chave em Credenciais.

2. Faça o deploy

Entre em [vercel.com](https://vercel.com), clique em **Add New > Project**, faça upload do `.zip` com os arquivos e, antes de publicar, adicione a variável de ambiente:

YOUTUBE_API_KEY=sua_chave_aqui

Clique em **Deploy**. Em menos de um minuto o sistema estará no ar com um link público.

3. Atualizações futuras

Para atualizar sem criar um novo projeto, acesse **Deployments**, clique nos três pontos ao lado do deploy mais recente e escolha Redeploy.

Observação importante

O sistema não funciona se você abrir o arquivo `index.html` direto do computador. O navegador bloqueia as chamadas para a API por questões de segurança (CORS). Ele precisa estar publicado em um servidor com HTTPS para funcionar corretamente.

Funcionalidades

- Busca em um ou vários vídeos ao mesmo tempo
- Aceita URL completa, link curto (youtu.be) ou ID de 11 caracteres
- Filtro por palavras-chave com destaque visual nos resultados
- Filtro adicional dentro dos resultados já carregados
- Progresso individual por vídeo durante a busca
- Paginação dos resultados (25 por página)
- Exportação para Excel (.xlsx) e CSV com as colunas que você escolher
- Layout responsivo para celular, tablet e computador
- Chave de API protegida no servidor, invisível para o usuário final

Tecnologias

- HTML, CSS e JavaScript puro (sem frameworks)
- [SheetJS](https://sheetjs.com) para exportação Excel, carregado via CDN
- Vercel Functions (Node.js) para o backend
- YouTube Data API v3

Cota da API

A cota gratuita do Google é de **10.000 unidades por dia**. Cada página de 100 comentários consome aproximadamente 1 unidade. Para uso moderado, a cota gratuita é mais do que suficiente.
