import "server-only";

import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
  type WorkspaceRole,
} from "@/lib/workspace-access";

export type CustomerPermission =
  | "view"
  | "create"
  | "edit"
  | "export"
  | "import"
  | "delete"
  | "view_sensitive_data"
  | "manage_tags"
  | "manage_segments"
  | "bulk_actions";

const ROLE_PERMISSIONS: Record<WorkspaceRole, Set<CustomerPermission>> = {
  owner: new Set([
    "view",
    "create",
    "edit",
    "export",
    "import",
    "delete",
    "view_sensitive_data",
    "manage_tags",
    "manage_segments",
    "bulk_actions",
  ]),
  admin: new Set([
    "view",
    "create",
    "edit",
    "export",
    "import",
    "delete",
    "view_sensitive_data",
    "manage_tags",
    "manage_segments",
    "bulk_actions",
  ]),
  finance: new Set(["view", "export", "view_sensitive_data"]),
  marketing: new Set([
    "view",
    "export",
    "import",
    "manage_tags",
    "manage_segments",
    "bulk_actions",
  ]),
  support: new Set([
    "view",
    "create",
    "edit",
    "view_sensitive_data",
    "manage_tags",
  ]),
  analyst: new Set(["view", "export"]),
  viewer: new Set(["view"]),
};

export class CustomerAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403,
  ) {
    super(message);
  }
}

export interface CustomerAccessContext {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  canViewSensitiveData: boolean;
}

export async function requireCustomerPermission(
  permission: CustomerPermission,
): Promise<CustomerAccessContext> {
  let resolved;
  try {
    resolved = await requireWorkspaceAccess();
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      throw new CustomerAccessError(error.message, error.status);
    }
    throw error;
  }
  const permissions = ROLE_PERMISSIONS[resolved.role];
  if (!permissions.has(permission)) {
    throw new CustomerAccessError(
      "Você não possui permissão para realizar esta ação.",
      403,
    );
  }

  return {
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    role: resolved.role,
    canViewSensitiveData: permissions.has("view_sensitive_data"),
  };
}
