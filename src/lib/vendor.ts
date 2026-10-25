/** Normalisierter Anbieter-Schlüssel: klein, ohne Rechtsform-Zusätze und Satzzeichen. */
const LEGAL_FORMS = [
  "gmbh & co kg",
  "gmbh & co. kg",
  "limited",
  "ltd",
  "gmbh",
  "ug",
  "ag",
  "kg",
  "ohg",
  "gbr",
  "e k",
  "ek",
  "inc",
  "llc",
  "corp",
  "corporation",
  "co",
  "plc",
  "sarl",
  "sas",
  "bv",
  "srl",
  "sa",
  "ab",
  "oy",
  "as",
  "pty",
];

export function counterpartyKey(name: string | null | undefined): string {
  if (!name) return "";
  let s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}&\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const form of LEGAL_FORMS) {
      const f = form.replace(/[^\p{L}\p{N}&\s]/gu, " ").replace(/\s+/g, " ");
      if (s.endsWith(` ${f}`)) {
        s = s.slice(0, -f.length - 1).trim();
        changed = true;
      }
    }
  }
  return s.replace(/&/g, "").replace(/\s+/g, " ").trim();
}

/** Rechnungsnummer für Vergleiche: klein, ohne Leerzeichen. */
export function invoiceKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}
