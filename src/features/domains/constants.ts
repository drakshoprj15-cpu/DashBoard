/**
 * Assinatura devolvida por `/api/public/domain-check` e conferida pela
 * verificação de domínio no painel. Fica fora do arquivo de rota porque
 * módulos de Route Handler só podem exportar os handlers e a configuração.
 */
export const DOMAIN_CHECK_TOKEN = "infinity-domain-check";

/**
 * Registros de DNS que um domínio próprio precisa ter para apontar para esta
 * aplicação (hospedada na Vercel). Exibidos na página de domínios para que
 * cada domínio novo possa ser configurado sem consultar ninguém.
 */
export const DNS_RECORDS = [
  { type: "A", name: "@", value: "216.198.79.1" },
  { type: "CNAME", name: "www", value: "3d4970c7b04bd998.vercel-dns-017.com." },
] as const;
