import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ExtractInput = z.object({
  fileData: z.string().min(10), // data:<mime>;base64,....
  mimeType: z.string().min(3),
  filename: z.string().min(1),
});

export interface ExtractedReceipt {
  counterparty: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  service_date: string | null;
  net: number | null;
  tax_rate: number | null;
  gross: number | null;
  currency: string | null;
  category_hint: string | null;
  description: string | null;
  confidence: number;
  raw: string;
}

const SYSTEM_PROMPT = `Du bist ein präziser Beleg-Extraktor für deutsche Rechnungen und Kassenbelege.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown, ohne Erklärung.
Schema:
{
  "counterparty": string|null,      // Rechnungssteller / Händler
  "invoice_number": string|null,
  "invoice_date": string|null,      // YYYY-MM-DD
  "service_date": string|null,      // YYYY-MM-DD, Leistungsdatum falls abweichend
  "net": number|null,               // Nettobetrag in Euro, Punkt als Dezimaltrenner
  "tax_rate": number|null,          // 19, 7 oder 0
  "gross": number|null,             // Bruttobetrag in Euro
  "currency": string|null,          // z.B. "EUR"
  "category_hint": string|null,     // z.B. "Software & Tools", "Reisekosten", "Bürobedarf"
  "description": string|null,       // kurze Beschreibung der Leistung
  "confidence": number              // 0 bis 1
}
Wenn ein Wert nicht sicher erkennbar ist, gib null zurück. Rate keine Zahlen.`;

export const extractReceipt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data }): Promise<ExtractedReceipt> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Beleg-Erkennung ist nicht konfiguriert.");

    const isPdf = data.mimeType.includes("pdf");
    const contentBlock = isPdf
      ? {
          type: "file",
          file: { filename: data.filename, file_data: data.fileData },
        }
      : { type: "image_url", image_url: { url: data.fileData } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrahiere die Belegdaten als JSON." },
              contentBlock,
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 402) {
        throw new Error("Das KI-Guthaben ist aufgebraucht. Bitte Guthaben aufladen.");
      }
      if (response.status === 429) {
        throw new Error("Zu viele Anfragen an die Beleg-Erkennung. Bitte kurz warten.");
      }
      throw new Error(`Beleg-Erkennung fehlgeschlagen (${response.status}): ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    const jsonText = text.replace(/```json|```/g, "").trim();

    let parsed: Partial<ExtractedReceipt> = {};
    try {
      parsed = JSON.parse(jsonText) as Partial<ExtractedReceipt>;
    } catch {
      parsed = {};
    }

    const num = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const str = (value: unknown): string | null =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    return {
      counterparty: str(parsed.counterparty),
      invoice_number: str(parsed.invoice_number),
      invoice_date: str(parsed.invoice_date),
      service_date: str(parsed.service_date),
      net: num(parsed.net),
      tax_rate: num(parsed.tax_rate),
      gross: num(parsed.gross),
      currency: str(parsed.currency) ?? "EUR",
      category_hint: str(parsed.category_hint),
      description: str(parsed.description),
      confidence: num(parsed.confidence) ?? (Object.keys(parsed).length ? 0.6 : 0),
      raw: jsonText.slice(0, 4000),
    };
  });
