import { canAccessStore, hasAllPermissions, isSuperAdmin } from "./authz";
import type { Principal } from "./principal";

const cashier: Principal = {
  userId: "u1",
  supabaseId: "s1",
  email: "c@x.com",
  roleName: "cashier",
  permissions: ["pos.sell", "catalog.read"],
  storeIds: ["A", "B"],
  status: "active",
};

const admin: Principal = {
  ...cashier,
  roleName: "super_admin",
  permissions: ["*"],
  storeIds: [],
};

describe("authz (pure RBAC, no HTTP/DB)", () => {
  it("hasAllPermissions requires every listed permission", () => {
    expect(hasAllPermissions(cashier, ["pos.sell"])).toBe(true);
    expect(hasAllPermissions(cashier, ["pos.sell", "catalog.read"])).toBe(true);
    expect(hasAllPermissions(cashier, ["accounting.post"])).toBe(false);
    expect(hasAllPermissions(cashier, ["pos.sell", "accounting.post"])).toBe(false);
    expect(hasAllPermissions(cashier, [])).toBe(true);
  });

  it("super_admin wildcard grants every permission", () => {
    expect(isSuperAdmin(admin)).toBe(true);
    expect(isSuperAdmin(cashier)).toBe(false);
    expect(hasAllPermissions(admin, ["accounting.post", "anything.at.all"])).toBe(true);
  });

  it("canAccessStore checks membership; super_admin bypasses", () => {
    expect(canAccessStore(cashier, "A")).toBe(true);
    expect(canAccessStore(cashier, "Z")).toBe(false);
    expect(canAccessStore(admin, "Z")).toBe(true);
  });
});
