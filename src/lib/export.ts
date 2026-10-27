import type { Category, Transaction } from "@/lib/finance";
import { centsToInput } from "@/lib/money";
import { deductibleExpenseCents, transactionLines } from "@/lib/tax-lines";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(
  transactions: Transaction[],
  categories: Category[],
  filename: string,
) {
  const header = [
    "Datum",
    "Typ",
    "Belegnummer",
    "Partner",
    "Beschreibung",
    "Kategorie",
    "Netto",
    "Steuersatz",
    "Steuer",
    "Brutto",
    "Status",
    "Zahlungsart",
    "Netto 19 %", "USt 19 %", "Netto 7 %", "USt 7 %", "Netto 0 %", "Trinkgeld", "Vorsteuer abziehbar", "Betriebsausgabe abziehbar", "nicht abziehbar", "Bewirtung Anlass", "Bewirtung Teilnehmer",
  ];
  const rows = transactions.map((t) => [
    t.invoice_date,
    t.type === "income" ? "Einnahme" : "Ausgabe",
    t.invoice_number ?? "",
    t.counterparty,
    t.description,
    categories.find((c) => c.id === t.category_id)?.name ?? "",
    centsToInput(t.net_cents),
    String(t.tax_rate),
    centsToInput(t.tax_cents),
    centsToInput(t.gross_cents),
    t.payment_status,
    t.payment_method,
    ...([19, 7] as const).flatMap(rate => ["net_cents", "tax_cents"].map(key => centsToInput(transactionLines(t).filter(l => l.rate === rate).reduce((s, l) => s + l[key as "net_cents" | "tax_cents"], 0)))),
    centsToInput(transactionLines(t).filter(l => l.rate === 0).reduce((s, l) => s + l.net_cents, 0)),
    centsToInput(t.tip_cents ?? 0),
    centsToInput(t.deductible_tax_cents),
    centsToInput(t.type === "expense" ? deductibleExpenseCents(t) : 0),
    centsToInput(t.type === "expense" ? t.net_cents - deductibleExpenseCents(t) : 0),
    t.bewirtung?.anlass ?? "",
    Array.isArray(t.bewirtung?.teilnehmer) ? t.bewirtung.teilnehmer.join("; ") : t.bewirtung?.teilnehmer ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  download(filename, csv, "text/csv");
}
