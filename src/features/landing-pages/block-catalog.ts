import {
  AlignLeft,
  BadgeCheck,
  Blocks,
  Boxes,
  Clock,
  Code2,
  Columns2,
  FileText,
  Gift,
  Hash,
  Heading,
  Image as ImageIcon,
  Images,
  LayoutPanelTop,
  ListChecks,
  MailPlus,
  Menu,
  MessageCircle,
  MessageSquareQuote,
  Minus,
  PanelBottom,
  Play,
  Quote,
  ReceiptText,
  Rows3,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { BlockPropValue, BlockType, LandingBlock } from "./types";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "color"
  | "select"
  | "image"
  | "url"
  | "datetime"
  | "lines"
  | "code";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export type BlockGroup =
  "estrutura" | "conteudo" | "produto" | "conversao" | "confianca" | "avancado";

export interface BlockDef {
  type: BlockType;
  label: string;
  description: string;
  group: BlockGroup;
  icon: LucideIcon;
  fields: FieldDef[];
  defaults: Record<string, BlockPropValue>;
  /** Faz sentido apenas uma vez na página (cabeçalho, rodapé…) */
  singleton?: boolean;
  /** Depende de um produto vinculado para funcionar */
  requiresProduct?: boolean;
  /** Aviso mostrado no inspetor (conformidade, risco…) */
  notice?: string;
}

export const BLOCK_GROUP_LABELS: Record<BlockGroup, string> = {
  estrutura: "Estrutura",
  conteudo: "Conteúdo",
  produto: "Produto",
  conversao: "Conversão",
  confianca: "Confiança",
  avancado: "Avançado",
};

/**
 * Catálogo de blocos: rótulo, campos do inspetor e valores iniciais.
 *
 * O inspetor da direita é gerado a partir daqui — nenhum bloco tem
 * formulário próprio. Adicionar um campo novo é acrescentar uma linha em
 * `fields` e a chave correspondente em `defaults`.
 */
export const BLOCK_CATALOG: Record<BlockType, BlockDef> = {
  announcement: {
    type: "announcement",
    label: "Barra de anúncio",
    description: "Faixa fina no topo com um aviso curto.",
    group: "estrutura",
    icon: Sparkles,
    singleton: true,
    fields: [
      { key: "text", label: "Texto", type: "text" },
      { key: "linkUrl", label: "Link (opcional)", type: "url" },
      { key: "dismissible", label: "Permitir fechar", type: "boolean" },
    ],
    defaults: {
      text: "Portes grátis nas encomendas acima de 50 €",
      linkUrl: "",
      dismissible: true,
    },
  },

  header: {
    type: "header",
    label: "Cabeçalho",
    description: "Logo, menu e botão de ação no topo da página.",
    group: "estrutura",
    icon: LayoutPanelTop,
    singleton: true,
    fields: [
      { key: "showLogo", label: "Mostrar logo", type: "boolean" },
      {
        key: "menuItems",
        label: "Itens do menu",
        type: "lines",
        help: "Um por linha, no formato: Rótulo | #ancora ou https://…",
        placeholder: "Descrição | #descricao",
      },
      { key: "sticky", label: "Fixar ao rolar", type: "boolean" },
      { key: "showCta", label: "Mostrar botão", type: "boolean" },
      { key: "ctaLabel", label: "Texto do botão", type: "text" },
      {
        key: "ctaTarget",
        label: "Destino do botão",
        type: "text",
        help: "Âncora (#comprar) ou endereço completo.",
      },
    ],
    defaults: {
      showLogo: true,
      menuItems: "",
      sticky: false,
      showCta: false,
      ctaLabel: "Comprar",
      ctaTarget: "#comprar",
    },
  },

  logo: {
    type: "logo",
    label: "Logo",
    description: "Faixa apenas com a marca.",
    group: "estrutura",
    icon: ImageIcon,
    fields: [
      {
        key: "imageUrl",
        label: "Imagem",
        type: "image",
        help: "Vazio = usa a logo definida nas informações da página.",
      },
      {
        key: "height",
        label: "Altura (px)",
        type: "number",
        min: 20,
        max: 160,
      },
    ],
    defaults: { imageUrl: "", height: 48 },
  },

  menu: {
    type: "menu",
    label: "Menu",
    description: "Barra de navegação com links internos.",
    group: "estrutura",
    icon: Menu,
    fields: [
      {
        key: "items",
        label: "Itens",
        type: "lines",
        help: "Rótulo | #ancora",
        placeholder: "Avaliações | #avaliacoes",
      },
      { key: "sticky", label: "Fixar ao rolar", type: "boolean" },
    ],
    defaults: { items: "", sticky: false },
  },

  hero: {
    type: "hero",
    label: "Hero",
    description: "Abertura da página com título, imagem e chamada.",
    group: "conteudo",
    icon: Blocks,
    fields: [
      { key: "eyebrow", label: "Selo acima do título", type: "text" },
      { key: "title", label: "Título", type: "text" },
      { key: "subtitle", label: "Subtítulo", type: "textarea" },
      {
        key: "imageUrl",
        label: "Imagem",
        type: "image",
        help: "Vazio = usa a imagem principal do produto.",
      },
      { key: "ctaLabel", label: "Texto do botão", type: "text" },
      { key: "ctaTarget", label: "Destino do botão", type: "text" },
      {
        key: "layout",
        label: "Disposição",
        type: "select",
        options: [
          { value: "image-right", label: "Imagem à direita" },
          { value: "image-left", label: "Imagem à esquerda" },
          { value: "centered", label: "Centralizado" },
        ],
      },
    ],
    defaults: {
      eyebrow: "",
      title: "",
      subtitle: "",
      imageUrl: "",
      ctaLabel: "Comprar agora",
      ctaTarget: "#comprar",
      layout: "image-right",
    },
  },

  gallery: {
    type: "gallery",
    label: "Galeria de imagens",
    description: "Imagem principal com miniaturas.",
    group: "produto",
    icon: Images,
    fields: [
      {
        key: "images",
        label: "Imagens",
        type: "lines",
        help: "Um endereço por linha. Vazio = usa a galeria da variação escolhida (ou a do produto).",
      },
      {
        key: "layout",
        label: "Formato",
        type: "select",
        options: [
          { value: "thumbs", label: "Principal + miniaturas" },
          { value: "grid", label: "Grade" },
        ],
      },
      {
        key: "allowZoom",
        label: "Permitir ampliar ao clicar",
        type: "boolean",
      },
    ],
    defaults: { images: "", layout: "thumbs", allowZoom: true },
  },

  video: {
    type: "video",
    label: "Vídeo",
    description: "YouTube, Vimeo ou ficheiro MP4.",
    group: "conteudo",
    icon: Play,
    fields: [
      { key: "url", label: "Endereço do vídeo", type: "url" },
      { key: "title", label: "Título acessível", type: "text" },
      {
        key: "posterUrl",
        label: "Imagem de capa (MP4)",
        type: "image",
      },
    ],
    defaults: { url: "", title: "Vídeo do produto", posterUrl: "" },
  },

  heading: {
    type: "heading",
    label: "Título",
    description: "Um título de seção.",
    group: "conteudo",
    icon: Heading,
    fields: [
      { key: "text", label: "Texto", type: "text" },
      {
        key: "level",
        label: "Nível",
        type: "select",
        options: [
          { value: "h2", label: "Título de seção (h2)" },
          { value: "h3", label: "Subtítulo (h3)" },
        ],
      },
    ],
    defaults: { text: "Novo título", level: "h2" },
  },

  text: {
    type: "text",
    label: "Texto",
    description: "Parágrafos livres.",
    group: "conteudo",
    icon: AlignLeft,
    fields: [
      {
        key: "body",
        label: "Texto",
        type: "textarea",
        help: "Uma linha em branco separa parágrafos.",
      },
    ],
    defaults: { body: "" },
  },

  price: {
    type: "price",
    label: "Preço",
    description: "Preço atual, preço anterior e desconto.",
    group: "produto",
    icon: Tag,
    requiresProduct: true,
    fields: [
      { key: "showCompare", label: "Mostrar preço anterior", type: "boolean" },
      { key: "showDiscount", label: "Mostrar % de desconto", type: "boolean" },
      { key: "showSavings", label: "Mostrar quanto poupa", type: "boolean" },
      { key: "showSku", label: "Mostrar SKU da variação", type: "boolean" },
      { key: "note", label: "Observação", type: "text" },
    ],
    defaults: {
      showCompare: true,
      showDiscount: true,
      showSavings: true,
      showSku: false,
      note: "Preço com IVA incluído",
    },
  },

  offer: {
    type: "offer",
    label: "Oferta",
    description: "Destaque de uma condição especial.",
    group: "conversao",
    icon: Gift,
    fields: [
      { key: "badge", label: "Selo", type: "text" },
      { key: "title", label: "Título", type: "text" },
      { key: "description", label: "Descrição", type: "textarea" },
    ],
    defaults: {
      badge: "Oferta",
      title: "",
      description: "",
    },
    notice:
      "Descreva apenas condições que a loja cumpre de facto — promessa não cumprida é publicidade enganosa.",
  },

  variants: {
    type: "variants",
    label: "Seletor de variações",
    description: "Cor, tamanho e demais opções do produto.",
    group: "produto",
    icon: Boxes,
    requiresProduct: true,
    fields: [
      {
        key: "label",
        label: "Rótulo",
        type: "text",
        help: "Vazio = usa o nome do atributo do catálogo (ex.: Cor).",
      },
      {
        key: "required",
        label: "Exigir escolha antes de comprar",
        type: "boolean",
      },
      {
        key: "style",
        label: "Formato",
        type: "select",
        options: [
          { value: "cards", label: "Cards" },
          { value: "buttons", label: "Botões" },
          { value: "thumbs", label: "Miniaturas" },
          { value: "circles", label: "Círculos de cor" },
          { value: "list", label: "Lista" },
        ],
      },
      {
        key: "showPrice",
        label: "Mostrar preço em cada opção",
        type: "boolean",
      },
      { key: "showThumbnail", label: "Mostrar miniatura", type: "boolean" },
      {
        key: "hideSoldOut",
        label: "Ocultar opções esgotadas",
        type: "boolean",
        help: "Desligado, a opção aparece desabilitada com o aviso de esgotada.",
      },
      {
        key: "size",
        label: "Tamanho dos cards",
        type: "select",
        options: [
          { value: "small", label: "Pequeno" },
          { value: "medium", label: "Médio" },
          { value: "large", label: "Grande" },
        ],
      },
      {
        key: "columns",
        label: "Colunas (máx.)",
        type: "number",
        min: 1,
        max: 6,
      },
    ],
    defaults: {
      label: "",
      required: true,
      style: "cards",
      showPrice: true,
      showThumbnail: true,
      hideSoldOut: false,
      size: "medium",
      columns: 3,
    },
  },

  stock: {
    type: "stock",
    label: "Disponibilidade",
    description: "Estoque real da opção escolhida, com barra opcional.",
    group: "produto",
    icon: Boxes,
    requiresProduct: true,
    fields: [
      { key: "label", label: "Rótulo", type: "text" },
      { key: "soldOutLabel", label: "Texto quando esgotado", type: "text" },
      { key: "showBar", label: "Mostrar barra", type: "boolean" },
      {
        key: "barBase",
        label: "Base da barra",
        type: "number",
        min: 1,
        max: 999,
        help: "Quantidade que representa a barra cheia. A contagem exibida é sempre a real do catálogo.",
      },
    ],
    defaults: {
      label: "Em estoque",
      soldOutLabel: "Esgotado",
      showBar: true,
      barBase: 20,
    },
  },

  quantity: {
    type: "quantity",
    label: "Quantidade",
    description: "Seletor de quantidade.",
    group: "produto",
    icon: Hash,
    fields: [
      { key: "label", label: "Rótulo", type: "text" },
      { key: "min", label: "Mínimo", type: "number", min: 1, max: 99 },
      { key: "max", label: "Máximo", type: "number", min: 1, max: 99 },
    ],
    defaults: { label: "Quantidade", min: 1, max: 10 },
  },

  buy_button: {
    type: "buy_button",
    label: "Botão de compra",
    description: "Leva ao checkout real da loja.",
    group: "conversao",
    icon: ShoppingCart,
    requiresProduct: true,
    fields: [
      { key: "label", label: "Texto", type: "text" },
      {
        key: "action",
        label: "Ação",
        type: "select",
        options: [
          { value: "checkout", label: "Ir para o checkout" },
          { value: "buy_now", label: "Comprar agora" },
          { value: "add_to_cart", label: "Adicionar ao carrinho" },
          { value: "external", label: "Abrir link externo" },
          { value: "whatsapp", label: "Chamar no WhatsApp" },
        ],
      },
      {
        key: "externalUrl",
        label: "Endereço externo",
        type: "url",
        help: "Usado apenas na ação “Abrir link externo”.",
      },
      { key: "fullWidth", label: "Ocupar toda a largura", type: "boolean" },
      { key: "sticky", label: "Fixar no rodapé no telemóvel", type: "boolean" },
      { key: "helperText", label: "Texto de apoio", type: "text" },
      {
        key: "soldOutLabel",
        label: "Texto quando a opção está indisponível",
        type: "text",
        help: "Substitui o rótulo e desativa o botão enquanto a variação escolhida não puder ser comprada.",
      },
    ],
    defaults: {
      label: "Comprar agora",
      action: "checkout",
      externalUrl: "",
      fullWidth: true,
      sticky: false,
      helperText: "",
      soldOutLabel: "Opção indisponível",
    },
  },

  whatsapp: {
    type: "whatsapp",
    label: "Botão de WhatsApp",
    description: "Abre uma conversa com a loja.",
    group: "conversao",
    icon: MessageCircle,
    fields: [
      {
        key: "phone",
        label: "Número",
        type: "text",
        help: "Com indicativo do país, só dígitos. Ex.: 351912345678",
      },
      { key: "message", label: "Mensagem inicial", type: "textarea" },
      { key: "label", label: "Texto do botão", type: "text" },
      { key: "floating", label: "Flutuar no canto", type: "boolean" },
    ],
    defaults: {
      phone: "",
      message: "Olá! Tenho uma dúvida sobre o produto.",
      label: "Falar no WhatsApp",
      floating: false,
    },
  },

  benefits: {
    type: "benefits",
    label: "Benefícios",
    description: "Blocos curtos com as vantagens do produto.",
    group: "conteudo",
    icon: ListChecks,
    fields: [
      { key: "title", label: "Título da seção", type: "text" },
      {
        key: "items",
        label: "Benefícios",
        type: "lines",
        help: "Um por linha: Título | descrição",
        placeholder: "Entrega rápida | Recebe em 2 a 4 dias úteis",
      },
      { key: "columns", label: "Colunas", type: "number", min: 1, max: 4 },
    ],
    defaults: { title: "", items: "", columns: 3 },
  },

  trust_badges: {
    type: "trust_badges",
    label: "Ícones de confiança",
    description: "Selos de segurança e pagamento.",
    group: "confianca",
    icon: ShieldCheck,
    fields: [
      {
        key: "items",
        label: "Itens",
        type: "lines",
        help: "Um por linha.",
      },
      {
        key: "showPaymentIcons",
        label: "Mostrar ícones de pagamento",
        type: "boolean",
      },
    ],
    defaults: {
      items: "Pagamento seguro\nEnvio com rastreio\nApoio ao cliente",
      showPaymentIcons: true,
    },
  },

  description: {
    type: "description",
    label: "Descrição do produto",
    description: "Texto longo com os detalhes.",
    group: "produto",
    icon: FileText,
    fields: [
      { key: "title", label: "Título", type: "text" },
      {
        key: "useProductDescription",
        label: "Usar a descrição do produto",
        type: "boolean",
      },
      { key: "body", label: "Texto próprio", type: "textarea" },
    ],
    defaults: {
      title: "Descrição",
      useProductDescription: true,
      body: "",
    },
  },

  specs: {
    type: "specs",
    label: "Especificações",
    description: "Tabela de características técnicas.",
    group: "produto",
    icon: Rows3,
    fields: [
      { key: "title", label: "Título", type: "text" },
      {
        key: "items",
        label: "Especificações",
        type: "lines",
        help: "Uma por linha: Característica | valor",
        placeholder: "Material | Aço e espuma",
      },
    ],
    defaults: { title: "Especificações", items: "" },
  },

  image_text: {
    type: "image_text",
    label: "Imagem com texto",
    description: "Imagem ao lado de um texto.",
    group: "conteudo",
    icon: Columns2,
    fields: [
      { key: "imageUrl", label: "Imagem", type: "image" },
      { key: "title", label: "Título", type: "text" },
      { key: "body", label: "Texto", type: "textarea" },
      {
        key: "imagePosition",
        label: "Posição da imagem",
        type: "select",
        options: [
          { value: "left", label: "Esquerda" },
          { value: "right", label: "Direita" },
        ],
      },
    ],
    defaults: {
      imageUrl: "",
      title: "",
      body: "",
      imagePosition: "left",
    },
  },

  features: {
    type: "features",
    label: "Lista de características",
    description: "Lista simples com marcadores.",
    group: "conteudo",
    icon: ListChecks,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "items", label: "Itens", type: "lines", help: "Um por linha." },
    ],
    defaults: { title: "Destaques", items: "" },
  },

  comparison: {
    type: "comparison",
    label: "Comparação",
    description: "Tabela comparando duas opções.",
    group: "confianca",
    icon: Columns2,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "columnA", label: "Coluna 1", type: "text" },
      { key: "columnB", label: "Coluna 2", type: "text" },
      {
        key: "rows",
        label: "Linhas",
        type: "lines",
        help: "Uma por linha: Critério | valor da coluna 1 | valor da coluna 2",
        placeholder: "Garantia | 2 anos | 6 meses",
      },
    ],
    defaults: {
      title: "Comparação",
      columnA: "Este produto",
      columnB: "Alternativa comum",
      rows: "",
    },
    notice:
      "Comparações precisam de dados verificáveis. Não atribua defeitos a concorrentes sem prova.",
  },

  reviews: {
    type: "reviews",
    label: "Avaliações",
    description: "Avaliações reais registadas em Provas sociais.",
    group: "confianca",
    icon: Star,
    requiresProduct: true,
    fields: [
      { key: "title", label: "Título", type: "text" },
      {
        key: "emptyMessage",
        label: "Texto quando ainda não há avaliações",
        type: "textarea",
      },
      {
        key: "limit",
        label: "Quantas mostrar",
        type: "number",
        min: 1,
        max: 50,
      },
    ],
    defaults: {
      title: "Avaliações dos clientes",
      emptyMessage:
        "Este produto é novo na loja. As avaliações de clientes reais aparecerão aqui após as primeiras compras.",
      limit: 10,
    },
    notice:
      "As avaliações vêm de Catálogo → Provas sociais. O construtor nunca inventa avaliações.",
  },

  testimonials: {
    type: "testimonials",
    label: "Depoimentos",
    description: "Citações de clientes reais.",
    group: "confianca",
    icon: Quote,
    fields: [
      { key: "title", label: "Título", type: "text" },
      {
        key: "items",
        label: "Depoimentos",
        type: "lines",
        help: "Um por linha: Nome | depoimento",
        placeholder: "Ana M. | Chegou antes do prazo.",
      },
    ],
    defaults: { title: "O que dizem os clientes", items: "" },
    notice:
      "Publique apenas depoimentos que recebeu de facto e cuja autorização de uso possui.",
  },

  faq: {
    type: "faq",
    label: "Perguntas frequentes",
    description: "Lista de perguntas e respostas.",
    group: "confianca",
    icon: MessageSquareQuote,
    fields: [
      { key: "title", label: "Título", type: "text" },
      {
        key: "items",
        label: "Perguntas",
        type: "lines",
        help: "Uma por linha: Pergunta | resposta",
        placeholder: "Qual é o prazo de entrega? | Entre 2 e 4 dias úteis.",
      },
    ],
    defaults: { title: "Perguntas frequentes", items: "" },
  },

  shipping: {
    type: "shipping",
    label: "Informações de entrega",
    description: "Prazos, portes e devoluções.",
    group: "confianca",
    icon: Truck,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "estimate", label: "Prazo estimado", type: "text" },
      { key: "items", label: "Detalhes", type: "lines", help: "Um por linha." },
    ],
    defaults: {
      title: "Entrega e devoluções",
      estimate: "2 a 4 dias úteis",
      items: "Envio com rastreio\nDevolução até 14 dias",
    },
  },

  guarantee: {
    type: "guarantee",
    label: "Garantia",
    description: "Bloco de garantia e satisfação.",
    group: "confianca",
    icon: BadgeCheck,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "body", label: "Texto", type: "textarea" },
      { key: "days", label: "Dias", type: "number", min: 0, max: 3650 },
    ],
    defaults: {
      title: "Garantia de satisfação",
      body: "Se não ficar satisfeito, devolvemos o valor pago.",
      days: 14,
    },
  },

  form: {
    type: "form",
    label: "Formulário",
    description: "Captura de contacto — grava o lead em Clientes.",
    group: "conversao",
    icon: MailPlus,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "description", label: "Descrição", type: "textarea" },
      { key: "askName", label: "Pedir nome", type: "boolean" },
      { key: "askPhone", label: "Pedir telefone", type: "boolean" },
      { key: "buttonLabel", label: "Texto do botão", type: "text" },
      { key: "successMessage", label: "Mensagem de sucesso", type: "text" },
      {
        key: "consentText",
        label: "Texto do consentimento",
        type: "text",
        help: "Exigido pelo RGPD antes de guardar os dados.",
      },
    ],
    defaults: {
      title: "Receba novidades",
      description: "",
      askName: true,
      askPhone: false,
      buttonLabel: "Enviar",
      successMessage: "Recebemos os seus dados. Obrigado!",
      consentText: "Autorizo o contacto sobre este produto.",
    },
  },

  countdown: {
    type: "countdown",
    label: "Contagem regressiva",
    description: "Conta até uma data real configurada por si.",
    group: "conversao",
    icon: Clock,
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "endsAt", label: "Termina em", type: "datetime" },
      { key: "finishedText", label: "Texto ao terminar", type: "text" },
      {
        key: "hideWhenFinished",
        label: "Esconder quando terminar",
        type: "boolean",
      },
    ],
    defaults: {
      title: "A campanha termina em",
      endsAt: "",
      finishedText: "Campanha encerrada",
      hideWhenFinished: false,
    },
    notice:
      "A contagem usa a data que definir e nunca reinicia sozinha. Sem data, o bloco não aparece na página publicada.",
  },

  footer: {
    type: "footer",
    label: "Rodapé",
    description: "Encerramento com marca e links legais.",
    group: "estrutura",
    icon: PanelBottom,
    singleton: true,
    fields: [
      { key: "text", label: "Texto", type: "text" },
      {
        key: "links",
        label: "Links",
        type: "lines",
        help: "Um por linha: Rótulo | endereço",
      },
      {
        key: "showLegalLinks",
        label: "Mostrar Termos, Privacidade e Devoluções",
        type: "boolean",
      },
    ],
    defaults: { text: "", links: "", showLegalLinks: true },
  },

  custom_html: {
    type: "custom_html",
    label: "HTML personalizado",
    description: "Bloco livre, higienizado antes de publicar.",
    group: "avancado",
    icon: Code2,
    fields: [{ key: "html", label: "HTML", type: "code" }],
    defaults: { html: "" },
    notice:
      "Etiquetas de script, iframes e atributos de evento são removidos por segurança. Para scripts, use a aba Código.",
  },
};

export const BLOCK_LIST: BlockDef[] = Object.values(BLOCK_CATALOG);

/** Ícone genérico para um bloco desconhecido (versão publicada antiga). */
export const FALLBACK_BLOCK_ICON = Minus;

export function getBlockDef(type: string): BlockDef | null {
  return (BLOCK_CATALOG as Record<string, BlockDef | undefined>)[type] ?? null;
}

export function blockLabel(type: string): string {
  return getBlockDef(type)?.label ?? type;
}

/** Identificador curto e único o suficiente para um bloco no documento. */
export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

/** Cria um bloco novo já com os valores padrão do catálogo. */
export function createBlock(type: BlockType): LandingBlock {
  const def = BLOCK_CATALOG[type];
  return {
    id: newBlockId(),
    type,
    props: { ...def.defaults },
    style: {},
  };
}

/** Ícones auxiliares usados pela paleta e pelo canvas. */
export const PALETTE_ICONS = { ReceiptText, Blocks } satisfies Record<
  string,
  LucideIcon
>;
