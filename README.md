YouTube Comment Finder

Ferramenta web para buscar, filtrar e exportar comentários de vídeos do YouTube por palavras-chave. Desenvolvida em HTML e JavaScript puro com um backend seguro em Vercel Serverless Functions.

Funcionalidades

Busca Multi-vídeo: Insira um ou vários links de vídeos do YouTube simultaneamente.
Filtros por Palavras-chave: Localize termos específicos nos comentários com destaque visual automático nos resultados.
Filtro em Tempo Real: Refine os dados já carregados instantaneamente.
Exportação: Baixe os resultados filtrados em formatos Excel (.xlsx) ou CSV, selecionando as colunas desejadas.
Segurança: A chave da API do YouTube permanece isolada no servidor, sem exposição no navegador.
Responsividade: Compatível com dispositivos móveis, tablets e computadores, sem necessidade de instalação.

 Estrutura do Projeto

O frontend estático comunica-se exclusivamente com funções de servidor protegidas:

text

├── index.html        # Interface completa (HTML, CSS e Vanilla JS)
├── vercel.json       # Configuração de roteamento e headers
└── api/
    ├── comments.js   # Intermediação com a YouTube Data API v3
    └── title.js      # Recuperação do título dos vídeos
Nota de Segurança: O frontend não realiza requisições diretas para o YouTube. As chamadas passam por /api, executadas no ambiente do Vercel onde a chave de API é mantida em variáveis de ambiente.

Tecnologias Utilizadas
Frontend: HTML5, CSS3 e JavaScript (Vanilla)

Manipulação de Planilhas: SheetJS (XLSX) via CDN

Backend: Vercel Serverless Functions (Node.js)

API Externa: YouTube Data API v3

Como Publicar no Vercel
O projeto requer suporte a Serverless Functions para operar as rotas de API (/api). Abrir o arquivo index.html diretamente no navegador resulta em bloqueio de CORS.

Passos para o Deploy:
Obtenha uma Chave de API:

Acesse o Google Cloud Console.

Crie um projeto, ative a YouTube Data API v3 e gere uma chave de credencial.

Realize o Deploy:

Acesse vercel.com.

Clique em Add New > Project e envie os arquivos do projeto.

Configure a seguinte variável de ambiente antes de finalizar:

YOUTUBE_API_KEY = sua_chave_de_api_aqui

Clique em Deploy.

Para atualizações futuras, acesse a aba Deployments no Vercel e selecione Redeploy.

Limitações e Cota da API
A cota padrão gratuita da YouTube Data API v3 é de 10.000 unidades diárias.

Cada lote de até 100 comentários consome aproximadamente 1 unidade, sendo adequada para uso moderado.
