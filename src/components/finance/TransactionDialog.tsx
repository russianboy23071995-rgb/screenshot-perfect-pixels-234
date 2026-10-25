import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
  centsToInput,
  formatEur,
  grossFromNet,
  netFromGross,
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
  const [amountMode, setAmountMode] = useState<"net" | "gross">("net");
  const [amountInput, setAmountInput] = useState("");
  const [taxRate, setTaxRate] = useState(defaultRate);
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
    setAmountMode("net");
    setAmountInput(
      source ? centsToInput(source.net_cents) : prefill?.net_cents ? centsToInput(prefill.net_cents) : "",
    );
    setTaxRate(source?.tax_rate ?? prefill?.tax_rate ?? defaultRate);
    setDeductible(source?.deductible ?? "yes");
    setDeductiblePercent(source?.deductible_percent ?? 100);
    setPaymentMethod(source?.payment_method ?? settings?.default_payment_method ?? "bank");
    setNotes(source?.notes ?? "");
  }, [open, transaction, prefill, type, defaultRate, settings?.default_payment_method]);

  const amounts = useMemo(() => {
    const entered = parseAmountToCents(amountInput);
    const net = amountMode === "net" ? entered : netFromGross(entered, taxRate);
    const gross = amountMode === "net" ? grossFromNet(entered, taxRate) : entered;
    const tax = gross - net;
    return { net, gross, tax };
  }, [amountInput, amountMode, taxRate]);

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

    const deductibleTax =
      type === "expense"
        ? deductible === "no"
          ? 0
          : deductible === "partial"
            ? Math.round((amounts.tax * deductiblePercent) / 100)
            : amounts.tax
        : 0;

    const payload = {
      type,
      counterparty: counterparty.trim(),
      invoice_number: invoiceNumber.trim() || null,
      description: description.trim(),
      category_id: categoryId === "none" ? null : categoryId,
      invoice_date: invoiceDate,
      service_date: serviceDate || null,
      payment_status: status,
      payment_date: status === "paid" ? paymentDate || invoiceDate : paymentDate || null,
      net_cents: amounts.net,
      tax_rate: taxRate,
      tax_cents: amounts.tax,
      gross_cents: amounts.gross,
      deductible: type === "expense" ? deductible : "yes",
      deductible_percent: type === "expense" && deductible === "partial" ? deductiblePercent : 100,
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
          if (String(before ?? "") !== String(v ?? "")) {
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

          <div className="grid gap-2">
            <Label>Betrag ({amountMode === "net" ? "netto" : "brutto"})</Label>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAmountMode(amountMode === "net" ? "gross" : "net")}
              >
                {amountMode === "net" ? "Netto" : "Brutto"}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Steuersatz</Label>
            <Select value={String(taxRate)} onValueChange={(v) => setTaxRate(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rates.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate} %
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "expense" ? (
            <>
              <div className="grid gap-2">
                <Label>Abzugsfähig</Label>
                <Select
                  value={deductible}
                  onValueChange={(v) => setDeductible(v as "yes" | "no" | "partial")}
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
              {deductible === "partial" ? (
                <div className="grid gap-2">
                  <Label>Anteil in Prozent</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={deductiblePercent}
                    onChange={(e) => setDeductiblePercent(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div />
              )}
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
            <p className="label-caps">Steuer {taxRate} %</p>
            <p className="num mt-1 font-semibold">{formatEur(taxFromNet(amounts.net, taxRate))}</p>
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
