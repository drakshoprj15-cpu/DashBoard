import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/database/client";
import { profiles, workspaceMembers, workspaces } from "@/database/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

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

type WorkspaceRole =
  | "owner"
  | "admin"
  | "finance"
  | "marketing"
  | "support"
  | "analyst"
  | "viewer";

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

async function resolveWorkspaceForUser(user: {
  id: string;
  email: string;
  name: string;
}): Promise<{ workspaceId: string; role: WorkspaceRole }> {
  const db = getDb();
  const [membership] = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.profileId, user.id),
        eq(workspaceMembers.isActive, true),
      ),
    )
    .limit(1);

  if (membership) {
    return {
      workspaceId: membership.workspaceId,
      role: membership.role as WorkspaceRole,
    };
  }

  const workspaceId = await getOrCreateDefaultWorkspace();
  const [workspace] = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) throw new CustomerAccessError("Workspace não encontrado.");

  const [ownerProfile] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, workspace.ownerId))
    .limit(1);
  const [existingMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .limit(1);

  const canClaimLegacyWorkspace =
    workspace.ownerId === user.id ||
    (ownerProfile?.email === "sistema@infinity.app" && !existingMember);

  if (!canClaimLegacyWorkspace) {
    throw new CustomerAccessError(
      "O seu usuário não pertence a este workspace.",
      403,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values({ id: user.id, email: user.email, name: user.name })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { email: user.email, name: user.name, updatedAt: new Date() },
      });
    await tx
      .update(workspaces)
      .set({ ownerId: user.id, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId,
        profileId: user.id,
        role: "owner",
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
  });

  return { workspaceId, role: "owner" };
}

export async function requireCustomerPermission(
  permission: CustomerPermission,
): Promise<CustomerAccessContext> {
  const session = await getSession();
  if (!session) throw new CustomerAccessError("Autenticação necessária.", 401);

  if (session.demoMode) {
    const workspaceId = await getOrCreateDefaultWorkspace();
    return {
      workspaceId,
      userId: session.user.id,
      role: "owner",
      canViewSensitiveData: true,
    };
  }

  const resolved = await resolveWorkspaceForUser(session.user);
  const permissions = ROLE_PERMISSIONS[resolved.role];
  if (!permissions.has(permission)) {
    throw new CustomerAccessError(
      "Você não possui permissão para realizar esta ação.",
      403,
    );
  }

  return {
    ...resolved,
    userId: session.user.id,
    canViewSensitiveData: permissions.has("view_sensitive_data"),
  };
}
