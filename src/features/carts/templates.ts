/**
 * Templates de recuperação de carrinho e substituição de variáveis.
 *
 * Módulo isomorfo: usado tanto pela pré-visualização no navegador quanto
 * pelo envio no servidor, por isso nunca importa o cliente do banco — mesmo
 * cuidado documentado em `client-types.ts`.
 */
import type { CartCategory } from "@/features/carts/status";
import { CATEGORY_LABEL } from "@/features/carts/status";
import { formatDate, formatMoney } from "@/lib/format";

export type CartTemplateKey = "pending" | "abandoned" | "declined";

export interface CartTemplate {
  key: CartTemplateKey;
  label: string;
  /** Categorias para as quais este template é o mais adequado. */
  suggestedFor: CartCategory[];
  subject: string;
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

export const CART_TEMPLATES: Record<CartTemplateKey, CartTemplate> = {
  pending: {
    key: "pending",
    label: "Pagamento pendente",
    suggestedFor: ["awaiting_payment", "pending"],
    subject: "Seu pedido ainda está aguardando pagamento",
    emailBody:
      "Olá {{nome}}, vimos que seu pedido de {{produto}} ainda está aguardando pagamento. " +
      "Você pode finalizar com segurança pelo link abaixo: {{checkout_url}}",
    whatsappBody:
      "Olá {{nome}}, tudo bem? Vi que seu pedido de {{produto}} ainda está pendente. " +
      "Você pode finalizar com segurança por aqui: {{checkout_url}}",
  },
  abandoned: {
    key: "abandoned",
    label: "Carrinho abandonado",
    suggestedFor: ["abandoned"],
    subject: "Você esqueceu um item no carrinho",
    emailBody:
      "Olá {{nome}}, seu carrinho com {{produto}} ainda está disponível. " +
      "Para continuar sua compra, acesse: {{checkout_url}}",
    whatsappBody:
      "Olá {{nome}}, tudo bem? Seu carrinho com {{produto}} ainda está disponível. " +
      "Para continuar sua compra, é só acessar: {{checkout_url}}",
  },
  declined: {
    key: "declined",
    label: "Pagamento recusado",
    suggestedFor: ["declined"],
    subject: "Houve um problema com seu pagamento",
    emailBody:
      "Olá {{nome}}, identificamos que o pagamento do seu pedido não foi aprovado. " +
      "Você pode tentar novamente com outro método pelo link: {{checkout_url}}",
    whatsappBody:
      "Olá {{nome}}, tudo bem? O pagamento do seu pedido de {{produto}} não foi aprovado. " +
      "Você pode tentar de novo com outro método por aqui: {{checkout_url}}",
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
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(VARIABLE_PATTERN, (_match, name: string) => {
    const value = vars[name as TemplateVariable];
    return value ?? "";
  });
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

/** Constrói as variáveis de um carrinho, já formatadas para leitura humana. */
export function buildTemplateVars(source: TemplateSource, locale = "pt-PT"): TemplateVars {
  return {
    nome: source.customerName ?? "",
    email: source.customerEmail ?? "",
    telefone: source.customerPhone ?? "",
    produto: source.productName ?? "",
    valor: formatMoney(source.totalCents, source.currency, locale),
    checkout_url: source.checkoutUrl ?? "",
    status: CATEGORY_LABEL[source.category],
    data: formatDate(source.createdAt, locale),
  };
}
