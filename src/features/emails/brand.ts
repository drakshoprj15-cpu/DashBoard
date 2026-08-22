import { getWorkspaceBranding } from "@/features/branding/queries";
import {
  EMAIL_BRAND_NAME,
  type EmailBrand,
} from "@/features/emails/template";

/**
 * Marca aplicada ao cabeçalho dos e-mails. Reaproveita a identidade
 * configurada em /configuracoes para que a logo da loja substitua o nome
 * fixo do template.
 */
export async function getEmailBrand(): Promise<EmailBrand> {
  const branding = await getWorkspaceBranding();
  return {
    name: branding.storeName || EMAIL_BRAND_NAME,
    logoUrl: branding.logoUrl,
  };
}
