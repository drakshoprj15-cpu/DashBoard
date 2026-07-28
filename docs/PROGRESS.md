# PROGRESS — Plataforma Infinity

> Central de vendas online: checkout, loja, landing pages, pagamentos, analytics em tempo real.
> Nome: **Infinity** (definido pelo usuário em 2026-07-28; configurável em `src/lib/brand.ts`).

Última atualização: 2026-07-28

---

## 1. Diagnóstico do repositório (2026-07-28)

| Item | Situação encontrada |
|---|---|
| Base | Projeto recém-criado com `create-next-app` (Next.js **16.2.12**, React 19.2.4, TypeScript 5, Tailwind CSS 4, ESLint 9 flat config) |
| Estrutura | Apenas `src/app` padrão (layout, page, globals.css). Nenhum código de negócio. |
| Git | Repositório **não inicializado** (sem `.git`) |
| `/docs/referencias/` | **Pasta não existe** — nenhuma imagem de referência foi encontrada no repositório. Decisão: seguir fielmente a direção visual descrita no briefing (sidebar escura, conteúdo off-white, acento magenta/rosa neon, verde/amarelo/vermelho/azul semânticos). Quando as imagens forem adicionadas, a identidade será refinada. |
| Banco | Nenhum. |
| Credenciais | Nenhuma (`.env` inexistente). |

### Particularidades do Next.js 16 (breaking changes respeitadas no código)

- `params`, `searchParams`, `cookies()`, `headers()` — **somente assíncronos**.
- `middleware.ts` → renomeado para **`proxy.ts`** (função `proxy`, runtime nodejs).
- `next lint` removido — ESLint chamado diretamente.
- Turbopack é o bundler padrão (dev e build).
- `revalidateTag(tag, profile)` exige 2º argumento; `updateTag` para read-your-writes.

---

## 2. Decisões técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| ORM | **Drizzle ORM** (não Prisma) | Melhor para serverless/Vercel (sem binário), SQL transparente, migrations versionadas via `drizzle-kit`, ótima integração com Supabase/Postgres. |
| Auth | Supabase Auth via `@supabase/ssr` | Sessão em cookies, compatível com Server Components/Actions. |
| Multi-tenancy | `workspace_id` em todas as entidades de negócio + RLS | Exigência do briefing. |
| IDs | UUID v4 (`gen_random_uuid()`) | Seguros, não sequenciais. |
| Valores monetários | `bigint` em **centavos** + coluna `currency` | Evita erro de ponto flutuante. |
| Pagamentos | Arquitetura de adapters (`PaymentProvider`) | Checkout independente de gateway. |
| Componentes | shadcn/ui (estilo new-york, adicionados manualmente) | Tailwind v4 + Radix. |
| Modo demo | Quando Supabase não está configurado, o painel abre em **modo demonstração** com banner permanente e dados claramente rotulados como fictícios | Permite desenvolver/avaliar a UI sem credenciais, sem fingir integração real. |
| Idioma da UI | Português (pt-BR) | Público-alvo do usuário. |

---

## 3. Status por fase

### FASE 1 — Fundação — ✅ CONCLUÍDA (nesta iteração)

- [x] Diagnóstico do repositório
- [x] Análise de referências (pasta ausente — registrado acima)
- [x] Leitura da documentação local do Next.js 16 (breaking changes)
- [x] Dependências da stack instaladas
- [x] Design system (tokens CSS, dark/light/system, cores semânticas)
- [x] Componentes UI base (button, card, input, label, badge, skeleton, avatar, dropdown, dialog, sheet, tooltip, separator, empty-state, switch, tabs, select)
- [x] Layout do painel: sidebar escura recolhível com submenus + drawer mobile + preferência persistida (cookie)
- [x] Header com busca, sino de notificações, alternância de tema e menu do usuário
- [x] Rodapé da sidebar (plano, workspace, usuário, suporte, status)
- [x] Autenticação: telas de login, cadastro e recuperação de senha + Server Actions + clientes Supabase SSR
- [x] Proteção de rotas via `src/proxy.ts` (Next 16)
- [x] Modo demonstração explícito quando Supabase não está configurado
- [x] Schema completo do banco em Drizzle (60+ tabelas, ver `src/database/schema/`)
- [x] `drizzle.config.ts` + scripts de migration
- [x] Interface `PaymentProvider` (contrato dos adapters)
- [x] Todas as rotas do menu criadas com empty states ("em desenvolvimento — Fase N")
- [x] `.env.example`
- [x] Documentação inicial (`docs/`)
- [x] TypeScript check + build de produção passando

### FASE 2 — Catálogo e loja — ⏳ não iniciada
### FASE 3 — Checkout — 🔄 em andamento (2026-07-28)
- **Checkout público TechNébula no ar** em `/checkout/[slug]`, no mesmo layout da landing page: etapas Contacto → Entrega → Pagamento, resumo fixo no desktop e recolhível no mobile, seletor de quantidade, portes grátis calculados, seleção MB WAY/Multibanco (únicos métodos do Broski).
- Validação Zod no servidor (telemóvel PT +3519…, código postal NNNN-NNN, NIF opcional de 9 dígitos) + proteção contra envio duplicado.
- **Honestidade**: sem BROSKI_API_KEY/DATABASE_URL o envio valida os dados e informa "Pagamento ainda não ativado — nenhum valor foi cobrado" (testado no navegador). Nenhum sucesso falso é simulado.
- Pendências da fase: cobrança real (pedido no banco + Broski + webhook, junto da Fase 4), página de sucesso/pendente/erro pós-pagamento, order bump e cupons.
### FASE 4 — Pagamentos — 🔌 **INTEGRAÇÃO REAL CONECTADA** (2026-07-28)
- Fluxo completo validado no navegador: checkout → cliente + pedido + item gravados no Supabase → pagamento criado na API real do Broski → voucher Multibanco (entidade 45648 / ref. 828679172) exibido ao cliente → pedido em `awaiting_payment`.
- Rota de webhook `/api/webhooks/broski` implementada com verificação HMAC obrigatória, deduplicação por `event_id` e atualização de pedido/pagamento. **Ainda não ativada** — exige URL pública (deploy) + `BROSKI_WEBHOOK_SECRET`.
- Pendente: página de sucesso pós-pagamento, e-mail de confirmação, reembolso pelo painel, listagem de pedidos na UI.

