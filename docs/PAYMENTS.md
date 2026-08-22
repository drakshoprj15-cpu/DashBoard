# Pagamentos — Infinity

Arquitetura de pagamentos baseada em adapters: o checkout depende apenas da
interface `PaymentProvider` (`src/payment-providers/types.ts`), nunca de um
gateway específico.

## Gateway principal: Broski ⭐

Escolhido pelo usuário (2026-07-28). Gateway português de **MB WAY** e
**Multibanco**, somente **EUR**.

- Painel: https://app.broski.pt · Documentação: https://docs.broski.pt
- Adapter: `src/payment-providers/broski/index.ts` — implementado estritamente
  a partir da OpenAPI oficial (`https://docs.broski.pt/openapi.yaml`).

### Status atual (honesto)

🖥️ **Interface pronta sem credenciais** — o código do adapter está completo e
segue a especificação oficial, mas **nenhuma chamada real foi validada ainda**
(depende de `BROSKI_API_KEY`). Assim que houver credenciais, o botão "Testar
conexão" da página Processador (Fase 4) fará a validação real.

### Fatos da API (da documentação oficial — nada inventado)

| Item               | Valor                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL           | `https://api.broski.pt`                                                                                                                          |
| Autenticação       | `Authorization: Bearer sk_live_…` (server-to-server; CORS bloqueia browser)                                                                      |
| Métodos            | `mbway` (confirmação no telemóvel; €0,50–€5.000) e `multibanco` (voucher entidade/referência)                                                    |
| Moeda              | apenas `EUR`, valores em cêntimos                                                                                                                |
| Criar pedido       | `POST /v1/orders` (header `Idempotency-Key` obrigatório; `customer.email` obrigatório; `checkout_url` recomendado sempre)                        |
| Consultar          | `GET /v1/orders/{id}` · Listar: `GET /v1/orders` (paginação por cursor)                                                                          |
| Estorno            | `POST /v1/orders/{id}/refunds` (corpo `{}` = total; `{amount}` = parcial; `Idempotency-Key` obrigatória; só pedidos pagos)                       |
| Cancelamento       | **não existe na API** — pedidos expiram sozinhos                                                                                                 |
| Clientes           | **sem endpoint** — criados automaticamente pelo e-mail no pedido                                                                                 |
| Status             | `pending`, `awaiting_payment`, `paid`, `expired`, `failed`, `refunded`                                                                           |
| Webhooks           | `order.awaiting_payment`, `order.paid`, `order.failed`, `order.expired`, `order.refunded`, `payout.paid`, `dispute.created`                      |
| Assinatura webhook | Header `Broski-Signature: t=<unix>,v1=<hex>` — `v1 = HMAC-SHA256(secret, t + "." + corpo_cru)`, tolerância ±5 min, deduplicar por `id` do evento |
| Rate limit         | 120 req/min por chave · corpo máx. 64 KB                                                                                                         |

### Mapeamento de status Broski → plataforma

| Broski             | Infinity (`payment_status`) |
| ------------------ | --------------------------- |
| `pending`          | `processing`                |
| `awaiting_payment` | `pending`                   |
| `paid`             | `approved`                  |
| `expired`          | `expired`                   |
| `failed`           | `refused`                   |
| `refunded`         | `refunded`                  |

### Regras de integração

1. Produto só é liberado no webhook **`order.paid`** com assinatura válida (nunca no retorno do checkout).
2. Multibanco pode confirmar **dias depois** — o pedido fica `awaiting_payment` exibindo entidade/referência/valor.
3. Webhooks são entregues _at-least-once_ e sem ordem — deduplicação por `evt_…` (tabela `payment_webhooks`, unique em `provider_key + external_event_id`).
4. A chave `sk_live_…` vive apenas no servidor (variável `BROSKI_API_KEY`), criptografada quando salva no banco.
5. MB WAY exige telemóvel PT (`+3519XXXXXXXX`) — o checkout valida antes de criar o pedido.

### Variáveis de ambiente

