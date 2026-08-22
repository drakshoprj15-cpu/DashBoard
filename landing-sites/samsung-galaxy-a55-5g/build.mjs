/**
 * Transforma o export estático da landing page (`source/index.html`) no site
 * publicável em `public/lp/<slug>/index.html`.
 *
 * O export veio de uma aplicação Next.js: o HTML renderizado no servidor está
 * completo, mas os chunks JavaScript que o acompanham só funcionam contra o
 * backend de origem (`/api/categorias`, `/api/loja-config`, `/_next/...`).
 * Mantê-los num deploy estático produziria 404s e risco de a hidratação
 * apagar a página. Por isso o build remove o runtime original e devolve as
 * interações num script próprio (`public/js/lp.js`), preservando intactos o
 * markup, o CSS, as fontes e as imagens.
 *
 * Cada substituição é verificada: se o export de origem mudar e uma âncora
 * deixar de existir, o build falha em vez de publicar uma página degradada.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "site.config.json"), "utf8"));

const OUT = join(here, "public", "lp", config.slug, "index.html");

// ---------------------------------------------------------------------------
// Utilidades de reescrita — todas verificam o número de ocorrências
// ---------------------------------------------------------------------------

let html = readFileSync(join(here, "source", "index.html"), "utf8");
const applied = [];

function replaceOnce(needle, value, label) {
  const first = html.indexOf(needle);
  if (first === -1) {
    throw new Error(`[build] âncora não encontrada: ${label}`);
  }
  if (html.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(
      `[build] âncora ambígua (mais de uma ocorrência): ${label}`,
    );
  }
  html = html.slice(0, first) + value + html.slice(first + needle.length);
  applied.push(label);
}

function replaceAll(needle, value, label, expected) {
  const parts = html.split(needle);
  const count = parts.length - 1;
  if (count === 0) throw new Error(`[build] âncora não encontrada: ${label}`);
  if (expected != null && count !== expected) {
    throw new Error(
      `[build] ${label}: esperava ${expected} ocorrências, encontrou ${count}`,
    );
  }
  html = parts.join(value);
  applied.push(`${label} (${count}x)`);
}

/** Remove todos os trechos entre `open` e `close`, inclusive. */
function cutBetween(open, close, label, expected) {
  let count = 0;
  for (;;) {
    const start = html.indexOf(open);
    if (start === -1) break;
    const end = html.indexOf(close, start + open.length);
    if (end === -1) throw new Error(`[build] ${label}: fecho não encontrado`);
    html = html.slice(0, start) + html.slice(end + close.length);
    count += 1;
    if (count > 200) throw new Error(`[build] ${label}: laço sem fim`);
  }
  if (count === 0) throw new Error(`[build] âncora não encontrada: ${label}`);
  if (expected != null && count !== expected) {
    throw new Error(
      `[build] ${label}: esperava ${expected} blocos, removeu ${count}`,
    );
  }
  applied.push(`${label} (${count}x)`);
}

const euro = (cents) =>
  `${(cents / 100).toFixed(2).replace(".", ",")} €`.replace(" ", " ");
const escapeAttribute = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// ---------------------------------------------------------------------------
// 1. Runtime de origem
// ---------------------------------------------------------------------------

cutBetween("<script", "</script>", "remove scripts do Next");
replaceOnce(
  '<link rel="preload" as="script" fetchpriority="low" href="js/webpack-8643cc7dd13fe455.js">',
  "",
  "remove preload do webpack",
);
replaceOnce(
  '<meta name="next-size-adjust" content="">',
  "",
  "remove meta do Next",
);
cutBetween(
  '<link rel="dns-prefetch"',
  ">",
  "remove dns-prefetch de rastreadores",
  3,
);

// ---------------------------------------------------------------------------
// 2. Metadados e assets em caminho absoluto (a página vive em /lp/<slug>/)
// ---------------------------------------------------------------------------