#### Notas anteriores da fase
- Interface `PaymentProvider` definida.
- **Adapter Broski implementado** (2026-07-28) a partir da OpenAPI oficial (https://docs.broski.pt/openapi.yaml): criação de pedido MB WAY/Multibanco, consulta, estorno total/parcial, verificação HMAC de webhooks, teste de conexão. Status: 🖥️ interface pronta sem credenciais — nenhuma chamada real validada ainda. Detalhes em docs/PAYMENTS.md.
- Catálogo de gateways em `src/payment-providers/catalog.ts` (Broski = principal).
### FASE 5 — Analytics / Painel ao Vivo — ⏳ não iniciada
### FASE 6 — Financeiro — ⏳ não iniciada
### FASE 7 — Pixels e integrações — ⏳ não iniciada
### FASE 8 — Landing pages e editor — ⏳ parcialmente adiantada
- **Landing page TechNébula publicada** (2026-07-28) em `/p/cadeira-gaming-alpha-gamer-nebula` — página estática em código (produto: cadeira ALPHA GAMER Nébula), listada na aba Landing pages do painel. Conteúdo editável em `src/features/landing/technebula-data.ts`.
- Decisão registrada: o usuário enviou um zip/URL de uma página que imitava a loja real PCDIGA (domínio pcdiga.vip); a importação foi **recusada** por se tratar de imitação de marca de terceiros. A página foi recriada do zero com marca própria "TechNébula", escolhida pelo usuário. Avaliações fictícias ("996 avaliações") NÃO foram reproduzidas — o campo `rating` fica nulo até haver avaliações reais.
- Botão "Comprar já" leva a `/checkout/[slug]`, que exibe honestamente "checkout em construção" até as Fases 3/4.
- Editor por blocos e criação de páginas pelo painel continuam planejados para a Fase 8.
### FASE 9 — Clientes e comunicação — ⏳ não iniciada
### FASE 10 — Produção (testes E2E, CI, deploy) — ⏳ não iniciada

---

## 4. Dependências de credenciais (bloqueios externos)

Nada abaixo impede o desenvolvimento — as interfaces são construídas e ficam **claramente desconectadas** até haver credenciais.

| Serviço | Variáveis | Necessário para |
|---|---|---|
| Supabase | ✅ **CONECTADO em 2026-07-28** — projeto `bptlhagfzldokgoeaabx` (eu-west-1), 60 tabelas migradas via pooler (conexão direta é IPv6-only), login real ativo, modo demo desativado. RLS ainda pendente. | — |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Envio real de e-mails |
| **Broski** ⭐ gateway principal | ✅ **CONECTADO em 2026-07-28** — `BROSKI_API_KEY` validada com chamada real (HTTP 200). Pagamento Multibanco real criado no teste (`ord_k2t8byfbq8trnv`, pedido `IN-MS4ER5YF71S`). Falta `BROSKI_WEBHOOK_SECRET` (só após o deploy, quando houver URL pública). | — |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Pagamentos (sandbox e produção) |
| Mercado Pago | `MERCADO_PAGO_ACCESS_TOKEN` | Pagamentos |
| Pagar.me | `PAGARME_API_KEY` | Pagamentos |
| Asaas | `ASAAS_API_KEY` | Pagamentos |
| UTMify | `UTMIFY_API_TOKEN` | Envio de conversões |
| Meta | `META_PIXEL_ID`, `META_CAPI_TOKEN` | Conversions API |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting, filas |
| Sentry | `SENTRY_DSN` | Monitoramento |

---

## 5. Diferenciação de status (regra do projeto)

- ✅ **Funcionalidade pronta** — implementada e validada.
- 🧪 **Sandbox** — funciona em ambiente de teste do provedor.
- 🖥️ **Interface pronta sem credenciais** — UI + adapter completos, aguardando chaves; exibida como "desconectada".
- 🔌 **Integração real conectada** — chamada real validada.
- 📝 **Planejada** — ainda não implementada.

Nunca se afirma que algo está pronto quando está apenas desenhado.

---

## 6. Log de alterações

### 2026-07-28 — Fase 1 (Fundação)
- Projeto base criado (create-next-app, Next 16.2.12).
- Stack instalada, design system, layout do painel, autenticação, schema Drizzle completo, rotas do menu com empty states, documentação inicial.
- Validação executada: `tsc --noEmit` ✅ · `eslint src` ✅ · `vitest` (5 testes) ✅ · `next build` ✅ (33 rotas + proxy) · verificação visual no navegador (dashboard, login, submódulos) sem erros de console ✅.
- Git ainda não inicializado — commit não realizado (a integração com GitHub/CI está prevista para a Fase 10; pode ser antecipada quando o usuário quiser).
- Migrations ainda não geradas: `drizzle-kit generate` será executado quando houver `DATABASE_URL`/`DIRECT_URL` (as tabelas já estão 100% modeladas em código).
