import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { berechneBewirtung, type BewirtungArt } from "@/lib/bewirtung";
import { formatEur } from "@/lib/money";
import { sumLines, type TaxLine } from "@/lib/tax-lines";

export function bewirtungResult(lines: TaxLine[], tip: number, art: unknown, supplier: string) {
  return berechneBewirtung({ steuersaetze: lines.map(l => ({ satz: l.rate, netto_cents: l.net_cents, steuer_cents: l.tax_cents })), trinkgeld_ausgewiesen_cents: tip, art: (art ?? "geschaeftlich") as BewirtungArt, lieferant: supplier });
}
export function BewirtungEditor({ value, lines, tip, supplier, onChange }: { value: Record<string, unknown> | null; lines: TaxLine[]; tip: number; supplier: string; onChange: (b: Record<string, unknown>) => void }) {
  const b = value ?? {};
  const result = bewirtungResult(lines, tip, b.art, supplier);
  const update = (key: string, v: unknown) => onChange({ ...b, ...result, art: b.art ?? "geschaeftlich", [key]: v, regel_version: "1.0" });
  const participants = Array.isArray(b.teilnehmer) ? b.teilnehmer.join("\n") : typeof b.teilnehmer === "string" ? b.teilnehmer : "";
  const warnings = [...(result.hinweise ?? []), ...(["hinweise", "eigenbeleg_fehlt", "formale_hinweise"].flatMap(k => Array.isArray(b[k]) ? b[k] as unknown[] : b[k] ? [b[k]] : []))];
  return <section className="space-y-3 border-t pt-4">
    <h3 className="font-semibold">Bewirtung</h3>
    <label className="grid gap-1 text-sm">Art<Select value={String(b.art ?? "geschaeftlich")} onValueChange={v => update("art", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="geschaeftlich">Geschäftlich – 70 %</SelectItem><SelectItem value="mitarbeiter">Nur eigene Mitarbeiter – 100 %</SelectItem><SelectItem value="allein">Allein – keine Bewirtung</SelectItem><SelectItem value="privat">Privat – keine Bewirtung</SelectItem></SelectContent></Select></label>
    <label className="grid gap-1 text-sm">Anlass<Input value={typeof b.anlass === "string" ? b.anlass : ""} onChange={e => update("anlass", e.target.value)} /></label>
    <label className="grid gap-1 text-sm">Teilnehmer<Textarea rows={3} value={participants} onChange={e => update("teilnehmer", e.target.value.split("\n"))} /></label>
    <label className="grid gap-1 text-sm">Ort<Input value={typeof b.ort === "string" ? b.ort : supplier} onChange={e => update("ort", e.target.value)} /></label>
    {result.berechnet ? <dl className="grid grid-cols-2 gap-2 text-sm">{[["Vorsteuer (100 %)", result.vorsteuer_cents], ["Betriebsausgabe", result.betriebsausgabe_cents], ["Nicht abziehbar", result.nicht_abziehbar_cents], ["Gesamt bezahlt", result.gesamt_bezahlt_cents]].map(([label, v]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="num font-semibold">{formatEur(Number(v))}</dd></div>)}<div>Kontrolle: {result.kontrolle_ok ? "OK" : "Bitte prüfen"}</div></dl> : <p className="text-warning-foreground">Keine Bewirtung – bitte klären (ggf. Kategorie ändern)</p>}
    {warnings.length > 0 && <ul className="border border-warning/50 bg-warning/15 p-3 text-xs text-warning-foreground">{warnings.map((w, i) => <li key={i}>{String(w)}</li>)}</ul>}
    {sumLines(lines, 0).gross > 25000 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={b.formal_bestaetigt === true} onCheckedChange={v => update("formal_bestaetigt", v === true)} /><span>Rechnung enthält Name und Anschrift von NOVIKOV | PLAN &amp; MASS, Rechnungsnummer und Steuernr./USt-IdNr. des Restaurants</span></label>}
  </section>;
}