replaceOnce(
  "<title>Samsung Galaxy A55 5G — Flash Shopping</title>",
  `<title>${config.title}</title>`,
  "título",
);
replaceOnce(
  '<meta name="description" content=".lp-wrap{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#1a1f26;line-height:1.7;max-width:100%;margin:0;padding:0;backgrou">',
  `<meta name="description" content="${config.description}">` +
    `<meta property="og:title" content="${config.title}">` +
    `<meta property="og:description" content="${config.description}">` +
    `<meta property="og:type" content="product">` +
    `<meta property="og:image" content="/images/Gemini_Generated_Image_vgy653vgy653vgy6-PgVG1rnaKVEfGztMatZv3WhznlXCcI.webp">` +
    `<meta name="twitter:card" content="summary_large_image">`,
  "descrição e open graph",
);

replaceAll('href="css/', 'href="/css/', "css absoluto", 2);
replaceAll('href="images/', 'href="/images/', "imagens em href absoluto", 3);
replaceAll('src="images/', 'src="/images/', "imagens em src absoluto");

if (config.faviconUrl) {
  replaceOnce(
    '<link rel="shortcut icon" href="/images/favicon.svg"><link rel="icon" href="/images/favicon.svg" type="image/svg+xml">',
    `<link rel="shortcut icon" href="${escapeAttribute(config.faviconUrl)}"><link rel="icon" href="${escapeAttribute(config.faviconUrl)}">`,
    "favicon do painel",
  );
}

// ---------------------------------------------------------------------------
// 3. Blocos que o export gravou em <iframe srcdoc> corrompido
//
// O serializador do export não escapou as aspas do atributo `srcdoc`, então
// os dois blocos chegaram como markup solto dentro da tag. O conteúdo íntegro
// foi recuperado do payload do servidor e entra aqui inline: o CSS de ambos é
// inteiramente escopado (`.lp-wrap`, `.estoque-*`), o que dispensa o iframe e
// elimina de vez o redimensionamento por script que fixava 80px de altura.
// ---------------------------------------------------------------------------

const estoqueBlock = readFileSync(
  join(here, "source", "blocks", "estoque.html"),
  "utf8",
);
const descricaoBlock = readFileSync(
  join(here, "source", "blocks", "descricao.html"),
  "utf8",
);

function replaceIframe(replacement, label) {
  const start = html.indexOf('<iframe title="Descrição do produto"');
  if (start === -1) throw new Error(`[build] ${label}: iframe não encontrado`);
  const closing = "</iframe>";
  const end = html.indexOf(closing, start);
  if (end === -1) throw new Error(`[build] ${label}: </iframe> não encontrado`);
  html = html.slice(0, start) + replacement + html.slice(end + closing.length);
  applied.push(label);
}

// A ordem no documento é: bloco de estoque (ao lado do preço), depois a
// descrição longa (abaixo das abas).
replaceIframe(estoqueBlock, "bloco de estoque inline");
replaceIframe(
  `<div data-lp-panel="descricao">${descricaoBlock}</div>` +
    `<div data-lp-panel="envios" hidden>${readFileSync(join(here, "source", "blocks", "envios.html"), "utf8")}</div>`,
  "painéis das abas inline",
);

// Com os iframes já resolvidos, `</head>` volta a ser único no documento.
// Folha e script próprios entram no fim do <head>.
replaceOnce(
  "</head>",
  '<link rel="stylesheet" href="/css/lp.css"><script src="/js/lp.js" defer></script></head>',
  "injeta lp.css e lp.js",
);

// ---------------------------------------------------------------------------
// 4. Identidade de terceiros
//
// O export traz a marca, o titular, o NIF e a morada da loja de origem. Nada
// disso pode ir ao ar aqui: o texto sai e no lugar ficam marcadores visíveis
// para o dono da loja preencher em `site.config.json`.
// ---------------------------------------------------------------------------

const { brand } = config;
const brandName =
  brand.logoAlt || `${brand.wordMark} ${brand.wordMarkAccent}`.trim();
const headerBrand =
  `<span aria-label="${escapeAttribute(brandName)}" style="display:inline-block;color:#fff;font-size:clamp(1.8rem,7vw,2.4rem);font-weight:900;letter-spacing:-0.055em;line-height:1">` +
  `${brand.wordMark} <span style="font-weight:700">${brand.wordMarkAccent}</span>` +
  `</span>`;
const footerBrand = `<span class="text-primaria-viva">${brand.wordMark}</span><span class="text-white"> ${brand.wordMarkAccent}</span>`;

