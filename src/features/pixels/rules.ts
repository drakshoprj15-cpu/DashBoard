import type { PurchaseRule } from "./types";

/**
 * Resolve a regra efetiva de contagem de Purchase: o override da landing
 * page (quando definido) tem prioridade sobre o padrão global do workspace.
 *
 * Pura — sem banco — para não depender de mocks nos testes.
 */
export function resolvePurchaseRule(
  workspaceDefault: boolean,
  landingPageOverride: boolean | null,
): PurchaseRule {
  const effective = landingPageOverride ?? workspaceDefault;
  return effective ? "generated" : "approved";
}
