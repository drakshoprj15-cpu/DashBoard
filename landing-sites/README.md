# Landing pages hospedadas fora do painel

Cada pasta aqui é um site estático completo, com projeto próprio na Vercel. É
o caminho para as páginas que **não nascem do editor visual** — um site já
exportado, entregue como pasta de HTML, CSS e imagens.

As páginas montadas em `/landing-pages` continuam a viver no banco e a ser
servidas pela rota `/lp/[slug]` desta aplicação. Publicá-las é uma escrita no
banco e não passa por aqui.

## Como se ligam ao painel

O registo em `landing_pages` é o mesmo dos outros: nome, slug, estado e
métricas. O que muda são as colunas de hospedagem:

| Coluna                  | Significado                                     |
| ----------------------- | ----------------------------------------------- |
| `hosting_provider`      | `vercel` para estas páginas, `infinity` para as do editor |
| `deployment_url`        | Endereço público que o cartão mostra e copia    |
| `deployment_project_id` | Projeto na Vercel                               |
| `deployment_id`         | Último deploy                                   |
| `deployment_status`     | `idle`, `preparing`, `deploying`, `ready`, `failed` |
| `deployment_log`        | Saída técnica do último envio                   |

Com `hosting_provider = "vercel"` o painel troca as ações: aparece
"Republicar na Vercel" em vez de "Publicar", e "Ver deploy" abre o registo
técnico. O botão "Publicar" do editor recusa estas páginas de propósito —
gravar um snapshot aqui criaria uma segunda versão da página em `/lp/<slug>`
a divergir da que o anúncio aponta.

## Estrutura de uma pasta

```
<slug>/
├── source/            fonte: o export original, intocado
│   ├── index.html
│   └── blocks/        blocos recuperados do payload do export
├── site.config.json   marca, checkout e variações
├── build.mjs          transforma source/ em public/lp/<slug>/index.html
├── vercel.json        rotas, cabeçalhos e cache
└── public/            o que vai ao ar (css, fonts, images, js)
```

`public/lp/` não é versionado: sai sempre do `build.mjs`, tanto localmente
como no deploy.

## Publicar

Pelo painel, em `/landing-pages` → menu da página → **Republicar na Vercel**.
Precisa de `VERCEL_TOKEN` (e `VERCEL_TEAM_ID`, se os projetos forem de uma
equipa) definidos no servidor — ver `.env.example`.

Pela linha de comandos, a partir da pasta do site:

```bash
node build.mjs && npx vercel deploy --prod
```

## Trocar a marca

Tudo o que identifica a loja está em `site.config.json` — nome, rodapé,
titular, NIF, morada, e-mail e endereço do checkout. Depois de editar, corra
o `build.mjs` e volte a publicar. O `build.mjs` falha de propósito se
encontrar resíduos da loja de origem no resultado.
