import "server-only";

import {
  CustomerAccessError,
  requireCustomerPermission,
} from "@/features/customers/access";

export type PixelPermission = "view" | "manage";

export class PixelAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403,
  ) {
    super(message);
  }
}

/**
 * Centraliza a autorização da central de pixels. A resolução do workspace
 * reaproveita a mesma fonte de verdade do restante do painel (sessão +
 * membership), evitando que Server Actions possam operar no workspace
 * padrão sem autenticação.
 */
export async function requirePixelPermission(permission: PixelPermission) {
  try {
    const access = await requireCustomerPermission("view");

    if (
      permission === "manage" &&
      !(["owner", "admin", "marketing"] as string[]).includes(access.role)
    ) {
      throw new PixelAccessError(
        "Você não possui permissão para gerenciar pixels.",
        403,
      );
    }

    return access;
  } catch (error) {
    if (error instanceof PixelAccessError) throw error;
    if (error instanceof CustomerAccessError) {
      throw new PixelAccessError(error.message, error.status);
    }
    throw error;
  }
}
