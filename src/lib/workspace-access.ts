import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/database/client";
import { profiles, workspaceMembers, workspaces } from "@/database/schema";
import { getSession } from "@/lib/auth/session";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "finance"
  | "marketing"
  | "support"
  | "analyst"
  | "viewer";

export class WorkspaceAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

export interface WorkspaceAccessContext {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  demoMode: boolean;
}

/**
 * Resolve o workspace real do utilizador autenticado.
 *
 * O fallback para o workspace legado só existe para a primeira migração da
 * instalação antiga, quando a operação ainda pertencia ao perfil de sistema.
 * Depois de existir um membro, um utilizador sem associação nunca pode
 * "adotar" esse workspace.
 */
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

  if (!workspace) {
    throw new WorkspaceAccessError("Workspace não encontrado.");
  }

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
    throw new WorkspaceAccessError(
      "O seu utilizador não pertence a este workspace.",
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

/**
 * Autenticação e autorização de workspace para Server Components, Server
 * Actions e Route Handlers. O workspace nunca é recebido do browser.
 */
export async function requireWorkspaceAccess(
  allowedRoles?: readonly WorkspaceRole[],
): Promise<WorkspaceAccessContext> {
  const session = await getSession();
  if (!session) {
    throw new WorkspaceAccessError("Autenticação necessária.", 401);
  }

  if (session.demoMode) {
    return {
      workspaceId: await getOrCreateDefaultWorkspace(),
      userId: session.user.id,
      role: "owner",
      demoMode: true,
    };
  }

  const resolved = await resolveWorkspaceForUser(session.user);
  if (allowedRoles && !allowedRoles.includes(resolved.role)) {
    throw new WorkspaceAccessError(
      "Você não possui permissão para realizar esta ação.",
      403,
    );
  }

  return {
    ...resolved,
    userId: session.user.id,
    demoMode: false,
  };
}
