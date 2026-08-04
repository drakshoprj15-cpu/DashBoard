/**
 * Templates de recuperação de carrinho e substituição de variáveis.
 *
 * Módulo isomorfo: usado tanto pela pré-visualização no navegador quanto
 * pelo envio no servidor, por isso nunca importa o cliente do banco — mesmo
 * cuidado documentado em `client-types.ts`.
 */
import type { CartCategory } from "@/features/carts/status";
import { CATEGORY_LABEL } from "@/features/carts/status";
import { company } from "@/lib/company";
import { formatDate, formatMoney } from "@/lib/format";

export type CartTemplateKey = "pending" | "abandoned" | "declined";

export interface CartTemplate {
  key: CartTemplateKey;
  label: string;
  /** Categorias para as quais este template é o mais adequado. */
  suggestedFor: CartCategory[];
  subject: string;
  /**
   * Preheader: o texto que a caixa de entrada mostra a seguir ao assunto.
   * Sem ele, os clientes de e-mail preenchem essa linha com o começo do HTML
   * — normalmente o nome da marca repetido. Estende o assunto em vez de o
   * repetir (~90–140 caracteres).
   */
  preview: string;
  emailBody: string;
  whatsappBody: string;
}

/**
 * As variáveis reconhecidas nos templates. Documentadas aqui porque a UI as
 * lista para o operador na hora de escrever/pré-visualizar.
 */
