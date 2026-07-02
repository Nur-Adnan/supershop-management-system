"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!isSupabaseConfigured()) {
    return <span className="text-sm text-default-400">Auth not configured</span>;
  }
  if (!email) {
    return (
      <Link href="/login" className="text-sm underline">
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>{email}</span>
      <Button size="sm" variant="ghost" onPress={() => void getSupabase().auth.signOut()}>
        Sign out
      </Button>
    </div>
  );
}
