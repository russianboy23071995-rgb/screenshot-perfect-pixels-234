import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { centsToInput, formatEur, netFromGross, parseAmountToCents, taxFromNet } from "@/lib/money";
import { sumLines, type TaxLine } from "@/lib/tax-lines";

export function TaxLinesEditor({ lines, tip, rates, expense, onChange }: { lines: TaxLine[]; tip: number; rates: number[]; expense: boolean; onChange: (lines: TaxLine[], tip: number) => void }) {
  const sums = sumLines(lines, tip);
  function edit(i: number, key: "rate" | "net" | "tax" | "gross", value: number) {
    onChange(lines.map((l, j) => {
      if (i !== j) return l;
      if (key === "rate") return { ...l, rate: value, tax_cents: taxFromNet(l.net_cents, value) };
      if (key === "net") return { ...l, net_cents: value, tax_cents: taxFromNet(value, l.rate) };
      if (key === "tax") return { ...l, tax_cents: value };
      const net = netFromGross(value, l.rate);
      return { ...l, net_cents: net, tax_cents: value - net };
    }), tip);
  }
  return <div className="space-y-3">
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Satz", "Netto", "USt", "Brutto", ""].map((s, i) => <th className="pb-2 text-left font-medium" key={i}>{s}</th>)}</tr></thead><tbody>
      {lines.map((l, i) => <tr key={i}>
        <td className="min-w-20 pr-2 pb-2"><Select value={String(l.rate)} onValueChange={v => edit(i, "rate", Number(v))}><SelectTrigger aria-label={`Steuersatz ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...rates, l.rate])].map(r => <SelectItem key={r} value={String(r)}>{r} %</SelectItem>)}</SelectContent></Select></td>
        {(["net", "tax", "gross"] as const).map(k => <td key={k} className="min-w-24 pr-2 pb-2"><Input aria-label={`${k === "net" ? "Netto" : k === "tax" ? "USt" : "Brutto"} Zeile ${i + 1}`} inputMode="decimal" key={`${i}-${k}-${k === "net" ? l.net_cents : k === "tax" ? l.tax_cents : l.net_cents + l.tax_cents}`} defaultValue={centsToInput(k === "net" ? l.net_cents : k === "tax" ? l.tax_cents : l.net_cents + l.tax_cents)} onBlur={e => edit(i, k, parseAmountToCents(e.target.value))} /></td>)}
        <td className="pb-2"><Button type="button" variant="ghost" size="icon" title="Steuerzeile entfernen" disabled={lines.length < 2} onClick={() => onChange(lines.filter((_, j) => i !== j), tip)}><Trash2 className="size-4" /></Button></td>
      </tr>)}
    </tbody></table></div>
    <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, { rate: rates.find(r => !lines.some(l => l.rate === r)) ?? 0, net_cents: 0, tax_cents: 0 }], tip)}><Plus className="mr-2 size-4" />Steuersatz</Button>
    {expense && <label className="grid gap-1 text-sm">Trinkgeld (ohne USt)<Input aria-label="Trinkgeld" inputMode="decimal" key={tip} defaultValue={centsToInput(tip)} onBlur={e => onChange(lines, parseAmountToCents(e.target.value))} /></label>}
    <div className="grid grid-cols-3 gap-2 border-t pt-3 text-sm">{[["Netto", sums.net], ["USt", sums.tax], ["Brutto", sums.gross]].map(([label, v]) => <div key={label}><p className="text-muted-foreground">{label}</p><p className="num font-semibold">{formatEur(Number(v))}</p></div>)}</div>
  </div>;
}