import { company } from "@/lib/company";

export const EMAIL_VARIABLES = [
  { token: "{{PRIMEIRO_NOME}}", label: "Primeiro nome" },
  { token: "{{NOME}}", label: "Nome completo" },
  { token: "{{EMAIL}}", label: "E-mail" },
  { token: "{{PRODUTO}}", label: "Produto" },
  { token: "{{PEDIDO}}", label: "Número do pedido" },
  { token: "{{VALOR}}", label: "Valor do pedido" },
  { token: "{{CHECKOUT_URL}}", label: "Link para concluir" },
  { token: "{{LOJA_URL}}", label: "Endereço da loja" },
] as const;

export interface CampaignTemplateVars {
  nome: string;
  primeiroNome: string;
  email: string;
  produto: string;
  pedido: string;
  valor: string;
  checkoutUrl: string;
  lojaUrl: string;
}

const VARIABLE_ALIASES: Record<string, keyof CampaignTemplateVars> = {
  NOME: "nome",
  PRIMEIRO_NOME: "primeiroNome",
  EMAIL: "email",
  PRODUTO: "produto",
  PEDIDO: "pedido",
  VALOR: "valor",
  CHECKOUT_URL: "checkoutUrl",
  LOJA_URL: "lojaUrl",
  nome: "primeiroNome",
  email: "email",
  produto: "produto",
  pedido: "pedido",
  valor: "valor",
  checkout_url: "checkoutUrl",
};

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

export function renderCampaignText(
  template: string,
  vars: CampaignTemplateVars,
): string {
  return template
    .replace(VARIABLE_PATTERN, (match, token: string) => {
      const key = VARIABLE_ALIASES[token];
      return key ? vars[key] : "";
    })
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildCampaignHtml(input: {
  body: string;
  preheader?: string;
  vars: CampaignTemplateVars;
}): string {
  const renderedBody = renderCampaignText(input.body, input.vars);
  const paragraphs = escapeHtml(renderedBody)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.65">${paragraph.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const preheader = input.preheader
    ? renderCampaignText(input.preheader, input.vars)
    : "";
  const hasCheckoutUrl = validHttpUrl(input.vars.checkoutUrl);
  const checkoutButton = hasCheckoutUrl
    ? `<div style="margin:28px 0 20px;text-align:center"><a href="${escapeHtml(input.vars.checkoutUrl)}" style="display:inline-block;background:#d61f69;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:4px;font-weight:700">Retomar pedido</a></div>
<p style="margin:0 0 18px;line-height:1.55;color:#52525b;font-size:12px">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${escapeHtml(input.vars.checkoutUrl)}" style="color:#d61f69;word-break:break-all">${escapeHtml(input.vars.checkoutUrl)}</a></p>`
    : "";
  const orderValue = input.vars.valor
    ? `<br><strong>Valor:</strong> ${escapeHtml(input.vars.valor)}`
    : "";

  return `<!doctype html><html lang="pt"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}${"&#8199;&#65279;&#847; ".repeat(24)}</div>
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:6px solid #d61f69">
<div style="padding:30px 28px 24px">
<p style="margin:0 0 8px;color:#d61f69;font-size:18px;font-weight:800;text-transform:uppercase">${escapeHtml(company.tradeName)}</p>
<p style="margin:0 0 24px;color:#52525b;font-size:13px">Retome o seu pedido</p>
${paragraphs}
<p style="margin:20px 0;line-height:1.65"><strong>Produto:</strong> ${escapeHtml(input.vars.produto)}<br><strong>Pedido:</strong> ${escapeHtml(input.vars.pedido)}${orderValue}</p>
${checkoutButton}
<p style="margin:20px 0 0;line-height:1.6;color:#52525b;font-size:13px">Após a confirmação, o pedido será processado normalmente.<br>Qualquer dúvida, responda a este e-mail.</p>
</div>
<div style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 28px;text-align:center">
<p style="margin:0;font-size:11px;line-height:1.55;color:#71717a">${escapeHtml(company.tradeName)} · ${escapeHtml(company.country)}<br>Recebeu este e-mail porque comprou ou iniciou uma compra na nossa loja.<br>Para deixar de receber, responda com “REMOVER”.</p>
</div>
</div></body></html>`;
}