export const TEMPLATE_VARIABLES = [
  "nome",
  "email",
  "telefone",
  "produto",
  "valor",
  "checkout_url",
  "status",
  "data",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

/**
 * Os três modelos de recuperação.
 *
 * O corpo segue a estrutura da skill `emails`: gancho, contexto, valor, uma
 * única ação. Todos ficam bem abaixo dos 125 palavras recomendados para
 * e-mail transacional — quem abre isto quer resolver, não ler.
 *
 * As mensagens de WhatsApp identificam a marca logo na primeira linha: o
 * destinatário vê apenas um número desconhecido, e sem esse contexto a
 * mensagem parece golpe. Também trazem a saída ("responda PARAR"), o
 * equivalente ao STOP exigido em qualquer canal de mensagem direta.
 */
export const CART_TEMPLATES: Record<CartTemplateKey, CartTemplate> = {
  pending: {
    key: "pending",
    label: "Pagamento pendente",
    suggestedFor: ["awaiting_payment", "pending"],
    subject: "Seu pedido ainda está aguardando pagamento",
    preview: "O link de pagamento continua ativo — dá para concluir em menos de um minuto.",
    emailBody:
      "Olá {{nome}}, vimos que seu pedido de {{produto}} ainda está aguardando pagamento. " +
      "Você pode finalizar com segurança pelo link abaixo.\n\n" +
      "Leva menos de um minuto e o valor continua o mesmo: {{valor}}.",
    whatsappBody:
      "Olá {{nome}}, aqui é da " +
      company.tradeName +
      ". Vi que seu pedido de {{produto}} ({{valor}}) ainda está pendente. " +
      "Você pode finalizar com segurança por aqui: {{checkout_url}}\n\n" +
      "Se preferir não receber estas mensagens, é só responder PARAR.",
  },
  abandoned: {
    key: "abandoned",
    label: "Carrinho abandonado",
    suggestedFor: ["abandoned"],
    subject: "Você esqueceu um item no carrinho",
    preview: "Guardámos o seu carrinho. Retome de onde parou, sem preencher tudo de novo.",
    emailBody:
      "Olá {{nome}}, seu carrinho com {{produto}} ainda está disponível. " +
      "Para continuar sua compra, é só usar o link abaixo — está tudo como você deixou, " +
      "sem precisar preencher de novo.",
    whatsappBody:
      "Olá {{nome}}, aqui é da " +
      company.tradeName +
      ". Seu carrinho com {{produto}} ({{valor}}) ainda está disponível. " +
      "Para continuar sua compra, é só acessar: {{checkout_url}}\n\n" +
      "Se preferir não receber estas mensagens, é só responder PARAR.",
  },
  declined: {
    key: "declined",
    label: "Pagamento recusado",
    suggestedFor: ["declined"],
    subject: "Houve um problema com seu pagamento",
    preview: "O pedido continua reservado. Basta tentar de novo com outro método de pagamento.",
    emailBody:
      "Olá {{nome}}, identificamos que o pagamento do seu pedido não foi aprovado. " +
      "Costuma ser um bloqueio automático do banco, não um problema com os seus dados. " +
      "Você pode tentar novamente com outro método pelo link abaixo.",
    whatsappBody:
      "Olá {{nome}}, aqui é da " +
      company.tradeName +
      ". O pagamento do seu pedido de {{produto}} ({{valor}}) não foi aprovado. " +
      "Você pode tentar de novo com outro método por aqui: {{checkout_url}}\n\n" +
      "Se preferir não receber estas mensagens, é só responder PARAR.",
  },
};

export const CART_TEMPLATE_LIST: CartTemplate[] = [
  CART_TEMPLATES.abandoned,
  CART_TEMPLATES.pending,
  CART_TEMPLATES.declined,
];

/** Template mais adequado à categoria do carrinho, com fallback seguro. */
export function suggestTemplate(category: CartCategory): CartTemplateKey {
  const match = CART_TEMPLATE_LIST.find((t) => t.suggestedFor.includes(category));
  return match?.key ?? "pending";
}

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Substitui `{{variavel}}` pelos valores fornecidos. Variável desconhecida ou
 * sem valor vira string vazia — nunca deixa o placeholder cru chegar ao
 * cliente, que é o pior resultado possível numa mensagem de cobrança.
 *
 * Depois da substituição, arruma o rasto que uma variável vazia deixa:
 * "Olá {{nome}}," sem nome viraria "Olá ," — um detalhe pequeno que denuncia
 * envio automático logo na primeira linha. Carrinhos importados de planilha
 * costumam ter só e-mail ou telefone, então isto acontece de verdade.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text
    .replace(VARIABLE_PATTERN, (_match, name: string) => {
      const value = vars[name as TemplateVariable];
      return value ?? "";
    })
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Variáveis do template que não têm valor — a UI avisa antes de enviar. */
export function findMissingVariables(text: string, vars: TemplateVars): TemplateVariable[] {
  const missing = new Set<TemplateVariable>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const name = match[1] as TemplateVariable;
    if (!TEMPLATE_VARIABLES.includes(name)) continue;
    if (!vars[name]) missing.add(name);
  }
  return Array.from(missing);
}

export interface TemplateSource {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  productName: string | null;
  totalCents: number;
  currency: string;
  category: CartCategory;
  checkoutUrl: string | null;
  createdAt: string | Date;
}

/**
 * Só o primeiro nome. "Olá VICTOR SILVA HUGO" lê-se como mala direta; além
 * disso, o nome completo vindo de checkout ou de planilha costuma trazer
 * caixa alta e sobrenomes que ninguém usa ao falar com o cliente.
 */
function firstName(fullName: string | null): string {
  if (!fullName) return "";
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  // Nome todo em maiúsculas (comum em documentos e planilhas) volta a
  // capitalização normal; nomes já bem escritos ficam intocados.
  return first === first.toUpperCase()
    ? first.charAt(0) + first.slice(1).toLowerCase()
    : first;
}

/** Constrói as variáveis de um carrinho, já formatadas para leitura humana. */
export function buildTemplateVars(source: TemplateSource, locale = "pt-PT"): TemplateVars {
  return {
    nome: firstName(source.customerName),
    email: source.customerEmail ?? "",
    telefone: source.customerPhone ?? "",
    produto: source.productName ?? "",
    valor: formatMoney(source.totalCents, source.currency, locale),
    checkout_url: source.checkoutUrl ?? "",
    status: CATEGORY_LABEL[source.category],
    data: formatDate(source.createdAt, locale),
  };
}
