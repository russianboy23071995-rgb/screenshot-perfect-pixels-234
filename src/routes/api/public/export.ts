import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { exportData } = await import("@/lib/backup-export.server");
        return exportData(request, { key: process.env["EXPORT_API_KEY"], owner: process.env["OWNER_USER_ID"] }, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin;
        });
      },
    },
  },
});