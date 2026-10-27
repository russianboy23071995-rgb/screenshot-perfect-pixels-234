import { describe, expect, it } from "vitest";

import { berechneBewirtung } from "./bewirtung";

// Testfälle A–E aus der Regel BEWIRTUNG-BERECHNUNG.md 1.0 (müssen exakt so herauskommen)
const fallA = {
  steuersaetze: [
    { satz: 7, netto_cents: 8000, steuer_cents: 560 },
    { satz: 19, netto_cents: 2000, steuer_cents: 380 },
  ],
  bezahlt_cents: 11940,
  art: "geschaeftlich" as const,
};

describe("berechneBewirtung", () => {
  it("A: Netto + USt gedruckt, Trinkgeld aus Differenz", () => {
    expect(berechneBewirtung(fallA)).toMatchObject({
      vorsteuer_cents: 940,
      trinkgeld_cents: 1000,
      trinkgeld_quelle: "differenz",
      basis_cents: 11000,
      betriebsausgabe_cents: 7700,
      nicht_abziehbar_cents: 3300,
      gesamt_bezahlt_cents: 11940,
      kontrolle_ok: true,
      status: "ausgelesen",
    });
  });

  it("B: nur Brutto je Satz, kein Trinkgeld", () => {
    expect(
      berechneBewirtung({ steuersaetze: [{ satz: 7, brutto_cents: 4280 }, { satz: 19, brutto_cents: 1190 }], art: "geschaeftlich" }),
    ).toMatchObject({
      steuersaetze: [
        { satz: 7, netto_cents: 4000, steuer_cents: 280, brutto_cents: 4280 },
        { satz: 19, netto_cents: 1000, steuer_cents: 190, brutto_cents: 1190 },
      ],
      vorsteuer_cents: 470,
      basis_cents: 5000,
      betriebsausgabe_cents: 3500,
      nicht_abziehbar_cents: 1500,
      gesamt_bezahlt_cents: 5470,
    });
  });

  it("C: Rundung", () => {
    expect(
      berechneBewirtung({
        steuersaetze: [{ satz: 7, brutto_cents: 3350 }, { satz: 19, brutto_cents: 890 }],
        bezahlt_cents: 4500,
        art: "geschaeftlich",
      }),
    ).toMatchObject({
      netto_summe_cents: 3879,
      vorsteuer_cents: 361,
      rechnung_brutto_cents: 4240,
      trinkgeld_cents: 260,
      basis_cents: 4139,
      betriebsausgabe_cents: 2897,
      nicht_abziehbar_cents: 1242,
      gesamt_bezahlt_cents: 4500,
    });
  });

  it("D: wie A, nur Mitarbeiter", () => {
    expect(berechneBewirtung({ ...fallA, art: "mitarbeiter" })).toMatchObject({
      betriebsausgabe_cents: 11000,
      nicht_abziehbar_cents: 0,
      vorsteuer_cents: 940,
      anteil_prozent: 100,
    });
  });

  it("E: allein gegessen -> keine Berechnung", () => {
    expect(berechneBewirtung({ ...fallA, art: "allein" })).toEqual(
      expect.objectContaining({ berechnet: false, status: "zu_pruefen", hinweise: ["Keine Bewirtung – bitte klaeren"] }),
    );
  });

  it("Art fehlt -> geschäftlich angenommen", () => {
    expect(berechneBewirtung({ ...fallA, art: null })).toMatchObject({ art: "geschaeftlich", art_quelle: "angenommen" });
  });

  it("nur Gesamtbetrag ohne Satzaufteilung -> zu_pruefen", () => {
    expect(berechneBewirtung({ steuersaetze: [], rechnungsbetrag_cents: 5470, art: "geschaeftlich" }).status).toBe("zu_pruefen");
  });

  it("Trinkgeld über 25 % -> zu_pruefen", () => {
    expect(berechneBewirtung({ ...fallA, bezahlt_cents: 14000 }).status).toBe("zu_pruefen");
  });

  it("echter Beleg Coast 07.09.2026 (Trinkgeld-Zeile in der Bon-Summe)", () => {
    expect(
      berechneBewirtung({
        steuersaetze: [
          { satz: 19, netto_cents: 3487, steuer_cents: 663, brutto_cents: 4150 },
          { satz: 7, netto_cents: 8224, steuer_cents: 576, brutto_cents: 8800 },
        ],
        rechnungsbetrag_cents: 14000,
        trinkgeld_ausgewiesen_cents: 1050,
        bezahlt_cents: 14000,
        art: "geschaeftlich",
      }),
    ).toMatchObject({
      vorsteuer_cents: 1239,
      basis_cents: 12761,
      betriebsausgabe_cents: 8933,
      nicht_abziehbar_cents: 3828,
      gesamt_bezahlt_cents: 14000,
      status: "ausgelesen",
    });
  });
});
