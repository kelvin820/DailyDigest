import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import { cache } from 'react';
import {readingMode} from '../reader/mode.mjs';

export const demoMode = () => readingMode() === 'demo';
export const previewMode = () => readingMode() === 'preview';

export async function supabase() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error("SUPABASE_NOT_CONFIGURED");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Server components cannot write cookies; the proxy refreshes sessions.
        }
      },
    },
  });
}

export const membership = cache(async (admin = false) => {
  if (previewMode()) throw Error('PREVIEW_READ_ONLY');
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw Error("UNAUTHORIZED");
  const { data: member, error: memberError } = await db.from("site_members")
    .select("role,active").eq("user_id", user.id).single();
  if (memberError || !member?.active || (admin && member.role !== "admin")) {
    throw Error("FORBIDDEN");
  }
  return { db, user, role: member.role as "reader" | "admin" };
});

export async function pageMember(admin = false) {
  if (demoMode()) return { scope: "demo", role: "demo" as const };
  if (previewMode()) {
    if (admin) redirect('/');
    return {scope:'preview',role:'preview' as const};
  }
  try {
    const member = await membership(admin);
    return { scope: member.user.id, role: member.role };
  } catch {
    redirect("/login");
  }
}

