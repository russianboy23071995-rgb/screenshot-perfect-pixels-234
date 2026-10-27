/**
 * Bewirtungsbelege nach Regel BEWIRTUNG-BERECHNUNG.md (Version 1.0, Stand 27.10.2026).
 * Identisch mit der Server-Berechnung in n8n (workflows/lib/bewirtung-berechnen.js).
 * Nur ganze Cent, kaufmännisch gerundet. Keine Steuerberatung.
 */

export type BewirtungArt = "geschaeftlich" | "mitarbeiter" | "privat" | "allein";

export interface SteuerZeileEingabe {
  satz: number;
  netto_cents?: number | null;
  steuer_cents?: number | null;
  brutto_cents?: number | null;
}

export interface SteuerZeile {
  satz: number;
  netto_cents: number;
  steuer_cents: number;
  brutto_cents: number;
}

export interface BewirtungEingabe {
  steuersaetze: SteuerZeileEingabe[];
  rechnungsbetrag_cents?: number | null;
  trinkgeld_ausgewiesen_cents?: number | null;
  bezahlt_cents?: number | null;
  art?: BewirtungArt | null;
  datum?: string | null;
  lieferant?: string | null;
  unleserlich?: boolean;
}

export interface BewirtungNichtBerechnet {
  belegart: "bewirtung";
  datum: string | null;
  lieferant: string | null;
  art: "privat" | "allein";
  art_quelle: "nutzer";
  berechnet: false;
  status: "zu_pruefen";
  hinweise: string[];
}

export interface BewirtungErgebnis {
  belegart: "bewirtung";
  datum: string | null;
  lieferant: string | null;
  art: "geschaeftlich" | "mitarbeiter";
  art_quelle: "nutzer" | "angenommen";
  berechnet: true;
  steuersaetze: SteuerZeile[];
  netto_summe_cents: number;
  vorsteuer_cents: number;
  rechnung_brutto_cents: number;
  trinkgeld_cents: number;
  trinkgeld_quelle: "ausgewiesen" | "differenz" | "keins";
  basis_cents: number;
  anteil_prozent: 70 | 100;
  betriebsausgabe_cents: number;
  nicht_abziehbar_cents: number;
  gesamt_bezahlt_cents: number;
  kontrolle_ok: boolean;
  status: "ausgelesen" | "zu_pruefen";
  hinweise: string[];
}

const SAETZE = [0, 7, 19];

/** round(z / n) kaufmännisch (ab ,5 weg von 0), exakt mit ganzen Zahlen. */
export function rundeBruch(z: number, n: number): number {
  const s = Math.sign(z) * Math.sign(n) || 1;
  const za = Math.abs(z);
  const na = Math.abs(n);
  return s * Math.floor((2 * za + na) / (2 * na));
}

