import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/export/datei")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { exportFile } = await import("@/lib/backup-export.server");
        return exportFile(request, { key: process.env["EXPORT_API_KEY"], owner: process.env["OWNER_USER_ID"] }, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin;
        });
      },
    },
  },
});