replaceOnce(
  '<header class="sticky top-0 z-[100] bg-white shadow-[0_1px_0_#E3E6EC]">',
  '<header class="sticky top-0 z-[100] shadow-[0_1px_0_rgba(0,0,0,0.16)]" style="background:#e30613">',
  "cabeçalho vermelho da marca própria",
);
cutBetween(
  '<div class="overflow-hidden bg-gradient-to-r from-primaria to-primaria-escura text-white">',
  "</div></div></div>",
  "remove carrossel animado do topo",
  1,
);

replaceAll(
  '<span class="text-primaria">Flash</span><span class="text-tinta"> Shopping</span>',
  headerBrand,
  "marca no cabeçalho",
);
replaceOnce(
  '<span class="text-primaria-viva">Flash</span><span class="text-white"> Shopping</span>',
  footerBrand,
  "marca no rodapé",
);
replaceOnce(
  '<span class="block text-center text-[0.6rem] font-medium uppercase tracking-[2px] text-tinta-suave">Portugal</span>',
  '<span class="block text-center text-[0.6rem] font-semibold uppercase tracking-[2px]" style="color:rgba(255,255,255,0.82)">Portugal</span>',
  "subtítulo claro no cabeçalho",
);
replaceOnce(
  "A tua loja de brinquedos online em Portugal. Os brinquedos mais vendidos, com entrega rápida e pagamento seguro por MB WAY e Multibanco.",
  brand.footerAbout,
  "texto do rodapé",
);

// Bloco de dados do titular: e-mail ofuscado, site, nome, NIF e morada.
const contactStart =
  '<div class="mt-5 space-y-1 text-[0.82rem] text-[#A7AFBD]">';
const contactEnd = "</div>";
{
  const start = html.indexOf(contactStart);
  if (start === -1)
    throw new Error("[build] bloco de contactos não encontrado");
  // O bloco tem parágrafos irmãos; fecha no </div> após a última <p>.
  const lastP = html.indexOf("Morada:", start);
  if (lastP === -1) throw new Error("[build] morada não encontrada");
  const end = html.indexOf(contactEnd, html.indexOf("</p>", lastP));
  html =
    html.slice(0, start) +
    `<div class="mt-5 space-y-1 text-[0.82rem] text-[#A7AFBD]">` +
    `<p>Email: ${brand.email}</p>` +
    `<p>Web: ${brand.website}</p>` +
    `<p>Titular: ${brand.legalName}</p>` +
    `<p>NIF: ${brand.taxId}</p>` +
    `<p>Morada: ${brand.address}</p>` +
    html.slice(end);
  applied.push("dados do titular substituídos por marcadores");
}

replaceOnce(
  "© 2026 Flash Shopping · <!-- -->AMANDA JULIA RODRIGUES MONCAO<!-- --> · NIF <!-- -->338416633<!-- --> · Todos os direitos reservados.",
  `© 2026 ${brand.wordMark} ${brand.wordMarkAccent} · ${brand.legalName} · NIF ${brand.taxId} · Todos os direitos reservados.`,
  "aviso de copyright",
);

// ---------------------------------------------------------------------------
// 5. Ligações que não existem neste deploy
//
// O export aponta para o catálogo da loja de origem (categorias de
// brinquedos) e para páginas institucionais que aqui não existem. As
// institucionais passam a apontar para as páginas legais do painel; as de
// catálogo saem, porque um menu de brinquedos numa página de telemóvel só
// produziria 404.
// ---------------------------------------------------------------------------

const legal = config.legalBaseUrl;
const legalMap = {
  "/privacidade": `${legal}/privacidade`,
  "/cookies": `${legal}/cookies`,
  "/termos": `${legal}/termos`,
  "/envios#devolucoes": `${legal}/devolucoes`,
  "/envios": `${legal}/envios`,
};
for (const [from, to] of Object.entries(legalMap)) {
  replaceAll(`href="${from}"`, `href="${to}"`, `link legal ${from}`);
}

