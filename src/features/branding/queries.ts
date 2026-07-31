import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { workspaceBranding } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface WorkspaceBranding {
  storeName: string;
  supportEmail: string | null;
  country: string;
  currency: string;
}

export const DEFAULT_BRANDING: WorkspaceBranding = {
  storeName: "Minha Loja",
  supportEmail: null,
  country: "PT",
  currency: "EUR",
};

/** Identidade da loja usada no checkout público. Sem configuração, cai no padrão. */
export async function getWorkspaceBranding(): Promise<WorkspaceBranding> {
  if (!isDatabaseConfigured()) return DEFAULT_BRANDING;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [row] = await db
    .select({
      storeName: workspaceBranding.storeName,
      supportEmail: workspaceBranding.supportEmail,
      country: workspaceBranding.country,
      currency: workspaceBranding.currency,
    })
    .from(workspaceBranding)
    .where(eq(workspaceBranding.workspaceId, workspaceId))
    .limit(1);

  return row ?? DEFAULT_BRANDING;
}
