# Análise YouTube — Buscador de Comentários e Vídeos

Aplicação web para pesquisar vídeos do YouTube, extrair comentários por vídeo, filtrar termos e gerar relatórios em Excel e PowerPoint.

## Estrutura

```text
├── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── img/
│   │   └── avatar-placeholder.svg
│   └── js/
│       ├── app.js
│       └── tailwind.config.js
├── api/
│   ├── comments.js
│   ├── history.js
│   ├── title.js
│   └── videos.js
├── supabase/
│   └── schema.sql
└── vercel.json
```

O `index.html` contém apenas a estrutura da página. Os estilos próprios ficam em `assets/css/styles.css` e a lógica da aplicação fica em `assets/js/app.js`.

## Autenticação com Google + histórico

A aplicação usa Supabase Auth. O botão de Google agora acompanha o estado real da sessão por `onAuthStateChange`, evitando que a tela volte para o estado “deslogado” depois do retorno do OAuth.

Para o histórico de pesquisas, execute **uma vez** o arquivo `supabase/schema.sql` no **Supabase Dashboard → SQL Editor**. Ele cria a tabela `public.search_history`, o índice e as políticas de Row Level Security para cada usuário acessar apenas o próprio histórico.

Também é necessário configurar o provedor Google no Supabase Auth. O fluxo `signInWithOAuth({ provider: 'google', options: { redirectTo } })` precisa usar uma URL que esteja na lista de Redirect URLs permitidas no projeto; a própria documentação do Supabase recomenda configurar o Site URL de produção e os redirects de desenvolvimento/preview. Consulte o callback exibido na página do provedor Google do seu projeto ao configurar o OAuth. 

## Variáveis do Vercel

Configure no projeto:

```text
YOUTUBE_API_KEY=...
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=...
```

As chaves públicas do Supabase podem ser usadas no frontend; a chave da API do YouTube deve continuar apenas no ambiente do servidor.

## Relatórios

### Excel

As exportações agora usam uma biblioteca com suporte a estilos de célula e geram relatórios com:

- aba **Resumo** com emissão, métricas e destaques;
- aba detalhada de **Comentários** ou **Vídeos** com filtros e congelamento de cabeçalho;
- ranking de **Autores**, **Vídeos** ou **Canais**, conforme o tipo de relatório;
- larguras de coluna e formatação pensadas para leitura e apresentação.

### PowerPoint

A exportação `.pptx` gera uma apresentação pronta para apresentação, incluindo capa, resumo executivo, métricas, concentração por autor/canal, critérios de pesquisa e páginas de detalhamento.

## Publicação na Vercel

O projeto usa Vercel Serverless Functions em `/api`. Faça o deploy do diretório inteiro e configure as variáveis de ambiente antes de publicar.

A configuração de rotas não referencia mais a antiga rota `/api/search`, que não existe neste projeto.

## Observação sobre a API do YouTube

A quantidade de comentários disponível depende do que a YouTube Data API retorna para cada vídeo e dos limites de paginação/cota usados pelo projeto.
