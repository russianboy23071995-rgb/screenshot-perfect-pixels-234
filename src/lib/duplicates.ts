import type { DocumentRow, Transaction } from "@/lib/finance";

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function daysApart(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Number.POSITIVE_INFINITY;
  return Math.abs(t1 - t2) / 86_400_000;
}

export interface DuplicateCandidate {
  counterparty?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  gross_cents?: number | null;
}

export interface DuplicateMatch {
  transaction: Transaction;
  reason: string;
  score: "high" | "medium";
}

/**
 * Findet mögliche Doppelerfassungen zu einem erkannten Beleg.
 * Hohe Sicherheit: gleiche Belegnummer beim gleichen Partner, oder gleicher
 * Bruttobetrag beim gleichen Partner innerhalb von 10 Tagen.
 */
export function findDuplicateTransactions(
  transactions: Transaction[],
  candidate: DuplicateCandidate,
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const t of transactions) {
    const samePartner = candidate.counterparty ? similar(t.counterparty, candidate.counterparty) : false;
    const sameNumber =
      !!candidate.invoice_number &&
      !!t.invoice_number &&
      normalize(t.invoice_number) === normalize(candidate.invoice_number);
    const sameGross =
      candidate.gross_cents != null && candidate.gross_cents > 0 && t.gross_cents === candidate.gross_cents;
    const gap = daysApart(t.invoice_date, candidate.invoice_date);

    if (sameNumber && (samePartner || sameGross)) {
      matches.push({ transaction: t, reason: "Gleiche Belegnummer", score: "high" });
      continue;
    }
    if (samePartner && sameGross && gap <= 10) {
      matches.push({ transaction: t, reason: "Gleicher Partner und Betrag", score: "high" });
      continue;
    }
    if (sameNumber) {
      matches.push({ transaction: t, reason: "Belegnummer bereits vorhanden", score: "medium" });
      continue;
    }
    if (samePartner && sameGross) {
      matches.push({ transaction: t, reason: "Betrag bereits beim gleichen Partner erfasst", score: "medium" });
    }
  }

  return matches
    .sort((a, b) => (a.score === b.score ? 0 : a.score === "high" ? -1 : 1))
    .slice(0, 4);
}

/** Findet Belege, die derselbe Datei-Upload sein könnten. */
export function findDuplicateDocuments(
  documents: DocumentRow[],
  file: { name: string },
  ignoreId?: string | null,
): DocumentRow[] {
  return documents
    .filter((d) => d.id !== ignoreId && similar(d.original_filename, file.name))
    .slice(0, 3);
}