```
BROSKI_API_KEY=          # chave sk_live_… do painel (Configurações → API)
BROSKI_WEBHOOK_SECRET=   # segredo whbroski_… do endpoint de webhook
```

### Configuração do webhook (quando o site estiver no ar)

No painel Broski, registrar: `https://seu-dominio.com/api/webhooks/broski`
(rota criada na Fase 4). URL final exata — redirects 3xx fazem a entrega falhar.

## Links de pagamento (`/pagar/[slug]`)

Páginas de cobrança de valor fixo criadas em **Financeiro → Link de pagamento**.

**Não são um segundo sistema de pagamentos.** Cada cobrança cria um `orders`
(com `payment_link_id`) e um `payments` — as mesmas tabelas do checkout da
loja. É por isso que o webhook acima, o livro-caixa, o CRM de clientes, as
notificações e o Purchase da Meta funcionam para links sem nenhuma
implementação paralela.

| Peça                              | Onde                                       |
| --------------------------------- | ------------------------------------------ |
| Configuração + snapshot publicado | `payment_links` (migration 0017)           |
| Funil (visita → pago)             | `payment_link_events`                      |
| Cobranças                         | `orders` + `payments`, como qualquer venda |
| Escolha do gateway                | `src/payment-providers/resolve.ts`         |
| Cálculo do total                  | `src/features/payment-links/pricing.ts`    |

### Regras que não se dobram

1. **O navegador nunca envia valor.** `paymentLinkCheckoutSchema` não tem
   campo de preço, moeda ou frete — só o `shippingOptionId`. O total é
   recalculado a partir do link gravado (`computeLinkTotal`); um id de envio
   desconhecido cai na primeira opção, nunca em frete zero.
2. **Estado revalidado no servidor** a cada tentativa: um link desativado ou
   expirado entre a abertura da página e o clique não cobra.
3. **Limite de usos conta pagamentos confirmados** (`orders.status in
('paid','shipped','delivered')`), não cliques — daí não haver dupla cobrança
   num link de uso único.
4. **Idempotência antes do gateway**: o navegador cria um `attemptId` estável;
   pedido, item e uma reserva em `payments` são gravados na mesma transação,
   com índice único, antes do `POST /v1/orders`. Requests concorrentes
   reaproveitam a reserva; a mesma chave é enviada à Broski.
5. **"Pago" só vem do webhook.** A página faz polling em
   `/api/public/pagamento/[orderId]` (que devolve apenas estado e valor), e a
   resposta de criação da cobrança nunca é tratada como confirmação.
6. **Pixels/CAPI**: PageView e ViewContent carregam na visita,
   InitiateCheckout ocorre na primeira interação e Purchase sai no webhook,
   com valor confirmado. Vínculos específicos reutilizam `pixel_bindings`
   com `target_type = payment_link`; sem vínculo, valem os pixels globais.
7. **Rate limit**: criação e polling usam Upstash REST quando configurado,
   com fallback local apenas para desenvolvimento.
8. **Publicação imutável**: salvar rascunho não altera o link em produção;
   publicar cria `published_snapshot`. Métodos, domínio verificado e conta
   Broski são revalidados no servidor.

### Isolamento entre workspaces

Toda leitura e escrita administrativa filtra por `workspace_id` resolvido da
sessão no servidor — o workspace nunca chega pelo formulário. A rota pública
resolve o link só pelo slug (único no banco inteiro) e envia ao navegador
apenas o recorte de `toPublicPaymentLink`.

O webhook tenta primeiro os segredos Broski cifrados de contas ativas do
workspace e só então o fallback de ambiente. Transições de pagamento/pedido,
histórico e marcação da entrega são serializadas no Postgres; uma entrega que
falha antes de `processed_at` pode ser retomada por retry.

## Demais gateways (Fase 4)

Stripe, Mercado Pago, Pagar.me e Asaas estão no catálogo
(`src/payment-providers/catalog.ts`) com `adapterReady: false` — as interfaces
de configuração aparecerão como desconectadas até os adapters serem
implementados e as credenciais fornecidas.
