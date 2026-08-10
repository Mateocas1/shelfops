import { actionDecision } from "@shelfops/domain/authorization/action-policy";
import { validateEffectiveRange } from "@shelfops/domain/governance/versioned-policy";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import type { ConfigurationCommand, ConfigurationRepository, ConfigurationResult } from "../ports/configuration-repository.js";
export async function configureReferenceData(principal: AuthorizedPrincipal, command: Omit<ConfigurationCommand, "actorId">, repository: ConfigurationRepository): Promise<ConfigurationResult> {
  if (command.target !== "store-reference") throw new Error("unsupported-target");
  if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, { id: command.referenceId, storeId: command.storeId, sectorId: "", category: "reference-data", reporterId: principal.id }, "configure-store-policy").outcome !== "allowed") throw new Error("forbidden");
  return repository.apply({ ...command, ...validateEffectiveRange(command.effectiveAt, command.effectiveUntil), actorId: principal.id });
}