// Menu lateral de categorias e gaveta do carrinho: no export os botões que os
// abriam eram montados pelo JavaScript de origem e não existem no HTML, então
// ambos são markup inalcançável — e o carrinho não teria backend para
// funcionar. Saem inteiros, com os respetivos fundos escurecidos.
cutBetween(
  '<div aria-hidden="true" class="fixed inset-0 z-[150] bg-black/50 transition-opacity duration-300 lg:hidden pointer-events-none opacity-0"></div><aside role="dialog" aria-modal="true" aria-label="Menu"',
  "</aside>",
  "remove gaveta de categorias",
  1,
);
cutBetween(
  '<div aria-hidden="true" class="fixed inset-0 z-[150] bg-black/50 transition-opacity duration-300 pointer-events-none opacity-0"></div><aside role="dialog" aria-modal="true" aria-label="Carrinho de compras"',
  "</aside>",
  "remove gaveta do carrinho",
  1,
);

// Migalhas de pão e restantes ligações de catálogo viram texto simples.
replaceOnce(
  '<a class="hover:text-primaria" href="/">Início</a>',
  '<span class="text-tinta-suave">Início</span>',
  "migalha Início",
);
replaceOnce(
  '<a class="hover:text-primaria" href="/categoria/50-off">50%OFF</a>',
  '<span class="text-tinta-suave">50%OFF</span>',
  "migalha categoria",
);

// Coluna "Loja" do rodapé: as categorias de origem dão lugar a âncoras desta
// própria página, que existem e funcionam.
{
  const start = html.indexOf(
    '<h4 class="mb-3.5 font-sans text-[0.95rem] font-bold text-white">Loja</h4>',
  );
  if (start === -1) throw new Error("[build] coluna Loja não encontrada");
  const listEnd = html.indexOf("</ul>", start);
  const linkClass =
    "text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white";
  const items = [
    ["#lp-comprar", "Comprar"],
    ["#lp-descricao", "Descrição"],
    ["#lp-ficha", "Ficha do produto"],
    ["#lp-faq", "Perguntas frequentes"],
  ]
    .map(
      ([href, label]) =>
        `<li><a class="${linkClass}" href="${href}">${label}</a></li>`,
    )
    .join("");
  html =
    html.slice(0, start) +
    `<h4 class="mb-3.5 font-sans text-[0.95rem] font-bold text-white">Nesta página</h4>` +
    `<ul class="flex flex-col gap-2.5">${items}` +
    html.slice(listEnd);
  applied.push("coluna Loja do rodapé");
}

replaceOnce(
  '<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="/contactos">Contactos</a>',
  `<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="mailto:${brand.email}">Contactos</a>`,
  "link de contactos",
);
replaceOnce(
  '<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="/faq">Perguntas Frequentes</a>',
  '<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="#lp-faq">Perguntas Frequentes</a>',
  "link de FAQ",
);
replaceOnce(
  '<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="/sobre">Sobre Nós</a>',
  `<a class="text-[0.88rem] text-[#A7AFBD] transition-colors hover:text-white" href="${legal}/termos">Sobre Nós</a>`,
  "link Sobre Nós",
);
replaceOnce(
  '<a class="font-titulo text-[1.4rem] font-extrabold" href="/">',
  '<a class="font-titulo text-[1.4rem] font-extrabold" href="#lp-topo">',
  "logo do rodapé",
);

// ---------------------------------------------------------------------------
// 6. Âncoras para o script próprio
// ---------------------------------------------------------------------------
replaceOnce(
  '<body class="font-sans">',
  '<body class="font-sans" id="lp-topo">',
  "id do topo",
);

// O conteúdo principal chegou com `opacity:0` porque a animação de entrada era
// feita pelo runtime de origem. Sem tirar isto, a página fica invisível.
replaceOnce(
  '<main><div style="opacity:0;transform:translateY(16px)">',
  '<main><div class="lp-reveal">',
  "revela o conteúdo principal",
);

replaceOnce(
  '<div class="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">',
  '<div class="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain" data-lp="gallery">',
  "galeria",
);
replaceOnce(
  'aria-label="Imagem anterior"',
  'aria-label="Imagem anterior" data-lp="prev"',
  "seta anterior",
);
replaceOnce(
  'aria-label="Imagem seguinte"',
  'aria-label="Imagem seguinte" data-lp="next"',
  "seta seguinte",
);
replaceOnce(
  '<div class="scrollbar-hide mt-3 flex gap-2.5 overflow-x-auto">',
  '<div class="scrollbar-hide mt-3 flex gap-2.5 overflow-x-auto" data-lp="thumbs">',
  "miniaturas",
);

