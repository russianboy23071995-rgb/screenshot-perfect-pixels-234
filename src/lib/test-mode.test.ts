import { describe, expect, test, mock } from "bun:test";
import { canStartLive, requireDeleteConfirmation, visibleInMode } from "./test-mode";

mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { countsInBooks, countsInEuer, isOpenItem, summarize, vatSummary, vatTransactionsOfQuarter, euerOfYear } = await import("./finance");
import type { Transaction } from "./finance";

const row = (patch: Partial<Transaction> = {}): Transaction => ({
  id: "test", type: "income", booking_status: "freigegeben", is_demo: true,
  payment_status: "paid", payment_date: "2026-10-25", invoice_date: "2026-10-20",
  net_cents: 10000, tax_cents: 1900, gross_cents: 11900, deductible_tax_cents: 0,
  storno_of: null, reverse_charge: false, ...patch,
} as Transaction);

describe("Testphase und Live-Start", () => {
  test("Testdaten zählen im Testmodus in Büchern, EÜR und USt", () => {
    expect(countsInBooks(row(), true)).toBe(true);
    expect(countsInEuer(row(), true)).toBe(true);
    expect(summarize([row()], true).incomeNet).toBe(10000);
    expect(vatSummary([row()], true).outputTax).toBe(1900);
    expect(vatTransactionsOfQuarter([row()], 2026, 4, "ist", true)).toHaveLength(1);
    expect(euerOfYear([row()], 2026, true)).toHaveLength(1);
  });
  test("Testbuchungen zählen im Live-Betrieb nirgends", () => {
    expect(countsInBooks(row(), false)).toBe(false);
    expect(countsInEuer(row(), false)).toBe(false);
    expect(summarize([row()], false).incomeNet).toBe(0);
    expect(vatSummary([row()], false).outputTax).toBe(0);
    expect(vatTransactionsOfQuarter([row()], 2026, 4, "ist", false)).toHaveLength(0);
    expect(euerOfYear([row()], 2026, false)).toHaveLength(0);
    expect(isOpenItem(row({ payment_status: "open" }), false)).toBe(false);
  });
  test("Live-Buchungen bleiben in den Auswertungen", () => {
    expect(summarize([row({ is_demo: false })], false).incomeNet).toBe(10000);
    expect(vatSummary([row({ is_demo: false })], false).outputTax).toBe(1900);
  });
  test("Testentwürfe zählen auch im Testmodus nicht in Summen", () => {
    expect(summarize([row({ booking_status: "entwurf" })], true).incomeNet).toBe(0);
  });
  test("Storniertes Testoriginal und Gegenbuchung heben sich auf", () => {
    expect(summarize([row({ booking_status: "storniert" }), row({ net_cents: -10000, tax_cents: -1900, gross_cents: -11900, storno_of: "test" })], true).incomeNet).toBe(0);
  });
  test("Tests in Arbeitslisten und Dublettenprüfung nur im Testmodus", () => {
    expect(visibleInMode({ is_demo: true }, false)).toBe(false);
    expect(visibleInMode({ is_demo: true }, true)).toBe(true);
    expect(visibleInMode({ is_demo: false }, false)).toBe(true);
    expect(isOpenItem(row({ payment_status: "open" }), true)).toBe(true);
  });
  test("Live-Start nur ohne Testbelege und Testbuchungen", () => {
    expect(canStartLive(1, 0)).toBe(false);
    expect(canStartLive(0, 1)).toBe(false);
    expect(canStartLive(0, 0)).toBe(true);
  });
  test("Löschen erfordert exakt LÖSCHEN", () => {
    expect(() => requireDeleteConfirmation("LÖSCHEN")).not.toThrow();
    expect(() => requireDeleteConfirmation("löschen")).toThrow();
    expect(() => requireDeleteConfirmation("")).toThrow();
  });
});