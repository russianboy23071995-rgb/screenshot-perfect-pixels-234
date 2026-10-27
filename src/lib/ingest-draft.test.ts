import { describe, expect, it } from "vitest";
import { draftTip } from "./ingest-draft";
import { extractedLines, sumLines } from "./tax-lines";

const base = { net_cents: 11711, tax_cents: 1239, trinkgeld_ausgewiesen_cents: 1050, tax_rate: 19 };
describe("Entwurf-Trinkgeld", () => {
  it("Bewirtung zu_pruefen -> tip 0, Steuerzeilen netto 11711", () => {
    for (const steuersaetze of [undefined, [{ satz: 19, netto_cents: 3487, steuer_cents: 663 }, { satz: 7, netto_cents: 8224, steuer_cents: 576 }]]) {
      const e = { ...base, steuersaetze, bewirtung: { berechnet: true, status: "zu_pruefen", trinkgeld_cents: 1050 } };
      const tip = draftTip(e);
      expect(tip).toBe(0);
      const { lines } = extractedLines(e, 11711, 1239, tip, 19);
      expect(lines.length).toBe(steuersaetze ? 2 : 1);
      expect(sumLines(lines, tip)).toMatchObject({ net: 11711, tax: 1239 });
    }
  });
  it("berechnet false oder keine Bewirtung -> tip 0", () => {
    expect(draftTip({ ...base, bewirtung: { berechnet: false, status: "ausgelesen", trinkgeld_cents: 1050 } })).toBe(0);
    expect(draftTip(base)).toBe(0);
  });
  it("berechnet und ausgelesen -> Trinkgeld aus Bewirtung", () => {
    expect(draftTip({ ...base, bewirtung: { berechnet: true, status: "ausgelesen", trinkgeld_cents: 1050 } })).toBe(1050);
  });
});
