import { getWorkspaceBranding } from "@/features/branding/queries";
import {
  DEFAULT_CAMPAIGN_TEMPLATE,
  type EmailBrand,
} from "@/features/emails/template";

/**
 * Marca aplicada ao cabeçalho dos e-mails. Reaproveita a identidade
 * configurada em /configuracoes para que a logo da loja substitua o nome
 * no topo do template.
 */
export async function getEmailBrand(): Promise<EmailBrand> {
  const branding = await getWorkspaceBranding();
  return {
    name: branding.storeName || DEFAULT_CAMPAIGN_TEMPLATE.headerName,
    logoUrl: branding.logoUrl,
  };
}
