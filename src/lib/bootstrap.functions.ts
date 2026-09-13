import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_CATEGORIES: { name: string; type: string; sort_order: number }[] = [
  { name: "Beratung / Dienstleistung", type: "income", sort_order: 1 },
  { name: "Produktverkauf", type: "income", sort_order: 2 },
  { name: "Sonstige Einnahmen", type: "income", sort_order: 3 },
  { name: "Software / SaaS", type: "expense", sort_order: 1 },
  { name: "Hardware / Technik", type: "expense", sort_order: 2 },
  { name: "Büro & Material", type: "expense", sort_order: 3 },
  { name: "Reisen & Fahrtkosten", type: "expense", sort_order: 4 },
  { name: "Marketing & Werbung", type: "expense", sort_order: 5 },
  { name: "Beiträge & Versicherungen", type: "expense", sort_order: 6 },
  { name: "Sonstige Ausgaben", type: "expense", sort_order: 7 },
];

function quarters(year: number) {
  return [1, 2, 3, 4].map((quarter) => {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    const due = new Date(Date.UTC(year, startMonth + 3, 10));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      fiscal_year: year,
      quarter,
      period_start: iso(start),
      period_end: iso(end),
      due_date: iso(due),
      status: "open",
    };
  });
}

/**
 * Runs once per signed-in user: the first user adopts the pre-existing
 * (unowned) data, every later user gets a fresh default setup.
 */
export const ensureUserData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    const { data: own, error: ownError } = await supabaseAdmin
      .from("settings")
      .select("id")
      .eq("user_id", uid)
      .limit(1);
    if (ownError) throw ownError;
    if (own && own.length > 0) return { status: "ready" as const };

    const { data: orphan, error: orphanError } = await supabaseAdmin
      .from("settings")
      .select("id")
      .is("user_id", null)
      .limit(1);
    if (orphanError) throw orphanError;

    if (orphan && orphan.length > 0) {
      await supabaseAdmin.from("settings").update({ user_id: uid }).is("user_id", null);
      await supabaseAdmin.from("categories").update({ user_id: uid }).is("user_id", null);
      await supabaseAdmin.from("transactions").update({ user_id: uid }).is("user_id", null);
      await supabaseAdmin.from("documents").update({ user_id: uid }).is("user_id", null);
      await supabaseAdmin.from("tax_periods").update({ user_id: uid }).is("user_id", null);
      return { status: "adopted" as const };
    }

    const year = new Date().getUTCFullYear();
    const { error: settingsError } = await supabaseAdmin
      .from("settings")
      .insert({ id: uid, user_id: uid, active_fiscal_year: year });
    if (settingsError) throw settingsError;

    await supabaseAdmin
      .from("categories")
      .insert(DEFAULT_CATEGORIES.map((c) => ({ ...c, color: "#1a1a1a", user_id: uid })));
    await supabaseAdmin
      .from("tax_periods")
      .insert(quarters(year).map((q) => ({ ...q, user_id: uid })));

    return { status: "seeded" as const };
  });
