import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Copy, ExternalLink, FilePlus2, FileX, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TaxLinesEditor } from "@/components/finance/TaxLinesEditor";
import { BewirtungEditor, bewirtungResult } from "@/components/finance/BewirtungEditor";
import { sumLines, mainRate, inputTaxCents, transactionLines, allocateGross, bewirtungMissing } from "@/lib/tax-lines";
import { AppShell } from "@/components/finance/AppShell";
import { EmptyState } from "@/components/finance/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  REVIEW_STATUS_LABEL,
  SOURCE_LABEL,
  logAudit,
  getOwnerTestMode,
  useCategories,
  useSettings,
  useInvalidateFinance,
  usePruefliste,
  type DocumentRow,
  type Transaction,
} from "@/lib/finance";
import { centsToInput, formatDate, formatEur, parseAmountToCents } from "@/lib/money";
import { counterpartyKey } from "@/lib/vendor";

export const Route = createFileRoute("/_authenticated/pruefliste")({
  head: () => ({
    meta: [
      { title: "Prüfliste · Finanz-Cockpit" },
      {
        name: "description",
        content: "Buchungsentwürfe aus eingegangenen Belegen prüfen und gesammelt freigeben.",
      },
      { property: "og:title", content: "Prüfliste · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Buchungsentwürfe aus eingegangenen Belegen prüfen und gesammelt freigeben.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrueflistePage,
});

/* ------------------------------ Helpers ------------------------------ */

const EDITABLE = [
  "type",
  "counterparty",
  "counterparty_vat_id",
  "invoice_number",
  "description",
  "invoice_date",
  "service_date",
  "payment_date",
  "payment_status",
  "category_id",
  "tax_lines",
  "tip_cents",
  "input_tax_percent",
  "bewirtung",
  "tax_rate",
  "net_cents",
  "tax_cents",
  "gross_cents",
  "reverse_charge",
  "deductible",
  "deductible_percent",
  "deductible_tax_cents",
  "notes",
  "fiscal_year",
] as const;
type Editable = (typeof EDITABLE)[number];
type Draft = Pick<Transaction, Editable>;

/** KI-Feldnamen → Formularfelder */
const UNSURE_MAP: Record<string, Editable> = {
  counterparty: "counterparty",
  counterparty_ust_id: "counterparty_vat_id",
  invoice_number: "invoice_number",
  invoice_date: "invoice_date",
  payment_date: "payment_date",
  service_period_start: "service_date",
  net_cents: "net_cents",
  tax_cents: "tax_cents",
  gross_cents: "gross_cents",
  tax_rate: "tax_rate",
  category_suggestion: "category_id",
  description: "description",
  richtung: "type",
  payment_status: "payment_status",
  reverse_charge: "reverse_charge",
};

function aiInfo(docs: DocumentRow[]) {
  const unsure = new Set<Editable>();
  const warnings: string[] = [];
  let confidence: number | null = null;
  for (const d of docs) {
    const e = d.extracted_data ?? {};
    if (Array.isArray(e["unsichere_felder"])) {
      for (const f of e["unsichere_felder"] as unknown[]) {
        if (typeof f === "string" && UNSURE_MAP[f]) unsure.add(UNSURE_MAP[f]);
      }
    }
    if (Array.isArray(e["plausibilitaet"])) {
      for (const w of e["plausibilitaet"] as unknown[]) if (typeof w === "string") warnings.push(w);
    }
    if (d.confidence != null) confidence = confidence == null ? d.confidence : Math.min(confidence, d.confidence);
  }
  return { unsure, warnings, confidence };
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone =
    value < 0.6
      ? "border-destructive/50 bg-destructive/15 text-destructive"
      : value < 0.85
        ? "border-warning/50 bg-warning/15 text-warning-foreground"
        : "border-positive/50 bg-positive/15 text-positive";
  return (
    <Badge variant="outline" className={tone}>
      Erkennung {Math.round(value * 100)} %
    </Badge>
  );
}

function missingRequired(t: Draft, isBewirtung = false): string[] {
  const m: string[] = [];
  if (!t.counterparty.trim()) m.push("Partner");
  if (!t.invoice_date) m.push("Rechnungsdatum");
  if (!t.category_id) m.push("Kategorie");
  if (!t.gross_cents) m.push("EUR-Bruttobetrag");
  if (isBewirtung) m.push(...bewirtungMissing(t.bewirtung, t.gross_cents - t.tip_cents));
  return m;
}

function deductibleTax(d: Draft): number {
  return inputTaxCents(d.type, d.tax_cents, d.input_tax_percent ?? 100);
}

function pick(t: Transaction): Draft {
  const out = {} as Record<string, unknown>;
  for (const k of EDITABLE) out[k] = t[k];
  return out as Draft;
}

/* ------------------------------ Preview ------------------------------ */

function Preview({ document }: { document: DocumentRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.storage
      .from("belege")
      .createSignedUrl(document.storage_path, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [document.storage_path]);

  const belegart =
    typeof document.extracted_data?.["belegart"] === "string"
      ? (document.extracted_data["belegart"] as string)
      : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {document.is_demo && <Badge variant="outline">Test</Badge>}
        {belegart && <Badge variant="secondary">{belegart}</Badge>}
        {document.source && <Badge variant="outline">{SOURCE_LABEL[document.source] ?? document.source}</Badge>}
        <span className="truncate text-muted-foreground">{document.original_filename}</span>
      </div>
      {!url ? (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          Vorschau wird geladen …
        </div>
      ) : document.file_type === "application/pdf" ? (
        <iframe
          src={`${url}#toolbar=0&view=FitH`}
          title={document.original_filename}
          className="h-96 w-full rounded-xl border bg-background"
        />
      ) : document.file_type.startsWith("image/") ? (
        <img src={url} alt={document.original_filename} className="max-h-96 w-full rounded-xl border object-contain" />
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-muted-foreground">
          <p>Keine Vorschau für diesen Dateityp.</p>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" /> Datei öffnen
            </a>
          </Button>
        </div>
      )}
      {(document.sender || document.subject) && (
        <p className="truncate text-xs text-muted-foreground">
          {document.sender} {document.subject ? `· ${document.subject}` : ""} ·{" "}
          {formatDate(document.received_at ?? document.upload_date)}
        </p>
      )}
      {document.review_note && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs">{document.review_note}</p>
      )}
    </div>
  );
}

/* ------------------------------ Draft card ------------------------------ */

function Field({
  label,
  unsure,
  children,
  className,
}: {
  label: string;
  unsure?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1.5 rounded-lg ${unsure ? "bg-warning/15 p-1.5 ring-1 ring-warning/60" : ""} ${className ?? ""}`}
    >
      <Label className="text-xs">
        {label}
        {unsure && <span className="ml-1 text-warning-foreground">· unsicher</span>}
      </Label>
      {children}
    </div>
  );
}

function DraftCard({
  tx,
  docs,
  selected,
  onSelect,
  onDirty,
}: {
  tx: Transaction;
  docs: DocumentRow[];
  selected: boolean;
  onSelect: (v: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateFinance();
  const { data: settings } = useSettings();
  const original = useMemo(() => pick(tx), [tx]);
  const [d, setD] = useState<Draft>(original);
  const [eurGross, setEurGross] = useState(tx.currency !== "EUR" && tx.gross_cents ? centsToInput(tx.gross_cents) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setD(original);
  }, [original, tx]);

  const { unsure, warnings, confidence } = aiInfo(docs);
  const foreign = tx.currency !== "EUR";

  const changed = useMemo(() => {
    const hospitality = categories.find(c => c.id === d.category_id)?.name === "Bewirtung";
    const r = hospitality ? bewirtungResult(transactionLines(d), d.tip_cents, d.bewirtung?.["art"], d.counterparty) : null;
    const next: Draft = { ...d, ...(r?.berechnet ? { deductible: r.anteil_prozent === 70 ? "partial" as const : "yes" as const, deductible_percent: r.anteil_prozent, input_tax_percent: 100, bewirtung: { ...d.bewirtung, ...r } } : {}), deductible_tax_cents: inputTaxCents(d.type, d.tax_cents, hospitality ? 100 : d.input_tax_percent) };
    const diff: Partial<Record<Editable, unknown>> = {};
    const old: Partial<Record<Editable, unknown>> = {};
    for (const k of EDITABLE) {
      if (JSON.stringify(next[k] ?? null) !== JSON.stringify(original[k] ?? null)) {
        diff[k] = next[k];
        old[k] = original[k];
      }
    }
    return { diff, old };
  }, [d, original, categories]);
  const dirty = Object.keys(changed.diff).length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const set = <K extends Editable>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  function applyEurGross(value: string) {
    setEurGross(value);
    const g = parseAmountToCents(value);
    const base = tx.gross_cents ? transactionLines(tx) : [{ rate: tx.tax_rate, net_cents: tx.original_net_cents ?? 0, tax_cents: tx.original_tax_cents ?? 0 }];
    const converted = allocateGross(base, tx.tip_cents ?? 0, g);
    applyLines(converted.lines, converted.tip);
  }
  const isBewirtung = d.type === "expense" && categories.find(c => c.id === d.category_id)?.name === "Bewirtung";
  function applyLines(lines: import("@/lib/tax-lines").TaxLine[], tip: number) {
    const sums = sumLines(lines, tip);
    setD(p => ({ ...p, tax_lines: lines, tip_cents: tip, tax_rate: mainRate(lines), net_cents: sums.net, tax_cents: sums.tax, gross_cents: sums.gross }));
  }
  function applyBewirtung(b: Record<string, unknown>) {
    const result = bewirtungResult(transactionLines(d), d.tip_cents, b["art"], d.counterparty);
    setD(p => ({ ...p, bewirtung: { ...b, ...result }, ...(result.berechnet ? { deductible: result.anteil_prozent === 70 ? "partial" as const : "yes" as const, deductible_percent: result.anteil_prozent, input_tax_percent: 100, deductible_tax_cents: result.vorsteuer_cents } : {}) }));
  }

  async function save() {
    if (!dirty) return;
    setBusy(true);
    const patch = { ...changed.diff } as Record<string, unknown>;
    if (patch["payment_date"] !== undefined || patch["invoice_date"] !== undefined) {
      patch["fiscal_year"] = Number(((d.payment_date ?? d.invoice_date) || "").slice(0, 4)) || d.fiscal_year;
    }
    const { error } = await supabase.from("transactions").update(patch as never).eq("id", tx.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await logAudit({
      entity_type: "transaction",
      entity_id: tx.id,
      action: "geaendert",
      old_data: changed.old as Record<string, unknown>,
      new_data: patch,
    });
    setBusy(false);
    toast.success("Entwurf gespeichert.");
    invalidate();
  }

  async function noBookingDoc() {
    setBusy(true);
    for (const doc of docs) {
      await supabase.from("documents").update({ transaction_id: null, review_status: "geprueft", review_note: "Kein Buchungsbeleg" }).eq("id", doc.id);
      await logAudit({ entity_type: "document", entity_id: doc.id, action: "kein_beleg", old_data: { transaction_id: tx.id } });
    }
    const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
    if (!error) await logAudit({ entity_type: "transaction", entity_id: tx.id, action: "kein_beleg", old_data: pick(tx), note: "Entwurf verworfen – kein Buchungsbeleg" });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Als „kein Buchungsbeleg“ markiert.");
    invalidate();
  }

  async function markDuplicate() {
    setBusy(true);
    for (const doc of docs) {
      await supabase.from("documents").update({ transaction_id: null, review_status: "dublette", review_note: "Dublette bestätigt" }).eq("id", doc.id);
      await logAudit({ entity_type: "document", entity_id: doc.id, action: "dublette", old_data: { transaction_id: tx.id } });
    }
    const { error } = await supabase.from("transactions").delete().eq("id", tx.id).eq("booking_status", "entwurf");
    if (!error) await logAudit({ entity_type: "transaction", entity_id: tx.id, action: "dublette", old_data: pick(tx), note: "Entwurf als Dublette gelöscht" });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Als Dublette markiert.");
    invalidate();
  }

  const relevantCategories = categories.filter((c) => c.type === d.type && c.active);
  const missing = missingRequired(d, isBewirtung);

  return (
    <div className="glass grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
      <div className="space-y-4">
        {docs.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            Kein Beleg verknüpft (manuell erfasst)
          </div>
        ) : (
          docs.map((doc) => <Preview key={doc.id} document={doc} />)
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label="Vorgang auswählen" />
          <Badge variant="outline">Entwurf</Badge>
          {tx.is_demo && <Badge variant="outline">Test</Badge>}
          <ConfidenceBadge value={confidence} />
          {foreign && <Badge variant="secondary">Fremdwährung {tx.currency}</Badge>}
          {dirty && <Badge variant="destructive">Ungespeichert</Badge>}
        </div>

        {warnings.length > 0 && (
          <ul className="rounded-xl border border-warning/50 bg-warning/15 p-3 text-xs">
            {warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Art" unsure={unsure.has("type")}>
            <Select value={d.type} onValueChange={(v) => set("type", v as Draft["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Ausgabe</SelectItem>
                <SelectItem value="income">Einnahme</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Kategorie *" unsure={unsure.has("category_id")}>
            <Select value={d.category_id ?? "none"} onValueChange={(v) => set("category_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ohne Kategorie</SelectItem>
                {relevantCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Partner *" unsure={unsure.has("counterparty")}>
            <Input value={d.counterparty} onChange={(e) => set("counterparty", e.target.value)} />
          </Field>
          <Field label="USt-IdNr. Partner" unsure={unsure.has("counterparty_vat_id")}>
            <Input value={d.counterparty_vat_id ?? ""} onChange={(e) => set("counterparty_vat_id", e.target.value || null)} />
          </Field>
          <Field label="Rechnungsnummer" unsure={unsure.has("invoice_number")}>
            <Input value={d.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value || null)} />
          </Field>
          <Field label="Rechnungsdatum *" unsure={unsure.has("invoice_date")}>
            <Input type="date" value={d.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />
          </Field>
          <Field label="Leistungsdatum" unsure={unsure.has("service_date")}>
            <Input type="date" value={d.service_date ?? ""} onChange={(e) => set("service_date", e.target.value || null)} />
          </Field>
          <Field label="Zahldatum" unsure={unsure.has("payment_date")}>
            <Input type="date" value={d.payment_date ?? ""} onChange={(e) => set("payment_date", e.target.value || null)} />
          </Field>
          <Field label="Zahlstatus" unsure={unsure.has("payment_status")}>
            <Select value={d.payment_status} onValueChange={(v) => set("payment_status", v as Draft["payment_status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Offen</SelectItem>
                <SelectItem value="paid">Bezahlt</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {foreign && <Field label="EUR-Betrag laut Bankabbuchung (brutto)" className="sm:col-span-2"><Input inputMode="decimal" value={eurGross} onChange={e => applyEurGross(e.target.value)} /></Field>}
          <div className="sm:col-span-2"><TaxLinesEditor lines={transactionLines(d)} tip={d.tip_cents ?? 0} expense={d.type === "expense"} rates={settings?.tax_rates ?? [19, 7, 0]} onChange={(l, t) => { applyLines(l, t); if (isBewirtung) { const r = bewirtungResult(l, t, d.bewirtung?.["art"], d.counterparty); setD(p => ({ ...p, bewirtung: { ...p.bewirtung, ...r }, ...(r.berechnet ? { deductible: r.anteil_prozent === 70 ? "partial" as const : "yes" as const, deductible_percent: r.anteil_prozent, input_tax_percent: 100 } : {}) })); } }} /></div>
          {isBewirtung && <div className="sm:col-span-2"><BewirtungEditor value={d.bewirtung} lines={transactionLines(d)} tip={d.tip_cents ?? 0} supplier={d.counterparty} onChange={applyBewirtung} /></div>}
          <Field label="Reverse Charge (§ 13b)" unsure={unsure.has("reverse_charge")}>
            <Switch checked={d.reverse_charge} onCheckedChange={(v) => set("reverse_charge", v)} />
          </Field>
          {d.type === "expense" && (
            <Field label="Betriebsausgabe abziehbar %">
              <div className="flex gap-2">
                <Select value={d.deductible} onValueChange={(v) => { set("deductible", v as Draft["deductible"]); set("input_tax_percent", isBewirtung ? 100 : v === "partial" ? d.deductible_percent : v === "no" ? 0 : 100); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Vollständig</SelectItem>
                    <SelectItem value="partial">Teilweise</SelectItem>
                    <SelectItem value="no">Nein</SelectItem>
                  </SelectContent>
                </Select>
                {d.deductible === "partial" && (
                  <Input className="w-20" type="number" min={0} max={100} value={d.deductible_percent} onChange={(e) => set("deductible_percent", Number(e.target.value))} />
                )}
              </div>
            </Field>
          )}
          {d.type === "expense" && <Field label="Vorsteuer abziehbar %"><Input type="number" min={0} max={100} value={isBewirtung ? 100 : d.input_tax_percent} disabled={isBewirtung} onChange={e => set("input_tax_percent", Number(e.target.value))} /></Field>}
          <Field label="Beschreibung" unsure={unsure.has("description")} className="sm:col-span-2">
            <Input value={d.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Notizen" className="sm:col-span-2">
            <Textarea rows={2} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
          </Field>
        </div>

        {!d.payment_date && (
          <p className="text-xs text-muted-foreground">
            Noch nicht bezahlt – Zahldatum später unter Offene Posten nachtragen.
          </p>
        )}
        {missing.length > 0 && (
          <p className="text-xs text-destructive">Für die Freigabe fehlt: {missing.join(", ")}</p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>
            <Save className="mr-2 size-4" /> Änderungen speichern
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void markDuplicate()}>
            <Copy className="mr-2 size-4" /> Dublette
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void noBookingDoc()}>
            <FileX className="mr-2 size-4" /> Kein Buchungsbeleg
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Orphan card ------------------------------ */

function OrphanCard({ document }: { document: DocumentRow }) {
  const invalidate = useInvalidateFinance();
  const [busy, setBusy] = useState(false);
  const e = document.extracted_data ?? {};

  async function createBooking() {
    setBusy(true);
    const s = (k: string) => (typeof e[k] === "string" && (e[k] as string).trim() ? (e[k] as string).trim() : null);
    const n = (k: string) => (typeof e[k] === "number" ? Math.round(e[k] as number) : 0);
    const invoiceDate = s("invoice_date") ?? (document.received_at ?? document.upload_date).slice(0, 10);
    const payload = {
      type: (s("richtung") === "einnahme" ? "income" : "expense") as "income" | "expense",
      booking_status: "entwurf",
      counterparty: s("counterparty") ?? "",
      invoice_number: s("invoice_number"),
      description: s("description") ?? "",
      invoice_date: invoiceDate,
      payment_date: s("payment_date"),
      net_cents: n("net_cents"),
      tax_cents: n("tax_cents"),
      gross_cents: n("gross_cents"),
      tax_rate: typeof e["tax_rate"] === "number" ? (e["tax_rate"] as number) : 19,
      fiscal_year: Number((s("payment_date") ?? invoiceDate).slice(0, 4)),
      is_demo: await getOwnerTestMode(),
    };
    const { data, error } = await supabase.from("transactions").insert(payload).select("id").single();
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await supabase.from("documents").update({ transaction_id: data.id }).eq("id", document.id);
    await logAudit({ entity_type: "transaction", entity_id: data.id, action: "angelegt", new_data: payload, note: "Manuell aus Beleg angelegt" });
    await logAudit({ entity_type: "document", entity_id: document.id, action: "verknuepft", new_data: { transaction_id: data.id } });
    setBusy(false);
    toast.success("Entwurf angelegt – jetzt Felder ergänzen.");
    invalidate();
  }

  async function decide(action: "kein_beleg" | "dublette") {
    setBusy(true);
    const { error } = await supabase
      .from("documents")
      .update(
        action === "dublette"
          ? { review_status: "dublette", review_note: document.review_note ? `Dublette bestätigt – ${document.review_note}` : "Dublette bestätigt" }
          : { review_status: "geprueft", review_note: "Kein Buchungsbeleg" },
      )
      .eq("id", document.id);
    if (!error) await logAudit({ entity_type: "document", entity_id: document.id, action });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(action === "dublette" ? "Als Dublette markiert." : "Als „kein Buchungsbeleg“ markiert.");
    invalidate();
  }

  return (
    <div className="glass grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
      <Preview document={document} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={document.review_status === "dublette" ? "destructive" : "secondary"}>
            {document.review_status === "dublette" ? "Verdacht auf Dublette" : REVIEW_STATUS_LABEL[document.review_status]}
          </Badge>
          <Badge variant="outline">Ohne Vorgang</Badge>
          <ConfidenceBadge value={document.confidence} />
        </div>
        <p className="text-sm text-muted-foreground">
          Für diesen Beleg wurde kein Buchungsentwurf angelegt (z. B. KI-Fehler, Mahnung oder sonstiger Beleg).
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void createBooking()}>
            <FilePlus2 className="mr-2 size-4" /> Buchung anlegen
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("dublette")}>
            <Copy className="mr-2 size-4" /> Dublette
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide("kein_beleg")}>
            <FileX className="mr-2 size-4" /> Kein Buchungsbeleg
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

function PrueflistePage() {
  const { data, isLoading } = usePruefliste();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateFinance();
  const drafts = data?.drafts ?? [];
  const orphanDocs = data?.orphanDocs ?? [];
  const docsByTx = data?.docsByTx ?? {};
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const total = drafts.length + orphanDocs.length;
  const allSelected = drafts.length > 0 && drafts.every((d) => selected.has(d.id));

  const markDirty = useMemo(() => {
    const cache = new Map<string, (dirty: boolean) => void>();
    return (id: string) => {
      if (!cache.has(id)) {
        cache.set(id, (dirty: boolean) =>
          setDirtyIds((prev) => {
            if (prev.has(id) === dirty) return prev;
            const next = new Set(prev);
            if (dirty) next.add(id);
            else next.delete(id);
            return next;
          }),
        );
      }
      return cache.get(id) ?? (() => undefined);
    };
  }, []);

  async function approveSelected() {
    const targets = drafts.filter((d) => selected.has(d.id));
    if (!targets.length) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    let ok = 0;
    const skipped: string[] = [];
    for (const t of targets) {
      if (dirtyIds.has(t.id)) {
        skipped.push(`${t.counterparty || "Ohne Partner"}: ungespeicherte Änderungen`);
        continue;
      }
      const missing = missingRequired(t, categories.find(c => c.id === t.category_id)?.name === "Bewirtung");
      if (missing.length) {
        skipped.push(`${t.counterparty || "Ohne Partner"}: fehlt ${missing.join(", ")}`);
        continue;
      }
      const approvedAt = new Date().toISOString();
      const { error } = await supabase
        .from("transactions")
        .update({
          booking_status: "freigegeben",
          approved_at: approvedAt,
          approved_by: userId ?? null,
          deductible_tax_cents: deductibleTax(t),
        })
        .eq("id", t.id)
        .eq("booking_status", "entwurf");
      if (error) {
        skipped.push(`${t.counterparty}: ${error.message}`);
        continue;
      }
      await supabase.from("documents").update({ review_status: "geprueft" }).eq("transaction_id", t.id);
      await logAudit({
        entity_type: "transaction",
        entity_id: t.id,
        action: "freigegeben",
        old_data: { booking_status: "entwurf" },
        new_data: { booking_status: "freigegeben", approved_at: approvedAt },
      });
      const key = counterpartyKey(t.counterparty);
      if (key && userId) {
        await supabase.from("vendor_profiles").upsert(
          {
            user_id: userId,
            counterparty_key: key,
            display_name: t.counterparty,
            category_id: t.category_id,
            deductible: t.deductible,
            deductible_percent: t.deductible_percent,
            default_description: t.description || null,
            updated_at: approvedAt,
          },
          { onConflict: "user_id,counterparty_key" },
        );
      }
      ok += 1;
    }
    setBusy(false);
    setSelected(new Set());
    if (ok) toast.success(`${ok} ${ok === 1 ? "Buchung" : "Buchungen"} freigegeben und festgeschrieben.`);
    if (skipped.length) toast.error(`Nicht freigegeben:\n${skipped.join("\n")}`, { duration: 10000 });
    invalidate();
  }

  return (
    <AppShell
      title="Prüfliste"
      subtitle={total === 0 ? "Keine offenen Prüfungen" : `${total} ${total === 1 ? "Beleg" : "Belege"} zu prüfen`}
      actions={
        drafts.length > 0 ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v === true ? new Set(drafts.map((d) => d.id)) : new Set())}
              />
              Alle auswählen
            </label>
            <Button disabled={busy || selected.size === 0} onClick={() => void approveSelected()}>
              <ShieldCheck className="mr-2 size-4" /> Markierte freigeben ({selected.size})
            </Button>
          </>
        ) : null
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade Prüfliste …</p>
      ) : total === 0 ? (
        <EmptyState
          title="Alles geprüft"
          description="Sobald Belege eingehen oder Entwürfe angelegt werden, erscheinen sie hier zur Freigabe."
        />
      ) : (
        <div className="grid gap-4">
          {drafts.map((tx) => (
            <DraftCard
              key={tx.id}
              tx={tx}
              docs={docsByTx[tx.id] ?? []}
              selected={selected.has(tx.id)}
              onSelect={(v) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(tx.id);
                  else next.delete(tx.id);
                  return next;
                })
              }
              onDirty={markDirty(tx.id)}
            />
          ))}
          {orphanDocs.map((doc) => (
            <OrphanCard key={doc.id} document={doc} />
          ))}
        </div>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCheck className="size-4" /> Erst freigegebene Buchungen zählen in EÜR und Umsatzsteuer. Danach sind sie
        festgeschrieben und nur noch per Storno korrigierbar.
      </p>
    </AppShell>
  );
}
