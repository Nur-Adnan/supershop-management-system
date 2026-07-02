import { UserRole } from "./enums";

/** Granular permission keys checked by the RBAC guards. `*` (super admin) grants all. */
export const PERMISSIONS = {
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  CATALOG_READ: "catalog.read",
  CATALOG_MANAGE: "catalog.manage",
  STORES_READ: "stores.read",
  STORES_MANAGE: "stores.manage",
  SUPPLIERS_READ: "suppliers.read",
  SUPPLIERS_MANAGE: "suppliers.manage",
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_MANAGE: "customers.manage",
  INVENTORY_READ: "inventory.read",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_TRANSFER: "inventory.transfer",
  PURCHASING_READ: "purchasing.read",
  PURCHASING_MANAGE: "purchasing.manage",
  PURCHASING_APPROVE: "purchasing.approve",
  POS_SELL: "pos.sell",
  POS_REFUND: "pos.refund",
  POS_SESSION_MANAGE: "pos.session.manage",
  SALES_READ: "sales.read",
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_POST: "accounting.post",
  REPORTS_VIEW: "reports.view",
  HR_MANAGE: "hr.manage",
  PROMOTIONS_READ: "promotions.read",
  PROMOTIONS_MANAGE: "promotions.manage",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Wildcard meaning "all permissions". Held by super_admin. */
export const WILDCARD_PERMISSION = "*";

const READ_PERMISSIONS: string[] = ALL_PERMISSIONS.filter(
  (p) => p.endsWith(".read") || p === PERMISSIONS.REPORTS_VIEW,
);

export interface SystemRoleDef {
  name: UserRole;
  description: string;
  permissions: string[];
}

/** Seeded on API boot (idempotent). `isSystem` roles are not editable/deletable via the API. */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    name: UserRole.SUPER_ADMIN,
    description: "Unrestricted access to everything",
    permissions: [WILDCARD_PERMISSION],
  },
  {
    name: UserRole.STORE_MANAGER,
    description: "Runs a store's day-to-day operations",
    permissions: [
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.CATALOG_MANAGE,
      PERMISSIONS.STORES_READ,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_MANAGE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_MANAGE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_TRANSFER,
      PERMISSIONS.PURCHASING_READ,
      PERMISSIONS.PURCHASING_MANAGE,
      PERMISSIONS.PURCHASING_APPROVE,
      PERMISSIONS.POS_SELL,
      PERMISSIONS.POS_REFUND,
      PERMISSIONS.POS_SESSION_MANAGE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.PROMOTIONS_READ,
      PERMISSIONS.PROMOTIONS_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    name: UserRole.CASHIER,
    description: "Operates the POS terminal",
    permissions: [
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.STORES_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.POS_SELL,
      PERMISSIONS.POS_SESSION_MANAGE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.PROMOTIONS_READ,
    ],
  },
  {
    name: UserRole.INVENTORY_CLERK,
    description: "Receives, adjusts and transfers stock",
    permissions: [
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.STORES_READ,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_TRANSFER,
      PERMISSIONS.PURCHASING_READ,
    ],
  },
  {
    name: UserRole.ACCOUNTANT,
    description: "Finance, accounting and reporting",
    permissions: [
      PERMISSIONS.ACCOUNTING_READ,
      PERMISSIONS.ACCOUNTING_POST,
      PERMISSIONS.STORES_READ,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.PURCHASING_READ,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    name: UserRole.AUDITOR,
    description: "Read-only across the system",
    permissions: READ_PERMISSIONS,
  },
];
