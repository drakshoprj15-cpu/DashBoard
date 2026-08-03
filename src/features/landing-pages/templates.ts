import { BLOCK_CATALOG, newBlockId } from "./block-catalog";
import type {
  BlockPropValue,
  BlockStyle,
  BlockType,
  LandingBlock,
} from "./types";

export interface LandingTemplate {
  id: string;
  name: string;
  description: string;
  /** Resumo mostrado no cartão de escolha do modelo */
  highlights: string[];
  build: () => LandingBlock[];
}

/** Bloco do modelo: parte dos valores padrão do catálogo e sobrescreve. */
function b(
  type: BlockType,
  props: Record<string, BlockPropValue> = {},
  style: BlockStyle = {},
): LandingBlock {
  return {
    id: newBlockId(),
    type,
    props: { ...BLOCK_CATALOG[type].defaults, ...props },
    style,
  };
}

/**
 * Modelos de partida. Nenhum traz depoimento, avaliação, estoque ou contagem
 * inventados: os campos que dependem de dado real nascem vazios e o bloco
 * correspondente só aparece na página publicada quando for preenchido.
 */
export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: "produto-alta-conversao",
    name: "Produto físico de alta conversão",
    description:
      "Estrutura completa para tráfego pago: oferta acima da dobra, prova social e chamada repetida.",
    highlights: ["Galeria + preço", "Benefícios", "FAQ e garantia"],
    build: () => [
      b("announcement"),
      b("header", { showCta: true }),
      b("gallery"),
      b("heading", { text: "", level: "h2" }),
      b("price"),
      b("variants"),
      b("quantity"),
      b("buy_button", { label: "Comprar agora" }),
      b("trust_badges"),
      b("benefits", {
        items:
          "Entrega rápida | Envio com rastreio para todo o país\nCompra segura | Pagamento processado por gateway certificado\nApoio real | Atendimento por quem conhece o produto",
      }),
      b("description"),
      b("specs"),
      b("shipping"),
      b("guarantee"),
      b("reviews"),
      b("faq"),
      b("buy_button", { label: "Quero o meu agora", sticky: true }),
      b("footer"),
    ],
  },
  {
    id: "minimalista",
    name: "Página minimalista",
    description: "Só o essencial: imagem, preço e botão. Carrega muito rápido.",
    highlights: ["Poucos blocos", "Foco no botão", "Ideal para mobile"],
    build: () => [
      b("header"),
      b("gallery", { layout: "thumbs" }),
      b("price"),
      b("buy_button"),
      b("features"),
      b("footer"),
    ],
  },
  {
    id: "completa",
    name: "Página completa",
    description:
      "Todos os blocos de conteúdo para produtos que exigem explicação.",
    highlights: ["Hero + vídeo", "Comparação", "Depoimentos e FAQ"],
    build: () => [
      b("announcement"),
      b("header", { showCta: true, sticky: true }),
      b("hero"),
      b("gallery"),
      b("price"),
      b("variants"),
      b("quantity"),
      b("buy_button"),
      b("benefits"),
      b("video"),
      b("image_text"),
      b("description"),
      b("specs"),
      b("comparison"),
      b("testimonials"),
      b("reviews"),
      b("shipping"),
      b("guarantee"),
      b("faq"),
      b("form"),
      b("buy_button", { label: "Comprar agora" }),
      b("footer"),
    ],
  },
  {
    id: "oferta-direta",
    name: "Oferta direta",
    description:
      "Uma oferta, um botão. Para campanhas de remarketing e listas quentes.",
    highlights: ["Oferta em destaque", "Contagem opcional", "Botão fixo"],
    build: () => [
      b("header"),
      b("hero", { layout: "centered" }),
      b("offer"),
      b("countdown"),
      b("price"),
      b("buy_button", { sticky: true }),
      b("trust_badges"),
      b("guarantee"),
      b("footer"),
    ],
  },
  {
    id: "catalogo-produto",
    name: "Catálogo de produto",
    description:
      "Apresentação de loja: ficha detalhada, especificações e entrega.",
    highlights: ["Menu de navegação", "Ficha técnica", "Entrega e devoluções"],
    build: () => [
      b("header", { menuItems: "Descrição | #descricao\nEntrega | #entrega" }),
      b("menu", { items: "Descrição | #descricao\nEntrega | #entrega" }),
      b("gallery", { layout: "grid" }),
      b("price"),
      b("variants"),
      b("quantity"),
      b("buy_button"),
      b("description", {}, {}),
      b("specs"),
      b("shipping"),
      b("reviews"),
      b("footer"),
    ],
  },
  {
    id: "em-branco",
    name: "Página em branco",
    description: "Começa do zero, com apenas cabeçalho e rodapé.",
    highlights: ["Total liberdade", "2 blocos", "Monte como quiser"],
    build: () => [b("header"), b("footer")],
  },
];

export function getTemplate(id: string): LandingTemplate | null {
  return LANDING_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function buildTemplateBlocks(id: string): LandingBlock[] {
  return (getTemplate(id) ?? LANDING_TEMPLATES[0]).build();
}
