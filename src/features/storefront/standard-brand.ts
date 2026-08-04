/**
 * Identidade fixa das páginas públicas.
 *
 * A marca e as cores vivem no código para que checkouts e landing pages novos
 * recebam exatamente o mesmo padrão, independentemente de configurações antigas
 * gravadas no banco.
 */
export const STANDARD_STOREFRONT = {
  name: "PCDIGA",
  logoUrl: "/brand/pcdiga.svg",
  headerBackground: "#09090b",
  primaryColor: "#7c3aed",
  buttonColor: "#f97316",
} as const;
