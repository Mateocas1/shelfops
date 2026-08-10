import type { ActionGrant, RoleScope } from "@shelfops/domain/authorization/types";

export type AuthorizedPrincipal = Readonly<{
  id: string;
  active: boolean;
  roleScopes: readonly RoleScope[];
  grants: readonly ActionGrant[];
}>;
