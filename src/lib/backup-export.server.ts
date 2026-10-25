import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const MAX_EXPORT_ROWS = 50_000;
const PAGE_SIZE = 1000;
export const EXPORT_TABLES = ["transactions", "documents", "categories", "vendor_profiles", "settings", "tax_periods", "audit_log"] as const;
type ExportTable = (typeof EXPORT_TABLES)[number];
type Config = { key?: string | undefined; owner?: string | undefined };
type ClientFactory = () => Promise<SupabaseClient<Database>>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** Same constant-work comparison as receipt ingestion; never log either value. */
function timingSafeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function authorizeExport(request: Request, config: Config): Response | null {
  if (!config.key || !config.owner || !z.string().uuid().safeParse(config.owner).success) {
    return json({ error: "Die Export-Schnittstelle ist noch nicht konfiguriert." }, 503);
  }
  const provided = request.headers.get("x-export-key") ?? "";
  if (!provided || !timingSafeEqual(provided, config.key)) return json({ error: "Authentifizierung fehlgeschlagen." }, 401);
  return null;
}

export async function readExportTable(client: SupabaseClient<Database>, table: ExportTable, owner: string) {
  const rows: unknown[] = [];
  // These two existing tables have no created_at column; preserve all columns.
  const timestamp = table === "settings" || table === "vendor_profiles" ? "updated_at" : "created_at";
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error, count } = await client.from(table).select("*", { count: "exact" })
      .eq("user_id", owner).order(timestamp, { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) throw new Error(`Die Tabelle ${table} konnte nicht exportiert werden.`);
    if ((count ?? 0) > MAX_EXPORT_ROWS || rows.length + data.length > MAX_EXPORT_ROWS) {
      throw new Error(`Die Tabelle ${table} enthält mehr als 50.000 Zeilen. Export abgebrochen.`);
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function exportData(request: Request, config: Config, getClient: ClientFactory) {
  const denied = authorizeExport(request, config);
  if (denied) return denied;
  if (!config.owner) return json({ error: "Besitzer fehlt." }, 503);
  try {
    const client = await getClient();
    const owner = config.owner;
    const entries = await Promise.all(EXPORT_TABLES.map(async (table) => [table, await readExportTable(client, table, owner)]));
    return json({ exported_at: new Date().toISOString(), schema_version: 1, owner_user_id: owner, tables: Object.fromEntries(entries) });
  } catch (error) {
    // Only locally generated errors are returned, never provider errors or credentials.
    const message = error instanceof Error && /^Die Tabelle /.test(error.message) ? error.message : "Die Sicherung konnte nicht gelesen werden.";
    return json({ error: message }, 500);
  }
}

export function attachmentDisposition(filename: string) {
  const safe = filename.replace(/[\u0000-\u001f\u007f/\\]/g, "_");
  const fallback = safe.replace(/[^\x20-\x7e]|[";]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function exportFile(request: Request, config: Config, getClient: ClientFactory) {
  const denied = authorizeExport(request, config);
  if (denied) return denied;
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return json({ error: "Ungültige Dokument-ID." }, 400);
  try {
    const client = await getClient();
    const { data: document, error } = await client.from("documents")
      .select("storage_path, original_filename, file_type, sha256").eq("id", parsed.data).eq("user_id", config.owner ?? "").maybeSingle();
    if (error) return json({ error: "Der Beleg konnte nicht gelesen werden." }, 500);
    if (!document || !document.storage_path.startsWith(`${config.owner}/`)) return json({ error: "Beleg nicht gefunden." }, 404);
    const { data: file, error: downloadError } = await client.storage.from("belege").download(document.storage_path);
    if (downloadError || !file) return json({ error: "Belegdatei nicht gefunden." }, 404);
    const headers = new Headers({
      "Content-Type": document.file_type,
      "Content-Disposition": attachmentDisposition(document.original_filename),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    // Older manual uploads can have a null checksum; do not invent one.
    if (document.sha256) headers.set("x-sha256", document.sha256);
    return new Response(file, { headers });
  } catch {
    return json({ error: "Die Belegdatei konnte nicht gelesen werden." }, 500);
  }
}