const ganz = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export function berechneBewirtung(e: BewirtungEingabe): BewirtungErgebnis | BewirtungNichtBerechnet {
  const hinweise: string[] = [];

  if (e.art === "privat" || e.art === "allein") {
    return {
      belegart: "bewirtung",
      datum: e.datum ?? null,
      lieferant: e.lieferant ?? null,
      art: e.art,
      art_quelle: "nutzer",
      berechnet: false,
      status: "zu_pruefen",
      hinweise: ["Keine Bewirtung – bitte klaeren"],
    };
  }
  const artBekannt = e.art === "geschaeftlich" || e.art === "mitarbeiter";
  const art = artBekannt ? (e.art as "geschaeftlich" | "mitarbeiter") : "geschaeftlich";
  const artQuelle = artBekannt ? "nutzer" : "angenommen";
  const anteilProzent = art === "mitarbeiter" ? 100 : 70;

  // Je Steuersatz netto/steuer/brutto (gedruckte Steuerbeträge haben Vorrang)
  const zeilen: SteuerZeile[] = [];
  for (const z of Array.isArray(e.steuersaetze) ? e.steuersaetze : []) {
    const satz = Number(z.satz);
    let netto = ganz(z.netto_cents);
    let steuer = ganz(z.steuer_cents);
    let brutto = ganz(z.brutto_cents);
    if (!SAETZE.includes(satz)) hinweise.push(`Steuersatz ${z.satz} % nicht zulaessig (nur 0, 7, 19)`);
    if (netto != null && steuer != null) {
      if (brutto != null && Math.abs(netto + steuer - brutto) > 2) {
        hinweise.push(`${satz} %: netto + steuer (${netto + steuer}) passt nicht zu brutto (${brutto})`);
      }
      brutto = netto + steuer;
    } else if (steuer != null && brutto != null) {
      netto = brutto - steuer;
    } else if (brutto != null) {
      netto = rundeBruch(brutto * 100, 100 + satz);
      steuer = brutto - netto;
    } else {
      hinweise.push(`${satz} %: Betraege unvollstaendig – nicht geschaetzt`);
      continue;
    }
    if (Math.abs(steuer - rundeBruch(netto * satz, 100)) > 2) {
      hinweise.push(`${satz} %: Steuer ${steuer} weicht von netto x Satz (${rundeBruch(netto * satz, 100)}) ab`);
    }
    zeilen.push({ satz, netto_cents: netto, steuer_cents: steuer, brutto_cents: brutto });
  }
  if (zeilen.length === 0) hinweise.push("Keine Aufteilung nach Steuersaetzen auf dem Beleg – nicht geschaetzt");
  if (e.unleserlich) hinweise.push("Beleg unleserlich oder Betraege mehrdeutig");

  const nettoSumme = zeilen.reduce((s, z) => s + z.netto_cents, 0);
  const vorsteuer = zeilen.reduce((s, z) => s + z.steuer_cents, 0);
  const rechnungBrutto = nettoSumme + vorsteuer;

  // Trinkgeld: ausgewiesen, sonst Differenz bezahlt - Rechnungsbrutto, sonst 0
  const tAus = ganz(e.trinkgeld_ausgewiesen_cents);
  const bezahlt = ganz(e.bezahlt_cents);
  let trinkgeld = 0;
  let trinkgeldQuelle: BewirtungErgebnis["trinkgeld_quelle"] = "keins";
  if (tAus != null && tAus > 0) {
    trinkgeld = tAus;
    trinkgeldQuelle = "ausgewiesen";
  } else if (bezahlt != null && bezahlt - rechnungBrutto > 0) {
    trinkgeld = bezahlt - rechnungBrutto;
    trinkgeldQuelle = "differenz";
  }
  if (bezahlt != null && zeilen.length > 0 && bezahlt < rechnungBrutto) {
    hinweise.push(`Bezahlt (${bezahlt}) ist kleiner als der Rechnungsbetrag (${rechnungBrutto})`);
  }

  // Gedruckter Rechnungsbetrag (manche Bons enthalten die Trinkgeld-Zeile in der Summe)
  const gedruckt = ganz(e.rechnungsbetrag_cents);
  if (
    gedruckt != null &&
    zeilen.length > 0 &&
    Math.abs(gedruckt - rechnungBrutto) > 2 &&
    !(trinkgeldQuelle === "ausgewiesen" && Math.abs(gedruckt - rechnungBrutto - trinkgeld) <= 2)
  ) {
    hinweise.push(`Summe der Steuersaetze (${rechnungBrutto}) weicht vom Rechnungsbetrag (${gedruckt}) ab`);
  }
  if (rechnungBrutto > 0 && trinkgeld * 100 > rechnungBrutto * 25) {
    hinweise.push(`Trinkgeld ${trinkgeld} ist mehr als 25 % des Rechnungsbetrags`);
  }

  const basis = nettoSumme + trinkgeld;
  const betriebsausgabe = rundeBruch(basis * anteilProzent, 100);
  const nichtAbziehbar = basis - betriebsausgabe;
  const gesamtBezahlt = rechnungBrutto + trinkgeld;
  const kontrolleOk = betriebsausgabe + nichtAbziehbar + vorsteuer === gesamtBezahlt;
  if (!kontrolleOk) hinweise.push("Kontrollsumme stimmt nicht");

  return {
    belegart: "bewirtung",
    datum: e.datum ?? null,
    lieferant: e.lieferant ?? null,
    art,
    art_quelle: artQuelle,
    berechnet: true,
    steuersaetze: zeilen,
    netto_summe_cents: nettoSumme,
    vorsteuer_cents: vorsteuer,
    rechnung_brutto_cents: rechnungBrutto,
    trinkgeld_cents: trinkgeld,
    trinkgeld_quelle: trinkgeldQuelle,
    basis_cents: basis,
    anteil_prozent: anteilProzent,
    betriebsausgabe_cents: betriebsausgabe,
    nicht_abziehbar_cents: nichtAbziehbar,
    gesamt_bezahlt_cents: gesamtBezahlt,
    kontrolle_ok: kontrolleOk,
    status: hinweise.length ? "zu_pruefen" : "ausgelesen",
    hinweise,
  };
}
