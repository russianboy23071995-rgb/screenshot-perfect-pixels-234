import { rundeBruch } from "./bewirtung";

export type TaxLine = { rate: number; net_cents: number; tax_cents: number };
export function sumLines(lines: TaxLine[], tipCents = 0) {
  const net = lines.reduce((s, l) => s + l.net_cents, tipCents);
  const tax = lines.reduce((s, l) => s + l.tax_cents, 0);
  return { net, tax, gross: net + tax };
}
export function mainRate(lines: TaxLine[]): number {
  return [...lines].sort((a, b) => b.net_cents - a.net_cents || b.rate - a.rate)[0]?.rate ?? 0;
}
export function inputTaxCents(type: string, taxCents: number, inputTaxPercent: number): number {
  return type === "expense" ? rundeBruch(taxCents * inputTaxPercent, 100) : 0;
}
export function deductibleExpenseCents(t: { net_cents: number; deductible: string; deductible_percent: number }): number {
  return t.deductible === "no" ? 0 : t.deductible === "partial" ? rundeBruch(t.net_cents * t.deductible_percent, 100) : t.net_cents;
}
export function transactionLines(t: { tax_lines?: unknown; tax_rate: number; net_cents: number; tax_cents: number; tip_cents?: number }): TaxLine[] {
  return Array.isArray(t.tax_lines) && t.tax_lines.length ? t.tax_lines as TaxLine[] : [{ rate: t.tax_rate, net_cents: t.net_cents - (t.tip_cents ?? 0), tax_cents: t.tax_cents }];
}
export function extractedLines(e: Record<string, unknown>, net: number, tax: number, tip: number, rate: number) {
  const lines: TaxLine[] = [];
  if (Array.isArray(e.steuersaetze)) for (const v of e.steuersaetze) {
    if (!v || typeof v !== "object") continue;
    const l = v as Record<string, unknown>;
    if (typeof l.satz === "number" && typeof l.netto_cents === "number" && typeof l.steuer_cents === "number")
      lines.push({ rate: l.satz, net_cents: Math.round(l.netto_cents), tax_cents: Math.round(l.steuer_cents) });
  }
  const sum = sumLines(lines, tip);
  const valid = lines.length > 0 && sum.net === net && sum.tax === tax;
  return { lines: valid ? lines : [{ rate, net_cents: net - tip, tax_cents: tax }], valid };
}
export function allocateGross(lines: TaxLine[], tip: number, target: number) {
  const total = sumLines(lines, tip).gross;
  if (!total) return { lines: [{ rate: mainRate(lines), net_cents: target, tax_cents: 0 }], tip: 0 };
  const scaled = lines.map(l => ({ rate: l.rate, net_cents: rundeBruch(l.net_cents * target, total), tax_cents: rundeBruch(l.tax_cents * target, total) }));
  const scaledTip = rundeBruch(tip * target, total);
  const largest = scaled.reduce((idx, l, i) => Math.abs(l.net_cents + l.tax_cents) > Math.abs((scaled[idx]?.net_cents ?? 0) + (scaled[idx]?.tax_cents ?? 0)) ? i : idx, 0);
  const row = scaled[largest];
  if (row) row.net_cents += target - sumLines(scaled, scaledTip).gross;
  return { lines: scaled, tip: scaledTip };
}
export function bewirtungMissing(b: Record<string, unknown> | null, invoiceGross: number): string[] {
  const m: string[] = [];
  if (b?.art !== "geschaeftlich" && b?.art !== "mitarbeiter") m.push("Bewirtungsart");
  if (typeof b?.anlass !== "string" || !b.anlass.trim()) m.push("Bewirtungsanlass");
  const participants = Array.isArray(b?.teilnehmer) ? b.teilnehmer.filter(v => typeof v === "string" && v.trim()) : typeof b?.teilnehmer === "string" ? b.teilnehmer.split("\n").filter(v => v.trim()) : [];
  if (!participants.length) m.push("Teilnehmer");
  if (invoiceGross > 25000 && b?.formal_bestaetigt !== true) m.push("vollständige Rechnungsangaben bestätigt");
  return m;
}