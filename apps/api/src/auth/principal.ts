/** The authenticated, authorized caller resolved from a Supabase JWT + the Mongo user/role. */
export interface Principal {
  userId: string;
  supabaseId: string;
  email: string;
  roleName: string;
  permissions: string[];
  storeIds: string[];
  status: "active" | "disabled";
}

/** Verified claims extracted from a Supabase JWT. */
export interface SupabaseClaims {
  sub: string;
  email: string;
}
