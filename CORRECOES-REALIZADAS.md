# Lar Esperança — correções de segurança e persistência

## O que foi ajustado
- Login administrativo validado no Supabase Auth com e-mail e senha reais.
- O painel só abre se o usuário autenticado tiver `profiles.role = 'admin'`.
- Removidos caminhos de login genérico que aceitavam qualquer e-mail/senha como se fossem sucesso.
- Endpoints Express exigem `ADMIN_API_SECRET` configurado no servidor; não existe segredo administrativo fixo no código cliente.
- O Netlify não devolve mais o `index.html` para caminhos `/api/*` inexistentes.
- Quando a hospedagem estática não oferece a API, operações de crianças/perfis usam o cliente Supabase autenticado e ficam sujeitas às políticas RLS existentes.
- Falhas de gravação/exclusão são retornadas como erros reais, sem confirmar sucesso falso.
- Cadastro de novos perfis informa quando precisa de função de servidor segura para criar usuário no Supabase Auth.

## Preservação de dados
Nenhuma tabela, política, bucket ou registro foi alterado no banco durante estas correções. Os 18 registros existentes de crianças foram preservados.

## Publicação
O projeto usa `npm run build` e publica a pasta `dist`. O build não pôde ser validado neste ambiente porque a instalação das dependências excedeu o tempo limite. Portanto, não considere este pacote como build testado.

## Configuração
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são valores públicos do cliente.
- `SUPABASE_SERVICE_ROLE_KEY` e `ADMIN_API_SECRET`, se o servidor Express for usado, devem ficar apenas em variáveis de ambiente do servidor; nunca coloque esses segredos no frontend nem compartilhe em ZIP.
- A conta administrativa precisa existir no Supabase Auth e ter um registro correspondente em `public.profiles` com `role = 'admin'`.
- A segurança final depende das políticas RLS já existentes. Não desative RLS para contornar erros.

## Limitações conhecidas
- A publicação atual do Netlify estática não tem funções de API implantadas. A leitura e gravação direta só funcionam para as operações permitidas pelas políticas RLS ao usuário autenticado.
- Criar usuários/perfis novos e algumas operações privilegiadas exigem uma função de servidor segura; não são simuladas como sucesso.
- O upload de mídia continua sujeito às políticas de Storage; se a política negar, o app deve exibir o erro em vez de afirmar que salvou.
