import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TaxLinesEditor } from "@/components/finance/TaxLinesEditor";
import { BewirtungEditor, bewirtungResult } from "@/components/finance/BewirtungEditor";
import { sumLines, mainRate, inputTaxCents, transactionLines, allocateGross, type TaxLine } from "@/lib/tax-lines";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/lib/app-state";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  useCategories,
  useInvalidateFinance,
  useSettings,
  logAudit,
  type PaymentStatus,
  type Transaction,
  type TxType,
} from "@/lib/finance";
import {
  formatEur,
  centsToInput,
  parseAmountToCents,
  taxFromNet,
} from "@/lib/money";

export interface TransactionPrefill {
  counterparty?: string | undefined;
  invoice_number?: string | undefined;
  description?: string | undefined;
  invoice_date?: string | undefined;
  service_date?: string | undefined;
  net_cents?: number | undefined;
  tax_rate?: number | undefined;
  category_id?: string | undefined;
  documentId?: string | undefined;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TxType;
  transaction?: Transaction | null;
  prefill?: TransactionPrefill | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function TransactionDialog({ open, onOpenChange, type, transaction, prefill }: Props) {
  const { fiscalYear } = useAppState();
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const invalidate = useInvalidateFinance();

  const rates = settings?.tax_rates?.length ? settings.tax_rates : [19, 7, 0];
  const defaultRate = settings?.default_tax_rate ?? 19;

  const [counterparty, setCounterparty] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [serviceDate, setServiceDate] = useState("");
  const [status, setStatus] = useState<PaymentStatus>(type === "income" ? "open" : "paid");
  const [paymentDate, setPaymentDate] = useState("");
  const [lines, setLines] = useState<TaxLine[]>([]);
  const [tip, setTip] = useState(0);
  const [inputPercent, setInputPercent] = useState(100);
  const [bewirtung, setBewirtung] = useState<Record<string, unknown> | null>(null);
  const [eurGross, setEurGross] = useState("");
  const [deductible, setDeductible] = useState<"yes" | "no" | "partial">("yes");
  const [deductiblePercent, setDeductiblePercent] = useState(100);
  const [paymentMethod, setPaymentMethod] = useState(settings?.default_payment_method ?? "bank");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const source = transaction;
    setCounterparty(source?.counterparty ?? prefill?.counterparty ?? "");
    setInvoiceNumber(source?.invoice_number ?? prefill?.invoice_number ?? "");
    setDescription(source?.description ?? prefill?.description ?? "");
    setCategoryId(source?.category_id ?? prefill?.category_id ?? "none");
    setInvoiceDate(source?.invoice_date ?? prefill?.invoice_date ?? todayIso());
    setServiceDate(source?.service_date ?? prefill?.service_date ?? "");
    setStatus(source?.payment_status ?? (type === "income" ? "open" : "paid"));
    setPaymentDate(source?.payment_date ?? "");
    setLines(source ? transactionLines(source) : [{ rate: prefill?.tax_rate ?? defaultRate, net_cents: prefill?.net_cents ?? 0, tax_cents: taxFromNet(prefill?.net_cents ?? 0, prefill?.tax_rate ?? defaultRate) }]);
    setTip(source?.tip_cents ?? 0);
    setInputPercent(source?.input_tax_percent ?? 100);
    setBewirtung(source?.bewirtung ?? null);
    setEurGross(source?.currency !== "EUR" && source?.gross_cents ? centsToInput(source.gross_cents) : "");
    setDeductible(source?.deductible ?? "yes");
    setDeductiblePercent(source?.deductible_percent ?? 100);
    setPaymentMethod(source?.payment_method ?? settings?.default_payment_method ?? "bank");
    setNotes(source?.notes ?? "");
  }, [open, transaction, prefill, type, defaultRate, settings?.default_payment_method]);

  const amounts = sumLines(lines, type === "expense" ? tip : 0);
  const isBewirtung = type === "expense" && (categoryId === "bewirtung-new" || categories.find(c => c.id === categoryId)?.name === "Bewirtung");
  const result = isBewirtung ? bewirtungResult(lines, tip, bewirtung?.["art"], counterparty) : null;
  const businessPercent = result?.berechnet ? result.anteil_prozent : deductiblePercent;
  const businessDeductible = result?.berechnet ? (result.anteil_prozent === 70 ? "partial" : "yes") : deductible;
  const savedBewirtung = isBewirtung ? { ...bewirtung, ...result, anlass: bewirtung?.["anlass"] ?? "", teilnehmer: bewirtung?.["teilnehmer"] ?? [], ort: bewirtung?.["ort"] ?? counterparty, regel_version: "1.0" } : null;

  const relevantCategories = categories.filter((c) => c.type === type && c.active);

  async function handleSave() {
    if (!counterparty.trim()) {
      toast.error(type === "income" ? "Bitte Kunde angeben." : "Bitte Lieferant angeben.");
      return;
    }
    if (amounts.net <= 0) {
      toast.error("Bitte einen Betrag größer als 0 eingeben.");
      return;
    }

    const deductibleTax = inputTaxCents(type, amounts.tax, isBewirtung ? 100 : inputPercent);

    let finalCategoryId = categoryId;
    if (categoryId === "bewirtung-new") {
      const { data, error } = await supabase.from("categories").insert({ name: "Bewirtung", type: "expense" }).select("id").single();
      if (error) { toast.error(error.message); return; }
      finalCategoryId = data.id;
    }
    const payload = {
      type,
      counterparty: counterparty.trim(),
      invoice_number: invoiceNumber.trim() || null,
      description: description.trim(),
      category_id: finalCategoryId === "none" ? null : finalCategoryId,
      invoice_date: invoiceDate,
      service_date: serviceDate || null,
      payment_status: status,
      payment_date: status === "paid" ? paymentDate || invoiceDate : paymentDate || null,
      net_cents: amounts.net,
      tax_rate: mainRate(lines),
      tax_lines: lines,
      tip_cents: type === "expense" ? tip : 0,
      input_tax_percent: isBewirtung ? 100 : inputPercent,
      bewirtung: savedBewirtung as never,
      tax_cents: amounts.tax,
      gross_cents: amounts.gross,
      deductible: type === "expense" ? businessDeductible : "yes",
      deductible_percent: type === "expense" ? businessPercent : 100,
      deductible_tax_cents: deductibleTax,
      payment_method: paymentMethod,
      notes: notes.trim() || null,
      fiscal_year: Number((status === "paid" ? paymentDate || invoiceDate : paymentDate || invoiceDate).slice(0, 4)) || fiscalYear,
      is_demo: transaction?.is_demo ?? settings?.test_mode ?? true,
    };

    if (transaction && transaction.booking_status !== "entwurf") {
      toast.error("Festgeschriebene Buchungen können nicht geändert werden – bitte stornieren.");
      return;
    }

    setSaving(true);
    try {
      if (transaction) {
        const { error } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", transaction.id);
        if (error) throw error;
        const old: Record<string, unknown> = {};
        const changed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(payload)) {
          const before = (transaction as unknown as Record<string, unknown>)[k];
          if (JSON.stringify(before ?? null) !== JSON.stringify(v ?? null)) {
            old[k] = before ?? null;
            changed[k] = v;
          }
        }
        if (Object.keys(changed).length) {
          await logAudit({
            entity_type: "transaction",
            entity_id: transaction.id,
            action: "geaendert",
            old_data: old,
            new_data: changed,
          });
        }
        toast.success("Entwurf aktualisiert.");
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert({ ...payload, booking_status: "entwurf" })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit({
          entity_type: "transaction",
          entity_id: data.id,
          action: "angelegt",
          new_data: payload,
          note: "Manuell erfasst",
        });
        if (prefill?.documentId && data?.id) {
          await supabase
            .from("documents")
            .update({ transaction_id: data.id })
            .eq("id", prefill.documentId);
          await logAudit({
            entity_type: "document",
            entity_id: prefill.documentId,
            action: "verknuepft",
            new_data: { transaction_id: data.id },
          });
        }
        toast.success("Als Entwurf gespeichert – in der Prüfliste freigeben.");
      }
      invalidate();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Buchung bearbeiten" : type === "income" ? "Neue Einnahme" : "Neue Ausgabe"}
          </DialogTitle>
          <DialogDescription>
            Beträge werden auf den Cent genau gespeichert. Steuer wird automatisch berechnet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>{type === "income" ? "Kunde" : "Lieferant"}</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Rechnungsnummer</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label>Beschreibung</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ohne Kategorie</SelectItem>
                {type === "expense" && !categories.some(c => c.type === "expense" && c.name === "Bewirtung") && <SelectItem value="bewirtung-new">Bewirtung</SelectItem>}
                {relevantCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Zahlungsart</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Rechnungsdatum</Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Leistungsdatum (optional)</Label>
            <Input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Zahlungsdatum</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2"><TaxLinesEditor lines={lines} tip={tip} rates={rates} expense={type === "expense"} onChange={(l, t) => { setLines(l); setTip(t); }} /></div>
          {transaction && transaction.currency !== "EUR" && <label className="grid gap-1 text-sm sm:col-span-2">EUR-Betrag laut Bankabbuchung (brutto)<Input value={eurGross} inputMode="decimal" onChange={e => { setEurGross(e.target.value); const base = transaction.gross_cents ? transactionLines(transaction) : [{ rate: transaction.tax_rate, net_cents: transaction.original_net_cents ?? 0, tax_cents: transaction.original_tax_cents ?? 0 }]; const c = allocateGross(base, transaction.tip_cents ?? 0, parseAmountToCents(e.target.value)); setLines(c.lines); setTip(c.tip); }} /></label>}
          {isBewirtung && <div className="sm:col-span-2"><BewirtungEditor value={bewirtung} lines={lines} tip={tip} supplier={counterparty} onChange={setBewirtung} /></div>}
          {type === "expense" ? (
            <>
              <div className="grid gap-2">
                <Label>Abzugsfähig</Label>
                <Select
                  value={businessDeductible}
                  onValueChange={(v) => { setDeductible(v as "yes" | "no" | "partial"); setInputPercent(isBewirtung ? 100 : v === "partial" ? deductiblePercent : v === "no" ? 0 : 100); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Vollständig</SelectItem>
                    <SelectItem value="partial">Teilweise</SelectItem>
                    <SelectItem value="no">Nein</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {businessDeductible === "partial" ? (
                <div className="grid gap-2">
                  <Label>Betriebsausgabe abziehbar %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={businessPercent}
                    disabled={isBewirtung}
                    onChange={(e) => setDeductiblePercent(Number(e.target.value))}
                  />
                </div>
              ) : null}
              <div className="grid gap-2"><Label>Vorsteuer abziehbar %</Label><Input type="number" min={0} max={100} value={isBewirtung ? 100 : inputPercent} disabled={isBewirtung} onChange={e => setInputPercent(Number(e.target.value))} /></div>
            </>
          ) : null}

          <div className="grid gap-2 sm:col-span-2">
            <Label>Notiz</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="glass mt-2 grid grid-cols-3 gap-3 p-4 text-center">
          <div>
            <p className="label-caps">Netto</p>
            <p className="num mt-1 font-semibold">{formatEur(amounts.net)}</p>
          </div>
          <div>
            <p className="label-caps">Steuer</p>
            <p className="num mt-1 font-semibold">{formatEur(amounts.tax)}</p>
          </div>
          <div>
            <p className="label-caps">Brutto</p>
            <p className="num mt-1 font-semibold">{formatEur(amounts.gross)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
