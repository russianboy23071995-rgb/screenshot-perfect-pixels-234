import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireDeleteConfirmation } from "@/lib/test-mode";

export const deleteTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmation: z.string().max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    requireDeleteConfirmation(data.confirmation);
    const { supabase, userId } = context;
    const { data: documents, error } = await supabase.from("documents")
      .select("id,storage_path").eq("user_id", userId).eq("is_demo", true);
    if (error) throw new Error("Testbelege konnten nicht geladen werden.");
    const rows = documents ?? [];
    const paths = [...new Set(rows.map((d) => d.storage_path))];
    // Remove files first. Stop on errors; never discard their metadata on failure.
    for (let i = 0; i < paths.length; i += 100) {
      const { error: storageError } = await supabase.storage.from("belege").remove(paths.slice(i, i + 100));
      if (storageError) throw new Error("Testdateien konnten nicht vollständig gelöscht werden. Bitte erneut versuchen.");
    }
    // Privileged deletion is allowed only for the authenticated owner's test rows,
    // after their storage removal succeeded. The browser cannot call this RPC.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: cleanupError } = await supabaseAdmin.rpc("finish_test_cleanup", {
      p_document_ids: rows.map((d) => d.id), p_file_count: paths.length, p_owner: userId,
    });
    if (cleanupError) throw new Error("Bereinigung nicht abgeschlossen: " + cleanupError.message);
    const counts = z.object({ files: z.number(), documents: z.number(), transactions: z.number() }).parse(result);
    return counts;
  });