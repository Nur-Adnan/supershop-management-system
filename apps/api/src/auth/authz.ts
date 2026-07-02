import { WILDCARD_PERMISSION } from "@supershop/shared";
import type { Principal } from "./principal";

/** Pure RBAC logic — unit-tested independently of HTTP/DB (Phase 2 DoD). */

export function isSuperAdmin(principal: Principal): boolean {
  return principal.permissions.includes(WILDCARD_PERMISSION);
}

/** True only if the principal holds every required permission (or is super admin). */
export function hasAllPermissions(principal: Principal, required: readonly string[]): boolean {
  if (isSuperAdmin(principal)) return true;
  const held = new Set(principal.permissions);
  return required.every((perm) => held.has(perm));
}

/** True if the principal may act on the given store (super admin bypasses store scoping). */
export function canAccessStore(principal: Principal, storeId: string): boolean {
  if (isSuperAdmin(principal)) return true;
  return principal.storeIds.includes(storeId);
}
