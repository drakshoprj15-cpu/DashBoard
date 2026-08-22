interface LegacyEmailBrand {
  name: string;
  logoUrl?: string | null;
}

export const DEFAULT_CAMPAIGN_TEMPLATE = {
  subject: "{{PRIMEIRO_NOME}}, confirme os dados do seu pedido",
  preheader:
    "Retome o seu pedido e confirme os dados de entrega em poucos segundos.",
  headerName: "",
  title: "Atualização do seu pedido",
  body: "Olá {{PRIMEIRO_NOME}},\n\nO seu pedido encontra-se pendente de conclusão. Para continuar, confirme os dados no botão abaixo apenas se reconhecer esta compra.",
  articleName: "O seu Produto",
  ctaLabel: "Continuar para o Pagamento",
  ctaUrl: "https://suaempresa.site/pagar/6bzge2a64e",
  fallbackText:
    "Se o botão não funcionar, copie e cole o seguinte endereço na barra do navegador:",
} as const;

export const EMAIL_VARIABLES = [
  { token: "{{PRIMEIRO_NOME}}", label: "Primeiro nome" },
  { token: "{{NOME}}", label: "Nome completo" },
  { token: "{{EMAIL}}", label: "E-mail" },
  { token: "{{PRODUTO}}", label: "Produto" },
  { token: "{{PEDIDO}}", label: "Numero do pedido" },
  { token: "{{VALOR}}", label: "Valor do pedido" },
  { token: "{{CHECKOUT_URL}}", label: "Link para concluir" },
  { token: "{{LOJA_URL}}", label: "Endereco da loja" },
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

export interface CampaignTemplateContent {
  body: string;
  headerName?: string;
  title?: string;
  articleName?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  fallbackText?: string;
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

export function isValidCtaUrlTemplate(value: string): boolean {
  const sampleVars: CampaignTemplateVars = {
    nome: "Cliente Exemplo",
    primeiroNome: "Cliente",
    email: "cliente@example.com",
    produto: "Produto",
    pedido: "PED-1234",
    valor: "49,90 EUR",
    checkoutUrl: "https://example.com/checkout/PED-1234",
    lojaUrl: "https://example.com",
  };
  return validHttpUrl(renderCampaignText(value, sampleVars));
}

export function buildCampaignHtml(input: {
  body: string;
  preheader?: string;
  headerName?: string;
  title?: string;
  articleName?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  fallbackText?: string;
  vars: CampaignTemplateVars;
  /** A marca visual de campanhas antigas é ignorada intencionalmente. */
  brand?: LegacyEmailBrand;
}): string {
  const renderedBody = renderCampaignText(input.body, input.vars);
  const paragraphs = escapeHtml(renderedBody)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;line-height:1.65">${paragraph.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const preheader = input.preheader
    ? renderCampaignText(input.preheader, input.vars)
    : "";
  const headerName = input.headerName
    ? renderCampaignText(input.headerName, input.vars)
    : "";
  const title = renderCampaignText(
    input.title ?? DEFAULT_CAMPAIGN_TEMPLATE.title,
    input.vars,
  );
  const articleName = renderCampaignText(
    input.articleName ?? DEFAULT_CAMPAIGN_TEMPLATE.articleName,
    input.vars,
  );
  const ctaLabel = renderCampaignText(
    input.ctaLabel ?? DEFAULT_CAMPAIGN_TEMPLATE.ctaLabel,
    input.vars,
  );
  const ctaUrl = renderCampaignText(
    input.ctaUrl ?? DEFAULT_CAMPAIGN_TEMPLATE.ctaUrl,
    input.vars,
  );
  const fallbackText = renderCampaignText(
    input.fallbackText ?? DEFAULT_CAMPAIGN_TEMPLATE.fallbackText,
    input.vars,
  );
  const hasCtaUrl = validHttpUrl(ctaUrl);
  const checkoutButton = hasCtaUrl
    ? `<p style="margin:26px 0 18px;line-height:1.65">Para continuar com o pedido, confirme os seus dados através do botão abaixo:</p>
<div style="margin:0 0 28px;text-align:center"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:15px 28px;border-radius:4px;font-weight:700">${escapeHtml(ctaLabel)}</a></div>
<p style="margin:0 0 26px;line-height:1.55;color:#4b5563;font-size:12px">${escapeHtml(fallbackText)}<br><a href="${escapeHtml(ctaUrl)}" style="color:#cc0000;word-break:break-all">${escapeHtml(ctaUrl)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}${"&#8199;&#65279;&#847; ".repeat(24)}</div>
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:6px solid #cc0000">
<div style="padding:34px 32px 30px">
${headerName ? `<p style="margin:0 0 10px;font-size:18px;font-weight:700;line-height:1.3;color:#111827">${escapeHtml(headerName)}</p>` : ""}
<p style="margin:0 0 24px;color:#4b5563;font-size:14px">${escapeHtml(title)}</p>
${paragraphs}
<div style="margin:22px 0 24px;background:#f7f7f7;padding:22px 24px;line-height:1.65">
<strong>Encomenda:</strong> ${escapeHtml(input.vars.pedido)}<br><strong>Artigo:</strong> ${escapeHtml(articleName)}
</div>
${checkoutButton}
<p style="margin:0;line-height:1.65">Depois da confirmação, o pedido poderá prosseguir normalmente.</p>
</div>
<div style="border-top:1px solid #e5e7eb;padding:20px 32px;text-align:left">
<p style="margin:0;font-size:12px;line-height:1.6;color:#4b5563">Este e-mail foi enviado porque existe uma compra iniciada associada a este endereço.<br>Para deixar de receber, responda a este e-mail com "REMOVER".</p>
</div>
</div></body></html>`;
}