replaceOnce(
  '<span class="font-titulo text-[2rem] font-extrabold">39,99 €</span><span class="text-[1.1rem] text-tinta-clara line-through">139,99 €</span>',
  '<span class="font-titulo text-[2rem] font-extrabold" data-lp="price">39,99 €</span><span class="text-[1.1rem] text-tinta-clara line-through" data-lp="compare">139,99 €</span>',
  "preço principal",
);
replaceOnce(
  '<div class="mb-1 mt-1.5 text-[0.85rem] font-semibold text-sucesso">Está a poupar <!-- -->100,00 €<!-- -->!</div>',
  '<div class="mb-1 mt-1.5 text-[0.85rem] font-semibold text-sucesso">Está a poupar <span data-lp="savings">100,00 €</span>!</div>',
  "linha de poupança",
);
replaceOnce(
  '<div class="mb-2 text-[0.82rem] font-bold">Opções</div><div class="flex flex-wrap gap-2">',
  '<div class="mb-2 text-[0.82rem] font-bold">Opções</div><div class="flex flex-wrap gap-2" data-lp="variants">',
  "grupo de opções",
);

// Cada botão de opção recebe o índice correspondente.
config.variants.forEach((variant, index) => {
  const needle = `<span class="block text-[0.86rem] font-semibold leading-tight">${variant.label}</span>`;
  const at = html.indexOf(needle);
  if (at === -1)
    throw new Error(`[build] opção não encontrada: ${variant.label}`);
  const buttonStart = html.lastIndexOf("<button", at);
  html =
    html.slice(0, buttonStart) +
    `<button data-lp-variant="${index}" ` +
    html.slice(buttonStart + "<button".length);
  applied.push(`opção ${variant.label}`);
});

replaceOnce(
  'aria-label="Diminuir"',
  'aria-label="Diminuir" data-lp="qty-minus"',
  "botão diminuir",
);
replaceOnce(
  'aria-label="Aumentar"',
  'aria-label="Aumentar" data-lp="qty-plus"',
  "botão aumentar",
);
replaceOnce(
  'aria-label="Quantidade"',
  'aria-label="Quantidade" data-lp="qty"',
  "campo quantidade",
);

// ---------------------------------------------------------------------------
// 7. Botão de compra
//
// O botão de origem falava com o backend da loja exportada. Aqui ele passa a
// ser uma ligação real para o checkout do painel, levando a opção escolhida e
// a quantidade — o script mantém o endereço atualizado a cada mudança. Toda a
// lógica de destino vive em `site.config.json`: ligar outro gateway é trocar
// uma linha, sem mexer no markup.
// ---------------------------------------------------------------------------

const buyHref = config.checkout.enabled
  ? `${config.checkout.baseUrl}${config.checkout.path}`
  : "#lp-comprar";

replaceOnce(
  '<div class="mb-3.5 flex items-stretch gap-3">',
  '<div class="mb-3.5 flex items-stretch gap-3" id="lp-comprar">',
  "âncora da compra",
);
replaceOnce(
  '<button type="button" class="h-[50px] flex-1 btn btn-primario">Comprar já</button>',
  `<a data-lp="buy" href="${buyHref}" data-lp-checkout="${config.checkout.enabled ? "on" : "off"}" class="h-[50px] flex-1 btn btn-primario inline-flex items-center justify-center">Comprar já</a>`,
  "botão comprar já",
);

// ---------------------------------------------------------------------------
// 8. Abas e âncoras de secção
// ---------------------------------------------------------------------------

replaceOnce(
  '<button type="button" class="whitespace-nowrap border-b-[3px] px-4 py-3.5 font-semibold transition-colors border-primaria text-primaria">Descrição</button>',
  '<button type="button" data-lp-tab="descricao" aria-selected="true" class="whitespace-nowrap border-b-[3px] px-4 py-3.5 font-semibold transition-colors border-primaria text-primaria">Descrição</button>',
  "aba descrição",
);
replaceOnce(
  '<button type="button" class="whitespace-nowrap border-b-[3px] px-4 py-3.5 font-semibold transition-colors border-transparent text-tinta-suave">Envios &amp; Devoluções</button>',
  '<button type="button" data-lp-tab="envios" aria-selected="false" class="whitespace-nowrap border-b-[3px] px-4 py-3.5 font-semibold transition-colors border-transparent text-tinta-suave">Envios &amp; Devoluções</button>',
  "aba envios",
);
replaceOnce(
  '<div class="scrollbar-hide mt-10 flex gap-1 overflow-x-auto border-b border-gray-200">',
  '<div id="lp-descricao" class="scrollbar-hide mt-10 flex gap-1 overflow-x-auto border-b border-gray-200" data-lp="tabs">',
  "barra de abas",
);

