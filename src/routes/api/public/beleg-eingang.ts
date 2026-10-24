import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/xml": "xml",
  "application/xml": "xml",
};

const bodySchema = z.object({
  file_base64: z.string().min(1),
  file_name: z.string().min(1).max(500),
  mime_type: z.string().min(1).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, "sha256 muss ein Hex-String mit 64 Zeichen sein"),
  source: z.enum(["email", "telegram", "upload"]),
  source_ref: z.string().max(500).nullish(),
  sender: z.string().max(500).nullish(),
  subject: z.string().max(1000).nullish(),
  received_at: z.string().max(64).nullish(),
  extracted_data: z.record(z.string(), z.unknown()).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Zeitkonstanter Vergleich, ohne Länge oder Inhalt preiszugeben. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function grossCentsFrom(extracted: Record<string, unknown> | null): number | null {
  if (!extracted) return null;
  if (typeof extracted["gross_cents"] === "number") return Math.round(extracted["gross_cents"]);
  if (typeof extracted["gross"] === "number") return Math.round(extracted["gross"] * 100);
  if (typeof extracted["net"] === "number") {
    const rate = typeof extracted["tax_rate"] === "number" ? extracted["tax_rate"] : 19;
    return Math.round(extracted["net"] * 100 * (1 + rate / 100));
  }
  return null;
}

export const Route = createFileRoute("/api/public/beleg-eingang")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ingestKey = process.env["INGEST_API_KEY"];
        const ownerUserId = process.env["OWNER_USER_ID"];
        if (!ingestKey || !ownerUserId) {
          return json({ error: "Der Belegeingang ist noch nicht konfiguriert." }, 503);
        }

        const providedKey = request.headers.get("x-ingest-key") ?? "";
        if (!providedKey || !timingSafeEqual(providedKey, ingestKey)) {
          return json({ error: "Authentifizierung fehlgeschlagen." }, 401);
        }

        let rawBody: unknown;
        try {
          rawBody = await request.json();
        } catch {
          return json({ error: "Der Request-Body ist kein gültiges JSON." }, 400);
        }
        const parsed = bodySchema.safeParse(rawBody);
        if (!parsed.success) {
          return json(
            {
              error: "Ungültige Felder.",
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            },
            400,
          );
        }
        const body = parsed.data;

        const ext = ALLOWED_MIME[body.mime_type];
        if (!ext) {
          return json({ error: "Dateityp nicht erlaubt. Erlaubt sind PDF, JPG, PNG und XML." }, 415);
        }

        let bytes: Uint8Array;
        try {
          bytes = decodeBase64(body.file_base64);
        } catch {
          return json({ error: "file_base64 konnte nicht dekodiert werden." }, 400);
        }
        if (bytes.length === 0) {
          return json({ error: "Die Datei ist leer." }, 400);
        }
        if (bytes.length > MAX_BYTES) {
          return json({ error: "Die Datei ist größer als 15 MB." }, 413);
        }

        const hex = await sha256Hex(bytes);
        if (hex !== body.sha256.toLowerCase()) {
          return json({ error: "sha256 stimmt nicht mit dem Dateiinhalt überein." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Exakte Dublette: gleiche Datei (sha256) bereits vorhanden.
        const { data: existing, error: dupError } = await supabaseAdmin
          .from("documents")
          .select("id")
          .eq("user_id", ownerUserId)
          .eq("sha256", hex)
          .limit(1);
        if (dupError) {
          return json({ error: "Dublettenprüfung fehlgeschlagen." }, 500);
        }
        if (existing && existing.length > 0) {
          return json({ status: "dublette", id: existing[0].id });
        }

        const receivedAt = body.received_at ?? new Date().toISOString();
        const receivedDate = new Date(receivedAt);
        const yyyy = String(receivedDate.getUTCFullYear());
        const mm = String(receivedDate.getUTCMonth() + 1).padStart(2, "0");
        const storagePath = `${ownerUserId}/eingang/${yyyy}/${mm}/${hex}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("belege")
          .upload(storagePath, bytes, { contentType: body.mime_type, upsert: false });
        if (uploadError) {
          return json({ error: "Die Datei konnte nicht gespeichert werden." }, 500);
        }

        // Verdacht auf Dublette: gleiche Quelle oder gleiche Rechnung bereits vorhanden.
        let reviewStatus: "zu_pruefen" | "dublette" = "zu_pruefen";
        let reviewNote: string | null = null;

        if (body.source_ref) {
          const { data: sameRef } = await supabaseAdmin
            .from("documents")
            .select("id")
            .eq("user_id", ownerUserId)
            .eq("source_ref", body.source_ref)
            .limit(1);
          if (sameRef && sameRef.length > 0) {
            reviewStatus = "dublette";
            reviewNote = "Bereits über dieselbe Quelle (z. B. dieselbe E-Mail) eingegangen.";
          }
        }

        if (reviewStatus === "zu_pruefen") {
          const extracted = body.extracted_data ?? null;
          const invoiceNumber =
            typeof extracted?.["invoice_number"] === "string"
              ? extracted["invoice_number"].trim()
              : "";
          const counterparty =
            typeof extracted?.["counterparty"] === "string"
              ? extracted["counterparty"].trim()
              : "";
          const grossCents = grossCentsFrom(extracted);
          if (invoiceNumber && counterparty && grossCents != null) {
            const { data: txMatches } = await supabaseAdmin
              .from("transactions")
              .select("id")
              .eq("user_id", ownerUserId)
              .ilike("invoice_number", invoiceNumber)
              .ilike("counterparty", counterparty)
              .eq("gross_cents", grossCents)
              .limit(1);
            if (txMatches && txMatches.length > 0) {
              reviewStatus = "dublette";
              reviewNote =
                "Mögliche Doppelerfassung: Es existiert eine Buchung mit gleicher Rechnungsnummer, gleichem Partner und gleichem Bruttobetrag.";
            }
          }
        }

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("documents")
          .insert({
            user_id: ownerUserId,
            filename: `${hex}.${ext}`,
            original_filename: body.file_name,
            file_type: body.mime_type,
            storage_path: storagePath,
            sync_status: "app_only",
            extracted_data: body.extracted_data ?? null,
            confidence: body.confidence ?? null,
            is_demo: false,
            sha256: hex,
            source: body.source,
            source_ref: body.source_ref ?? null,
            sender: body.sender ?? null,
            subject: body.subject ?? null,
            received_at: receivedAt,
            review_status: reviewStatus,
            review_note: reviewNote,
          })
          .select("id")
          .single();

        if (insertError) {
          // Gleichzeitiger identischer Upload: Unique-Index (user_id, sha256) greift.
          if (insertError.code === "23505") {
            await supabaseAdmin.storage.from("belege").remove([storagePath]);
            const { data: raced } = await supabaseAdmin
              .from("documents")
              .select("id")
              .eq("user_id", ownerUserId)
              .eq("sha256", hex)
              .limit(1);
            return json({ status: "dublette", id: raced?.[0]?.id ?? null });
          }
          await supabaseAdmin.storage.from("belege").remove([storagePath]);
          return json({ error: "Der Beleg konnte nicht angelegt werden." }, 500);
        }

        return json({ status: "angelegt", id: inserted.id, review_status: reviewStatus });
      },
    },
  },
});
