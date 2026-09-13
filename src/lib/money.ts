/**
 * Geldbeträge werden ausschließlich als ganze Cent (integer) gerechnet.
 * Keine Fließkomma-Arithmetik auf Währungswerten.
 */

const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const eurCompact = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEur(cents: number): string {
  return eur.format(cents / 100);
}

export function formatEurShort(cents: number): string {
  return eurCompact.format(cents / 100);
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value)} %`;
}

/** "1.234,56" | "1234.56" -> 123456 */
export function parseAmountToCents(input: string): number {
  const raw = input.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!raw) return 0;
  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function taxFromNet(netCents: number, rate: number): number {
  return Math.round((netCents * rate) / 100);
}

export function grossFromNet(netCents: number, rate: number): number {
  return netCents + taxFromNet(netCents, rate);
}

export function netFromGross(grossCents: number, rate: number): number {
  return Math.round(grossCents / (1 + rate / 100));
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;
