import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { counterpartyKey, invoiceKey } from "@/lib/vendor";

type Admin = SupabaseClient<Database>;

interface Input {
  ownerUserId: string;
  documentId: string;
  extracted: Record<string, unknown> | null;
  receivedAt: string;
  confidence: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const date = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

async function audit(
  admin: Admin,
  row: Database["public"]["Tables"]["audit_log"]["Insert"],
): Promise<void> {
  await admin.from("audit_log").insert(row);
}

/**
 * Legt aus den KI-Werten eines eingegangenen Belegs einen Buchungsentwurf an
 * oder hängt den Beleg an einen vorhandenen Vorgang.
 */
export async function createDraftFromDocument(
  admin: Admin,
  { ownerUserId, documentId, extracted, receivedAt, confidence }: Input,
): Promise<{ transactionId: string | null; action: "neu" | "verknuepft" | "keiner" }> {
  const e = extracted ?? {};
  const kiStatus = str(e["ki_status"]) ?? (extracted ? "ok" : "fehler");
  const belegart = str(e["belegart"]) ?? "rechnung";

  if (kiStatus !== "ok") {
    const note = `Keine KI-Werte (${str(e["ki_fehler"]) ?? kiStatus}) – bitte manuell erfassen`;
    await admin.from("documents").update({ review_note: note }).eq("id", documentId);
    await audit(admin, {
      user_id: ownerUserId,
      entity_type: "document",
      entity_id: documentId,
      action: "angelegt",
      actor: "system",
      new_data: { ki_status: kiStatus } as Json,
      note,
    });
    return { transactionId: null, action: "keiner" };
  }

  if (belegart === "sonstiges" || belegart === "mahnung") {
    const note =
      belegart === "mahnung"
        ? "Mahnung – kein neuer Buchungsentwurf. Bitte zugehörige Rechnung prüfen."
        : "Sonstiger Beleg – kein Buchungsentwurf angelegt.";
    await admin.from("documents").update({ review_note: note }).eq("id", documentId);
    await audit(admin, {
      user_id: ownerUserId,
      entity_type: "document",
      entity_id: documentId,
      action: "angelegt",
      actor: "system",
      new_data: { belegart } as Json,
      note,
    });
    return { transactionId: null, action: "keiner" };
  }

  const counterparty = str(e["counterparty"]) ?? "";
  const cpKey = counterpartyKey(counterparty);
  const invNo = str(e["invoice_number"]);
  const invoiceDate = date(e["invoice_date"]);
  const paymentDate = date(e["payment_date"]);

  // a) Vorgang suchen
  if (invNo && cpKey) {
    const { data: candidates } = await admin
      .from("transactions")
      .select("*")
      .eq("user_id", ownerUserId)
      .neq("booking_status", "storniert")
      .not("invoice_number", "is", null)
      .is("storno_of", null);
    const match = (candidates ?? []).find(
      (t) => invoiceKey(t.invoice_number) === invoiceKey(invNo) && counterpartyKey(t.counterparty) === cpKey,
    );
    if (match) {
      await admin.from("documents").update({ transaction_id: match.id }).eq("id", documentId);
      if (match.booking_status === "entwurf") {
        const patch: Database["public"]["Tables"]["transactions"]["Update"] = {};
        if (belegart === "zahlungsbeleg" && paymentDate) {
          patch.payment_date = paymentDate;
          patch.payment_status = "paid";
          patch.fiscal_year = Number(paymentDate.slice(0, 4));
        }
        if (!match.service_date && date(e["service_period_start"])) patch.service_date = date(e["service_period_start"]);
        if (!match.counterparty_vat_id && str(e["counterparty_ust_id"])) patch.counterparty_vat_id = str(e["counterparty_ust_id"]);
        if (!match.description && str(e["description"])) patch.description = str(e["description"])!;
        if (match.gross_cents === 0 && match.currency === "EUR" && num(e["gross_cents"]) && (str(e["currency"]) ?? "EUR") === "EUR") {
          patch.net_cents = Math.round(num(e["net_cents"]) ?? 0);
          patch.tax_cents = Math.round(num(e["tax_cents"]) ?? 0);
          patch.gross_cents = Math.round(num(e["gross_cents"]) ?? 0);
        }
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        if (keys.length > 0) {
          await admin.from("transactions").update(patch).eq("id", match.id);
          const old: Record<string, unknown> = {};
          for (const k of keys) old[k] = (match as Record<string, unknown>)[k];
          await audit(admin, {
            user_id: ownerUserId,
            entity_type: "transaction",
            entity_id: match.id,
            action: "geaendert",
            actor: "ki",
            old_data: old as Json,
            new_data: patch as Json,
            note: `Ergänzt aus ${belegart}`,
          });
        }
      } else {
        await admin
          .from("documents")
          .update({ review_note: "Zahlungsbeleg zu freigegebener Buchung – Zahldatum prüfen" })
          .eq("id", documentId);
      }
      await audit(admin, {
        user_id: ownerUserId,
        entity_type: "document",
        entity_id: documentId,
        action: "verknuepft",
        actor: "system",
        new_data: { transaction_id: match.id, belegart } as Json,
      });
      return { transactionId: match.id, action: "verknuepft" };
    }
  }

  // c) Neuer Entwurf
  const type = str(e["richtung"]) === "einnahme" ? "income" : "expense";
  const currency = (str(e["currency"]) ?? "EUR").toUpperCase();
  const net = Math.round(num(e["net_cents"]) ?? 0);
  const tax = Math.round(num(e["tax_cents"]) ?? 0);
  const gross = Math.round(num(e["gross_cents"]) ?? net + tax);
  const isEur = currency === "EUR";

  const { data: vendor } = cpKey
    ? await admin
        .from("vendor_profiles")
        .select("*")
        .eq("user_id", ownerUserId)
        .eq("counterparty_key", cpKey)
        .maybeSingle()
    : { data: null };

  let categoryId = vendor?.category_id ?? null;
  const suggestion = str(e["category_suggestion"]);
  if (!categoryId && suggestion) {
    const { data: cat } = await admin
      .from("categories")
      .select("id")
      .eq("user_id", ownerUserId)
      .eq("type", type)
      .eq("name", suggestion)
      .limit(1);
    categoryId = cat?.[0]?.id ?? null;
  }

  const notesParts: string[] = [];
  let finalInvoiceDate = invoiceDate;
  if (!finalInvoiceDate) {
    finalInvoiceDate = paymentDate ?? receivedAt.slice(0, 10);
    notesParts.push(
      paymentDate ? "Rechnungsdatum fehlte – Zahldatum übernommen." : "Rechnungsdatum fehlte – Eingangsdatum übernommen.",
    );
  }
  const hinweise = str(e["hinweise"]);
  if (hinweise) notesParts.push(hinweise);
  const plaus = Array.isArray(e["plausibilitaet"]) ? (e["plausibilitaet"] as unknown[]).filter((x) => typeof x === "string") : [];
  if (plaus.length) notesParts.push(`Plausibilität: ${plaus.join("; ")}`);

  const deductible = (vendor?.deductible as "yes" | "no" | "partial" | undefined) ?? "yes";
  const deductiblePercent = Number(vendor?.deductible_percent ?? 100);
  const eurTax = isEur ? tax : 0;
  const deductibleTax =
    type === "expense"
      ? deductible === "no"
        ? 0
        : deductible === "partial"
          ? Math.round((eurTax * deductiblePercent) / 100)
          : eurTax
      : 0;

  const draft: Database["public"]["Tables"]["transactions"]["Insert"] = {
    user_id: ownerUserId,
    type,
    booking_status: "entwurf",
    is_demo: false,
    counterparty,
    counterparty_vat_id: str(e["counterparty_ust_id"]),
    invoice_number: invNo,
    description: str(e["description"]) ?? vendor?.default_description ?? "",
    invoice_date: finalInvoiceDate,
    service_date: date(e["service_period_start"]),
    payment_date: paymentDate,
    payment_status: str(e["payment_status"]) === "bezahlt" ? "paid" : "open",
    payment_method: str(e["payment_method"]) ?? "bank",
    tax_rate: num(e["tax_rate"]) ?? 19,
    reverse_charge: e["reverse_charge"] === true,
    category_id: categoryId,
    deductible: type === "expense" ? deductible : "yes",
    deductible_percent: type === "expense" ? deductiblePercent : 100,
    currency,
    net_cents: isEur ? net : 0,
    tax_cents: eurTax,
    gross_cents: isEur ? gross : 0,
    deductible_tax_cents: deductibleTax,
    original_net_cents: isEur ? null : net,
    original_tax_cents: isEur ? null : tax,
    original_gross_cents: isEur ? null : gross,
    fiscal_year: Number((paymentDate ?? finalInvoiceDate).slice(0, 4)),
    notes: notesParts.length ? notesParts.join("\n") : null,
  };

  const { data: created, error } = await admin.from("transactions").insert(draft).select("*").single();
  if (error || !created) throw error ?? new Error("Insert fehlgeschlagen");

  await admin.from("documents").update({ transaction_id: created.id }).eq("id", documentId);
  await audit(admin, {
    user_id: ownerUserId,
    entity_type: "transaction",
    entity_id: created.id,
    action: "angelegt",
    actor: "ki",
    new_data: { ...created, ki_modell: str(e["ki_modell"]), confidence, document_id: documentId } as Json,
    note: `Entwurf aus ${belegart}`,
  });
  return { transactionId: created.id, action: "neu" };
}
