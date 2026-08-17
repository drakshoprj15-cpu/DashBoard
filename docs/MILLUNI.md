# Sincronização Milluni → Clientes

A integração lê os pedidos pagos da Milluni e cria ou atualiza um contacto na
aba **Clientes** do Infinity. O e-mail normalizado é a chave de deduplicação.
Pedidos pendentes e falhados são ignorados, e nenhum pedido ou lançamento
financeiro é criado no Infinity.

## Variáveis do Infinity (Vercel)

Configure apenas em **Production**:

- `MILLUNI_BASE_URL`: `https://milluni.vip`
- `MILLUNI_ADMIN_USER`: utilizador administrativo da Milluni
- `MILLUNI_ADMIN_PASSWORD`: senha administrativa da Milluni
- `CRON_SECRET`: valor aleatório com pelo menos 32 caracteres

As credenciais são usadas somente pela rota do servidor e nunca são enviadas
ao navegador.

## Agendamento no GitHub

O workflow `.github/workflows/milluni-customers-sync.yml` chama a integração a
cada cinco minutos. Configure estes segredos no repositório:

- `MILLUNI_SYNC_URL`:
  `https://www.painelinfinitydash.online/api/cron/milluni-customers`
- `MILLUNI_CRON_SECRET`: o mesmo valor de `CRON_SECRET` configurado no Vercel

O endpoint aceita também `POST` de um utilizador autenticado no Infinity com
permissão de importação, para execução manual e diagnóstico.
