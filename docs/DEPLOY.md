# Deploy — Infinity

Guia para colocar a plataforma em produção (Vercel + Supabase).

## 1. Criar projeto Supabase

1. Acesse https://supabase.com e crie um projeto.
2. Anote: `Project URL`, `anon key`, `service_role key` (Settings → API).
3. Em Settings → Database, copie as connection strings:
   - **Transaction pooler** (porta 6543) → `DATABASE_URL` (adicione `?pgbouncer=true`)
   - **Direct connection** (porta 5432) → `DIRECT_URL`

## 2. Configurar variáveis locais

```bash
cp .env.example .env.local
```

Preencha ao menos:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
DIRECT_URL=...
ENCRYPTION_KEY=...   # 32 bytes base64: openssl rand -base64 32
PANEL_HOST=painelinfinitydash.online   # ver secção 9
```

## 3. Executar migrations

```bash
npm run db:generate
npm run db:migrate
```

> Se o registro `drizzle.__drizzle_migrations` do banco estiver atrás dos
> arquivos (caso deste projeto: só a `0000` está registrada), `db:migrate`
> tenta reaplicar tudo e aborta. Nesse caso, aplique o arquivo novo sozinho:
>
> ```bash
> node scripts/apply-migration.mjs src/database/migrations/0007_tired_sugar_man.sql
> ```

## 4. Configurar autenticação (Supabase)

1. Authentication → Providers → Email: habilitado.
2. Authentication → URL Configuration:
   - Site URL: `https://seu-dominio.com`
   - Redirect URLs: `https://seu-dominio.com/auth/**`
3. Recomendado: manter "Confirm email" ativado.

## 5. Storage

Criar buckets (privados): `product-files`, `product-images` (público), `attachments`, `avatars`.

## 6. Realtime e RLS

- Habilitar Realtime nas tabelas `analytics_events`, `visitor_sessions`, `orders`, `payments` (usado pelo Live View — Fase 5).
- Aplicar as políticas de RLS (migration própria; ver docs/DATABASE.md).

## 7. Projeto na Vercel

1. Suba o repositório para o GitHub.
2. Importe na Vercel (framework: Next.js — detectado automaticamente).
3. Adicione TODAS as variáveis do `.env.example` com os valores reais.
4. Deploy.

## 8. Pós-deploy

- Configurar domínio próprio na Vercel.
- Configurar webhooks dos gateways apontando para `https://seu-dominio.com/api/webhooks/<gateway>` (rotas criadas na Fase 4).
- Definir `PANEL_HOST` (secção 9) antes de apontar qualquer domínio de loja.
- Configurar Resend (domínio verificado + `RESEND_API_KEY`).
- Validar: login, criação de produto, checkout sandbox (fases correspondentes).

## 9. Domínios próprios das lojas

O painel e as lojas ficam em domínios separados: um bloqueio na loja não
derruba o painel, e nenhum anúncio expõe o endereço administrativo.

1. Defina `PANEL_HOST` com o domínio do painel (sem `https://` e
   sem `www.`). Qualquer outro domínio apontado para a aplicação passa a ser
   tratado como domínio de loja: serve só as rotas públicas (`/`, `/p/`,
   `/checkout/`, `/legal/`, `/api/public`), e o painel redireciona para a raiz.
   **Em branco, tudo se comporta como painel** — nada quebra, mas os domínios
   de loja não funcionam.
2. Na Vercel: projeto → Settings → Domains → Add, com o domínio e o `www`.
3. No registrador do domínio, crie os registros de DNS:

   | Tipo  | Nome | Valor                                  |
   | ----- | ---- | -------------------------------------- |
   | A     | `@`  | `216.198.79.1`                         |
   | CNAME | `www`| `3d4970c7b04bd998.vercel-dns-017.com.` |

4. No painel, em **Landing pages → Domínios**, cadastre o domínio, escolha o
   produto que ele serve na raiz e clique em **Verificar** — a verificação
   chama `https://<domínio>/api/public/domain-check` e só marca como
   verificado se a própria aplicação responder.

Enquanto o domínio não estiver verificado, `/p/[slug]` continua servindo a
página no domínio do painel. Depois de verificado, esse endereço passa a
redirecionar permanentemente (308) para o domínio da loja.

## Checklist de validação de produção

- [ ] `npm run typecheck` sem erros
- [ ] `npm run lint` sem erros
- [ ] `npm run test` verde
- [ ] `npm run build` concluído
- [ ] Login real funcionando (Supabase configurado)
- [ ] Banner de modo demonstração AUSENTE em produção
