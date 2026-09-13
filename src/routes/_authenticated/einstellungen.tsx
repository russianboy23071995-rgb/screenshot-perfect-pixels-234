import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { GlassCard, SectionTitle } from "@/components/finance/GlassCard";
import { Button } from "@/components/ui/button";
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
import { useAppState } from "@/lib/app-state";
import {
  useDeleteDemoData,
  useInvalidateFinance,
  useSettings,
  useTransactions,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen · Finanz-Cockpit" },
      {
        name: "description",
        content:
          "Firmendaten, Steuersätze, Voranmeldungszeitraum, Zahlungsarten und Demo-Daten verwalten.",
      },
      { property: "og:title", content: "Einstellungen · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Firmendaten, Steuersätze und Voranmeldungen konfigurieren.",
      },
    ],
  }),
  component: EinstellungenPage,
});

function EinstellungenPage() {
  const { fiscalYear } = useAppState();
  const { data: settings } = useSettings();
  const { data: transactions = [] } = useTransactions(fiscalYear);
  const invalidate = useInvalidateFinance();
  const deleteDemo = useDeleteDemoData();

  const [form, setForm] = useState({
    company_name: "",
    owner_name: "",
    address: "",
    tax_number: "",
    vat_id: "",
    vat_liable: true,
    default_tax_rate: 19,
    advance_period: "quarterly" as "monthly" | "quarterly",
    permanent_extension: false,
    default_payment_method: "bank",
    bank_account: "",
    filename_scheme: "{datum}_{partner}_{nummer}_{brutto}",
    local_folder: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      company_name: settings.company_name,
      owner_name: settings.owner_name,
      address: settings.address,
      tax_number: settings.tax_number,
      vat_id: settings.vat_id,
      vat_liable: settings.vat_liable,
      default_tax_rate: settings.default_tax_rate,
      advance_period: settings.advance_period,
      permanent_extension: settings.permanent_extension,
      default_payment_method: settings.default_payment_method,
      bank_account: settings.bank_account,
      filename_scheme: settings.filename_scheme,
      local_folder: settings.local_folder,
    });
  }, [settings]);

  const demoCount = transactions.filter((t) => t.is_demo).length;

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from("settings").update(form).eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Einstellungen gespeichert.");
    invalidate();
  }

  return (
    <AppShell
      title="Einstellungen"
      subtitle="Firmendaten, Steuern und Ablage"
      actions={
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Speichern …" : "Speichern"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <SectionTitle title="Firma" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Firmenname</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Inhaber</Label>
              <Input
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Adresse</Label>
              <Textarea
                rows={3}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Steuernummer</Label>
                <Input
                  value={form.tax_number}
                  onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>USt-IdNr.</Label>
                <Input
                  value={form.vat_id}
                  onChange={(e) => setForm({ ...form, vat_id: e.target.value })}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Steuern" />
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Umsatzsteuerpflichtig</Label>
                <p className="text-xs text-muted-foreground">
                  Bei Kleinunternehmerregelung deaktivieren.
                </p>
              </div>
              <Switch
                checked={form.vat_liable}
                onCheckedChange={(checked) => setForm({ ...form, vat_liable: checked })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Standard-Steuersatz</Label>
              <Select
                value={String(form.default_tax_rate)}
                onValueChange={(value) => setForm({ ...form, default_tax_rate: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[19, 7, 0].map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>
                      {rate} %
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Voranmeldung</Label>
              <Select
                value={form.advance_period}
                onValueChange={(value) =>
                  setForm({ ...form, advance_period: value as "monthly" | "quarterly" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                  <SelectItem value="quarterly">Quartalsweise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Dauerfristverlängerung</Label>
                <p className="text-xs text-muted-foreground">Verschiebt die Fristen um 1 Monat.</p>
              </div>
              <Switch
                checked={form.permanent_extension}
                onCheckedChange={(checked) => setForm({ ...form, permanent_extension: checked })}
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Zahlungen & Ablage" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Standard-Zahlungsart</Label>
              <Select
                value={form.default_payment_method}
                onValueChange={(value) => setForm({ ...form, default_payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Überweisung</SelectItem>
                  <SelectItem value="card">Karte</SelectItem>
                  <SelectItem value="cash">Bar</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="direct_debit">Lastschrift</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Bankverbindung</Label>
              <Input
                value={form.bank_account}
                onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                placeholder="IBAN"
              />
            </div>
            <div className="grid gap-2">
              <Label>Dateinamen-Schema</Label>
              <Input
                value={form.filename_scheme}
                onChange={(e) => setForm({ ...form, filename_scheme: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Platzhalter: {"{datum}"}, {"{partner}"}, {"{nummer}"}, {"{brutto}"}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Lokaler Ordner (für spätere Synchronisation)</Label>
              <Input
                value={form.local_folder}
                onChange={(e) => setForm({ ...form, local_folder: e.target.value })}
                placeholder="z. B. /Finanzen/Belege"
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Demo-Daten" hint="Beispielbuchungen zum Ausprobieren" />
          <p className="text-sm text-muted-foreground">
            Aktuell sind {demoCount} Demo-Buchungen im Geschäftsjahr {fiscalYear} vorhanden. Beim
            Löschen bleiben alle selbst erfassten Buchungen erhalten.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            disabled={deleteDemo.isPending}
            onClick={() =>
              deleteDemo.mutate(undefined, {
                onSuccess: () => toast.success("Demo-Daten gelöscht."),
                onError: (error) =>
                  toast.error(error instanceof Error ? error.message : "Löschen fehlgeschlagen."),
              })
            }
          >
            {deleteDemo.isPending ? "Löschen …" : "Demo-Daten löschen"}
          </Button>
        </GlassCard>
      </div>
    </AppShell>
  );
}
