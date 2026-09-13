import type { Category, Transaction } from "@/lib/finance";
import { centsToInput } from "@/lib/money";

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
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  download(filename, csv, "text/csv");
}
