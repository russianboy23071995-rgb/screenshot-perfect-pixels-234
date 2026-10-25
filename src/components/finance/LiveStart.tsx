import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAllTransactions, useDocuments, useInvalidateFinance, useSettings } from "@/lib/finance";
import { canStartLive } from "@/lib/test-mode";
import { deleteTestData } from "@/lib/test-mode.functions";

export function LiveStart() {
  const { data: settings } = useSettings();
  const { data: documents, isSuccess: docsReady } = useDocuments();
  const { data: transactions, isSuccess: txReady } = useAllTransactions();
  const invalidate = useInvalidateFinance();
  const runDelete = useServerFn(deleteTestData);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ files: number; documents: number; transactions: number } | null>(null);
  const docCount = documents?.filter((d) => d.is_demo).length ?? 0;
  const txCount = transactions?.filter((t) => t.is_demo).length ?? 0;
  const ready = docsReady && txReady && !!settings;

  async function remove() {
    setBusy(true);
    try {
      setResult(await runDelete({ data: { confirmation } }));
      setOpen(false); setConfirmation(""); invalidate();
      toast.success("Testdaten gelöscht.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  async function startLive() {
    if (!settings || !ready || !canStartLive(docCount, txCount)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("settings").update({ test_mode: false }).eq("id", settings.id);
      if (error) throw error;
      invalidate(); toast.success("Live-Betrieb gestartet. Der Testmodus bleibt dauerhaft ausgeschaltet.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Live-Start fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="mb-4 text-lg font-semibold">Live-Start</h2>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Label htmlFor="test-mode">Testmodus</Label>
          <p className="text-sm text-muted-foreground">{settings?.test_mode
            ? `${docCount} Testbelege · ${txCount} Testbuchungen. Vor dem Live-Start alle Testdaten löschen.`
            : "Live-Betrieb aktiv. Der Testmodus kann nicht erneut eingeschaltet werden."}</p>
          {settings?.test_mode && <p className="text-xs text-muted-foreground">Das Ausschalten ist endgültig. Anbieterprofile und Protokoll bleiben erhalten.</p>}
        </div>
        <Switch id="test-mode" checked={settings?.test_mode ?? false}
          disabled={busy || !ready || !settings?.test_mode || !canStartLive(docCount, txCount)}
          onCheckedChange={(checked) => { if (!checked) void startLive(); }} />
      </div>
      {settings?.test_mode && <Button variant="destructive" className="mt-4" disabled={busy || !ready || canStartLive(docCount, txCount)}
        onClick={() => { setConfirmation(""); setOpen(true); }}><Trash2 className="mr-2 size-4" />Testdaten löschen</Button>}
      {result && <p role="status" className="mt-4 text-sm font-medium">Gelöscht: {result.files} Dateien · {result.documents} Belege · {result.transactions} Buchungen.</p>}
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Testdaten löschen</DialogTitle>
            <DialogDescription>Alle Testdateien, Testbelege und Testbuchungen aller Jahre werden endgültig gelöscht. Anbieterprofile und Protokoll bleiben erhalten.</DialogDescription></DialogHeader>
          <Label htmlFor="delete-confirmation">Zur Bestätigung LÖSCHEN eingeben</Label>
          <Input id="delete-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" disabled={busy} />
          <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" disabled={busy || confirmation !== "LÖSCHEN"} onClick={() => void remove()}>{busy ? "Löschen …" : "Endgültig löschen"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}