// Âncoras dentro do bloco longo de descrição.
html = html.replace(
  "<h2>Ficha do Produto</h2>",
  '<h2 id="lp-ficha">Ficha do Produto</h2>',
);
html = html.replace(
  "<h2>Perguntas Frequentes</h2>",
  '<h2 id="lp-faq">Perguntas Frequentes</h2>',
);

// ---------------------------------------------------------------------------
// 9. Aviso de cookies
// ---------------------------------------------------------------------------

replaceOnce(
  '<div class="fixed inset-x-0 bottom-0 z-[200] bg-escuro px-4 py-4 text-white shadow-[0_-4px_30px_rgba(0,0,0,0.2)] transition-transform duration-300 translate-y-full">',
  '<div data-lp="cookies" hidden class="fixed inset-x-0 bottom-0 z-[200] bg-escuro px-4 py-4 text-white shadow-[0_-4px_30px_rgba(0,0,0,0.2)] transition-transform duration-300 translate-y-full">',
  "aviso de cookies",
);
replaceOnce(
  ">Rejeitar</button>",
  ' data-lp="cookies-reject">Rejeitar</button>',
  "botão rejeitar",
);
replaceOnce(
  ">Aceitar tudo</button>",
  ' data-lp="cookies-accept">Aceitar tudo</button>',
  "botão aceitar",
);

// ---------------------------------------------------------------------------
// 10. Dados estruturados
// ---------------------------------------------------------------------------

const cheapest = config.variants.reduce((a, b) => (a.price <= b.price ? a : b));
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Samsung Galaxy A55 5G",
  brand: { "@type": "Brand", name: "Samsung" },
  description: config.description,
  image: [
    "/images/Gemini_Generated_Image_vgy653vgy653vgy6-PgVG1rnaKVEfGztMatZv3WhznlXCcI.webp",
  ],
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: (cheapest.price / 100).toFixed(2),
    highPrice: (Math.max(...config.variants.map((v) => v.price)) / 100).toFixed(
      2,
    ),
    offerCount: config.variants.length,
    availability: "https://schema.org/InStock",
  },
};
replaceOnce(
  "</body>",
  `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></body>`,
  "dados estruturados",
);

// Configuração lida pelo script próprio.
replaceOnce(
  '<body class="font-sans" id="lp-topo">',
  `<body class="font-sans" id="lp-topo"><script type="application/json" id="lp-config">${JSON.stringify(
    { checkout: config.checkout, variants: config.variants },
  )}</script>`,
  "configuração do script",
);

// ---------------------------------------------------------------------------
// Verificação final e escrita
// ---------------------------------------------------------------------------

const leftovers = [
  ["flashshoppingpt", /flashshoppingpt/i],
  ["Flash Shopping", /Flash Shopping/],
  ["titular de origem", /AMANDA JULIA/i],
  ["NIF de origem", /338416633/],
  ["morada de origem", /Uberl[âa]ndia/i],
  ["chamada a /api/", /["'`]\/api\//],
  ["caminho /_next/", /\/_next\//],
  ["link de categoria", /href="\/categoria\//],
  ["iframe residual", /<iframe/i],
  // O único script servido é o próprio; qualquer outro veio do export.
  ["script do export", /<script[^>]+src="(?!\/js\/lp\.js")/i],
  ["chunk do export", /(webpack|main-app|polyfills)-[0-9a-f]{8}/i],
];
const problems = leftovers
  .filter(([, re]) => re.test(html))
  .map(([name]) => name);
if (problems.length > 0) {
  throw new Error(
    `[build] resíduos do export de origem: ${problems.join(", ")}`,
  );
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);

console.log(`[build] ${applied.length} transformações aplicadas`);
console.log(`[build] escrito ${OUT} (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`[build] checkout: ${buyHref}`);
console.log(`[build] preço base: ${euro(cheapest.price)}`);
