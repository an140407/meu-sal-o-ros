# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Regras do projeto

- Responder sempre em português.
- Nunca reescrever o histórico do git: sem force push, rebase ou amend em commits já enviados. O projeto está conectado ao Lovable e reescrever histórico faz o usuário perder o histórico lá (ver `AGENTS.md`). Commits na branch conectada sincronizam com o Lovable, então mantenha a branch funcionando.
- Nunca editar o `.env`.
- Mudanças de banco ficam num arquivo `.sql` separado em `drizzle/manual/` (numeração seguindo `drizzle/migrations/`), que o usuário aplica manualmente no SQL editor do Lovable Cloud. Não rodar `drizzle-kit`, não aplicar migrações por conta própria e não editar `src/integrations/supabase/types.ts` (gerado automaticamente).
- Ao terminar uma tarefa, entregar ao usuário a mensagem de commit sugerida.
- Não alterar `bun.lock` nem `bunfig.toml` sem confirmar com o usuário (o `bunfig.toml` tem uma trava de 24h de idade mínima de pacote, de propósito).

## Comandos

Gerenciador de pacotes: **bun** (`bun install`). O `bun.lock` aponta para o cache de pacotes do Lovable (`europe-west1-npm.pkg.dev`); se o install der 403, é bloqueio de rede do ambiente.

- `bun run dev` — servidor de desenvolvimento (vite)
- `bun run build` — build de produção (`build:dev` para modo development)
- `bun run lint` — eslint
- `bun run format` — prettier
- `bun run test` — vitest (jsdom), roda uma vez; `bun run test:watch` para modo watch
- Um único teste: `bunx vitest run src/test/app-routing.test.tsx` (ou `-t "nome do teste"`)

## Arquitetura

App web mobile-first (pt-BR, valores em R$) para uma nail designer registrar clientes e atendimentos. Usuário único, login email/senha. Fora do escopo: agenda, fotos, estoque, notificações (ver `README.md`).

**Stack:** TanStack Start (React 19, file-based routing) + TanStack Query + Supabase + Tailwind v4 + shadcn/ui (Radix). A configuração do Vite vem de `@lovable.dev/vite-tanstack-config`, que já inclui tanstackStart, react, tailwind, tsconfig paths, nitro e o alias `@`. **Não adicionar esses plugins manualmente em `vite.config.ts`**, senão ficam duplicados e quebra. O entry de servidor é `src/server.ts` (wrapper de erros de SSR).

**Rotas** (`src/routes/`, ver `src/routes/README.md`): roteamento por arquivos; `src/routeTree.gen.ts` é gerado, não editar. Não criar `src/pages/` nem layouts estilo Next/Remix; o único layout raiz é `__root.tsx`. Segmento dinâmico é `$id` (sem chaves). Todas as telas do app ficam sob `_authenticated/` (`atendimentos`, `clientes`, `ajustes`); o `route.tsx` desse grupo desliga SSR, redireciona para `/auth` se não houver usuário e renderiza a barra de navegação inferior.

**Dados:** `src/lib/data.ts` concentra os hooks de leitura (`useClientes`, `useServicos`, `useConfig`, `useAtendimentos`) sobre `supabase-js` + React Query. `useServicos` e `useConfig` chamam antes a RPC `garantir_setup`, que cria seed de serviços e configurações do usuário. Os componentes de formulário e lista ficam em `src/components/app/`.

**Banco:** Supabase com RLS por `user_id` em todas as tabelas (`clientes`, `servicos`, `configuracoes`, `atendimentos`). Schema em `drizzle/schema.ts` e migrações em `drizzle/migrations/`; `drizzle.config.ts` usa `LOVABLE_DB_MIGRATION_URL`. Regra de negócio em `atendimentos`: `taxa_percentual` vem das configurações (0 para pix/dinheiro), `valor_liquido = valor_bruto × (1 − taxa/100)`, e `percentual_ana` é copiado das configurações no momento do registro (histórico não muda se a configuração mudar).

**Cliente Supabase:** `src/integrations/supabase/` (`client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts` etc.) é código gerado/gerido pelo Lovable; evitar editar. As variáveis `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` vêm do `.env`.

**LGPD:** o cadastro de cliente exige checkbox de consentimento para armazenar dados de saúde (anamnese); manter essa obrigatoriedade ao mexer em `ClienteForm`.

**Testes:** `src/test/` (vitest + Testing Library); o teste atual cobre o roteamento do app.
