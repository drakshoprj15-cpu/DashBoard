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

O workflow `.github/workflows/milluni-customers-sync.yml` chama a integração.
Configure estes segredos no repositório:

- `MILLUNI_SYNC_URL`: `https://<domínio-do-painel>/api/cron/milluni-customers`
- `MILLUNI_CRON_SECRET`: o mesmo valor de `CRON_SECRET` configurado no Vercel

> **Agendamento pausado.** O segredo `MILLUNI_SYNC_URL` ainda aponta para
> `www.painelinfinitydash.online`, domínio que deixou de resolver no DNS. Todas
> as execuções agendadas falhavam com `Could not resolve host`, por isso o
> gatilho `schedule` (a cada cinco minutos) foi comentado; a execução manual
> continua disponível.
>
> Para reativar:
>
> 1. Atualize `MILLUNI_SYNC_URL` com o endereço atual do painel. Tem de ser o
>    domínio do painel (ou um `*.vercel.app` sem Deployment Protection): um
>    domínio de loja redireciona `/api/cron/` para a raiz.
> 2. Confirme que o deploy de destino tem `CRON_SECRET` e as variáveis
>    `MILLUNI_*` da secção anterior.
> 3. Dispare o workflow manualmente (**Actions → Run workflow**) e confirme que
>    termina sem erro.
> 4. Descomente o bloco `schedule` no workflow.

O endpoint aceita também `POST` de um utilizador autenticado no Infinity com
permissão de importação, para execução manual e diagnóstico.
