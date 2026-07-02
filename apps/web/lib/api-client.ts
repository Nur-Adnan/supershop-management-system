"use client";

import { getSupabase } from "./supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Calls the API with the current Supabase access token attached. Unwraps the
 * { success, data } envelope and redirects to /login on 401.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError("UNAUTHORIZED", "Session expired");
  }

  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string; details?: unknown } }
    | null;

  if (!json) throw new ApiError("INTERNAL_ERROR", res.statusText || "Request failed");
  if (!json.success) throw new ApiError(json.error.code, json.error.message, json.error.details);
  return json.data;
}
