import { visibleInMode } from "@/lib/test-mode";
import { deductibleExpenseCents, transactionLines, type TaxLine } from "@/lib/tax-lines";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type TxType = "income" | "expense";
export type PaymentStatus = "open" | "paid" | "overdue" | "cancelled";
export type SyncStatus = "app_only" | "synced" | "missing" | "error";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  active: boolean;
  sort_order: number;
  is_demo: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  invoice_number: string | null;
  counterparty: string;
  description: string;
  category_id: string | null;
  invoice_date: string;
  service_date: string | null;
  payment_date: string | null;
  payment_status: PaymentStatus;
  net_cents: number;
  tax_rate: number;
  tax_lines: TaxLine[];
  tip_cents: number;
  input_tax_percent: number;
  bewirtung: Record<string, unknown> | null;
  tax_cents: number;
  gross_cents: number;
  deductible: "yes" | "no" | "partial";
  deductible_percent: number;
  deductible_tax_cents: number;
  payment_method: string;
  notes: string | null;
  fiscal_year: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  booking_status: BookingStatus;
  currency: string;
  original_net_cents: number | null;
  original_tax_cents: number | null;
  original_gross_cents: number | null;
  counterparty_vat_id: string | null;
  reverse_charge: boolean;
  approved_at: string | null;
  approved_by: string | null;
  storno_of: string | null;
}

export type BookingStatus = "entwurf" | "freigegeben" | "storniert";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  storniert: "Storniert",
};

/**
 * Zählt in Summen, EÜR und USt-VA: alles Festgeschriebene. Stornierte Originale
 * bleiben drin, damit sie sich mit ihrer (negativen) Storno-Gegenbuchung aufheben.
 * Entwürfe zählen nie.
 */
export function countsInBooks(t: Pick<Transaction, "booking_status" | "is_demo">, testMode = false): boolean {
  if (!visibleInMode(t, testMode)) return false;
  return t.booking_status === "freigegeben" || t.booking_status === "storniert";
}

/** EÜR-Datum: Zahlungszeitpunkt (§ 11 EStG), ersatzweise Rechnungsdatum. */
export function euerDate(t: Pick<Transaction, "payment_date" | "invoice_date">): string {
  return (t.payment_date ?? t.invoice_date).slice(0, 10);
}

export type AuditAction =
  | "angelegt"
  | "geaendert"
  | "verknuepft"
  | "freigegeben"
  | "storniert"
  | "kein_beleg"
  | "dublette";
export type AuditActor = "ki" | "system" | "nutzer";

export interface AuditEntry {
  is_test: boolean;
  id: string;
  entity_type: "transaction" | "document";
  entity_id: string;
  action: AuditAction;
  actor: AuditActor;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  angelegt: "Angelegt",
  geaendert: "Geändert",
  verknuepft: "Verknüpft",
  freigegeben: "Freigegeben",
  storniert: "Storniert",
  kein_beleg: "Kein Buchungsbeleg",
  dublette: "Dublette",
};

export const AUDIT_ACTOR_LABEL: Record<AuditActor, string> = {
  ki: "KI",
  system: "System",
  nutzer: "Nutzer",
};

export async function logAudit(entry: {
  entity_type: "transaction" | "document";
  entity_id: string;
  action: AuditAction;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_log").insert({
    user_id: data.user.id,
    actor: "nutzer",
    is_test: await getOwnerTestMode(),
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    old_data: (entry.old_data ?? null) as never,
    new_data: (entry.new_data ?? null) as never,
    note: entry.note ?? null,
  });
}

export type ReviewStatus = "neu" | "zu_pruefen" | "geprueft" | "dublette" | "fehler";

export interface DocumentRow {
  id: string;
  transaction_id: string | null;
  filename: string;
  original_filename: string;
  file_type: string;
  storage_path: string;
  upload_date: string;
  sync_status: SyncStatus;
  extracted_data: Record<string, unknown> | null;
  confidence: number | null;
  is_demo: boolean;
  local_path: string | null;
  synced_at: string | null;
  sha256: string | null;
  source: "email" | "telegram" | "upload" | null;
  source_ref: string | null;
  sender: string | null;
  subject: string | null;
  received_at: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  neu: "Neu",
  zu_pruefen: "Zu prüfen",
  geprueft: "Geprüft",
  dublette: "Dublette",
  fehler: "Abgelehnt",
};

export const SOURCE_LABEL: Record<string, string> = {
  email: "E-Mail",
  telegram: "Telegram",
  upload: "Upload",
};

export interface TaxPeriod {
  id: string;
  fiscal_year: number;
  quarter: number;
  period_start: string;
  period_end: string;
  due_date: string;
  status: "open" | "preparing" | "submitted" | "paid";
  notes: string | null;
}

export interface Settings {
  id: string;
  company_name: string;
  owner_name: string;
  address: string;
  tax_number: string;
  vat_id: string;
  vat_liable: boolean;
  default_tax_rate: number;
  tax_rates: number[];
  advance_period: "monthly" | "quarterly";
  permanent_extension: boolean;
  currency: string;
  default_payment_method: string;
  bank_account: string;
  filename_scheme: string;
  local_folder: string;
  active_fiscal_year: number;
  taxation_method: TaxationMethod;
  test_mode: boolean;
}

export type TaxationMethod = "soll" | "ist";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  open: "Offen",
  paid: "Bezahlt",
  overdue: "Überfällig",
  cancelled: "Storniert",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank: "Überweisung",
  card: "Karte",
  cash: "Bar",
  paypal: "PayPal",
  direct_debit: "Lastschrift",
  other: "Sonstiges",
};

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  app_only: "Nur in App",
  synced: "Lokal synchronisiert",
  missing: "Datei fehlt",
  error: "Synchronisationsfehler",
};

export const TAX_STATUS_LABEL: Record<TaxPeriod["status"], string> = {
  open: "Offen",
  preparing: "In Vorbereitung",
  submitted: "Übermittelt",
  paid: "Bezahlt",
};

export async function getOwnerTestMode(): Promise<boolean> {
  const { data, error } = await supabase.from("settings").select("test_mode").limit(1).single();
  if (error) throw error;
  return data.test_mode;
}

/* ------------------------------ Queries ------------------------------ */

export function useTransactions(fiscalYear: number) {
  return useQuery({
    queryKey: ["transactions", fiscalYear],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("fiscal_year", fiscalYear)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      const mode = await getOwnerTestMode();
      return ((data ?? []) as unknown as Transaction[]).filter((t) => visibleInMode(t, mode));
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("type")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });
}

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("upload_date", { ascending: false });
      if (error) throw error;
      const mode = await getOwnerTestMode();
      return ((data ?? []) as unknown as DocumentRow[]).filter((d) => visibleInMode(d, mode));
    },
  });
}

/** Offener Beleg ohne Vorgang: noch nicht entschieden. */
export function isOpenDocument(d: Pick<DocumentRow, "review_status" | "review_note">): boolean {
  if (d.review_status === "zu_pruefen") return true;
  if (d.review_status === "dublette") return !(d.review_note ?? "").startsWith("Dublette bestätigt");
  return false;
}

export interface PrueflisteData {
  drafts: Transaction[];
  docsByTx: Record<string, DocumentRow[]>;
  orphanDocs: DocumentRow[];
}

export function usePruefliste() {
  return useQuery({
    queryKey: ["documents", "pruefliste"],
    queryFn: async (): Promise<PrueflisteData> => {
      const { data: draftRows, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("booking_status", "entwurf")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      const mode = await getOwnerTestMode();
      const drafts = ((draftRows ?? []) as unknown as Transaction[]).filter((t) => visibleInMode(t, mode));
      const ids = drafts.map((d) => d.id);

      const docsByTx: Record<string, DocumentRow[]> = {};
      if (ids.length) {
        const { data: linked, error: le } = await supabase
          .from("documents")
          .select("*")
          .in("transaction_id", ids)
          .order("upload_date");
        if (le) throw le;
        for (const d of (linked ?? []) as unknown as DocumentRow[]) {
          if (d.transaction_id && visibleInMode(d, mode)) (docsByTx[d.transaction_id] ??= []).push(d);
        }
      }

      const { data: open, error: oe } = await supabase
        .from("documents")
        .select("*")
        .in("review_status", ["zu_pruefen", "dublette"])
        .is("transaction_id", null)
        .order("received_at", { ascending: false, nullsFirst: false })
        .order("upload_date", { ascending: false });
      if (oe) throw oe;
      const orphanDocs = ((open ?? []) as unknown as DocumentRow[]).filter((d) => visibleInMode(d, mode) && isOpenDocument(d));
      return { drafts, docsByTx, orphanDocs };
    },
  });
}

/** Anzahl offener Vorgänge (Entwürfe + Belege ohne Vorgang) für das Menü. */
export function useOpenReviewCount() {
  const query = usePruefliste();
  return { ...query, data: query.data ? query.data.drafts.length + query.data.orphanDocs.length : 0 };
}

export function useAuditLog(filter?: { entityId?: string; showTest?: boolean }) {
  return useQuery({
    queryKey: ["audit_log", filter?.entityId ?? "all", filter?.showTest ?? false],
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      if (!filter?.showTest) q = q.eq("is_test", false);
      if (filter?.entityId) q = q.eq("entity_id", filter.entityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });
}

/** Buchungen nach Rechnungsdatum-Zeitraum (für die USt-Voranmeldung). */
export function useTransactionsByInvoiceRange(from: string, to: string) {
  return useQuery({
    queryKey: ["transactions", "range", from, to],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .gte("invoice_date", from)
        .lte("invoice_date", to);
      if (error) throw error;
      const mode = await getOwnerTestMode();
      return ((data ?? []) as unknown as Transaction[]).filter((t) => visibleInMode(t, mode));
    },
  });
}

export function useTaxPeriods(fiscalYear: number) {
  return useQuery({
    queryKey: ["tax_periods", fiscalYear],
    queryFn: async (): Promise<TaxPeriod[]> => {
      const { data, error } = await supabase
        .from("tax_periods")
        .select("*")
        .eq("fiscal_year", fiscalYear)
        .order("quarter");
      if (error) throw error;
      return (data ?? []) as unknown as TaxPeriod[];
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Settings | null;
    },
  });
}

export function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["tax_periods"] });
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
    void queryClient.invalidateQueries({ queryKey: ["audit_log"] });
  };
}

/* ---------------------------- Aggregation ---------------------------- */

export interface Summary {
  incomeNet: number;
  incomeGross: number;
  incomeTax: number;
  expenseNet: number;
  expenseDeductible: number;
  expenseNonDeductible: number;
  expenseGross: number;
  inputTax: number;
  profit: number;
  vatDue: number;
  incomeCount: number;
  expenseCount: number;
}

const EMPTY: Summary = {
  incomeNet: 0,
  incomeGross: 0,
  incomeTax: 0,
  expenseNet: 0,
  expenseDeductible: 0,
  expenseNonDeductible: 0,
  expenseGross: 0,
  inputTax: 0,
  profit: 0,
  vatDue: 0,
  incomeCount: 0,
  expenseCount: 0,
};

export function summarize(transactions: Transaction[], testMode = false): Summary {
  const s: Summary = { ...EMPTY };
  for (const t of transactions) {
    if (!countsInBooks(t, testMode) || t.payment_status === "cancelled") continue;
    if (t.type === "income") {
      s.incomeNet += t.net_cents;
      s.incomeGross += t.gross_cents;
      s.incomeTax += t.tax_cents;
      s.incomeCount += 1;
    } else {
      s.expenseNet += t.net_cents;
      s.expenseDeductible += deductibleExpenseCents(t);
      s.expenseGross += t.gross_cents;
      s.inputTax += t.deductible_tax_cents;
      s.expenseCount += 1;
    }
  }
  s.expenseNonDeductible = s.expenseNet - s.expenseDeductible;
  s.profit = s.incomeNet - s.expenseDeductible;
  s.vatDue = s.incomeTax - s.inputTax;
  return s;
}

/** Monat (0–11) aus einem ISO-Datum; null bei fehlendem Datum. */
export function monthOfDate(date: string | null | undefined): number | null {
  if (!date || date.length < 7) return null;
  const m = Number(date.slice(5, 7)) - 1;
  return Number.isFinite(m) ? m : null;
}

export function yearOfDate(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** EÜR-relevant (§ 11 EStG): festgeschrieben, bezahlt und mit Zahldatum. */
export function countsInEuer(t: Transaction, testMode = false): boolean {
  return countsInBooks(t, testMode) && t.payment_status === "paid" && !!t.payment_date;
}

/** Offener Posten: festgeschrieben, aber noch nicht bezahlt. */
export function isOpenItem(t: Transaction, testMode = false): boolean {
  if (!visibleInMode(t, testMode)) return false;
  return t.booking_status === "freigegeben" && !t.storno_of && (t.payment_status === "open" || t.payment_status === "overdue");
}

/** Monat nach Zahldatum (EÜR). */
export function monthOf(t: Transaction): number | null {
  return monthOfDate(t.payment_date);
}

export function quarterOf(t: Transaction): number | null {
  const m = monthOf(t);
  return m == null ? null : Math.floor(m / 3) + 1;
}

/** Nur EÜR-relevante Buchungen eines Jahres nach Zahldatum. */
export function euerOfYear(transactions: Transaction[], year: number, testMode = false): Transaction[] {
  return transactions.filter((t) => countsInEuer(t, testMode) && yearOfDate(t.payment_date) === year);
}

export function byMonth(transactions: Transaction[], testMode = false): Summary[] {
  const paid = transactions.filter((t) => countsInEuer(t, testMode));
  return Array.from({ length: 12 }, (_, month) => summarize(paid.filter((t) => monthOf(t) === month), testMode));
}

export function byQuarter(transactions: Transaction[], testMode = false): Summary[] {
  const paid = transactions.filter((t) => countsInEuer(t, testMode));
  return Array.from({ length: 4 }, (_, index) =>
    summarize(paid.filter((t) => quarterOf(t) === index + 1), testMode),
  );
}

/* --------------------------- Umsatzsteuer --------------------------- */

const RC_RATE = 19;

/** Datum, nach dem eine Buchung in der USt-Voranmeldung zugeordnet wird; null = (noch) nicht. */
export function vatDate(t: Transaction, method: TaxationMethod): string | null {
  if (t.type === "expense") return t.invoice_date || null;
  if (method === "ist") return t.payment_status === "paid" ? t.payment_date : null;
  return t.service_date || t.invoice_date || null;
}

function vatQuarterOf(t: Transaction, method: TaxationMethod, year: number): number | null {
  const d = vatDate(t, method);
  if (yearOfDate(d) !== year) return null;
  const m = monthOfDate(d);
  return m == null ? null : Math.floor(m / 3) + 1;
}

export interface VatSummary {
  outputByRate: Record<number, { net: number; tax: number }>;
  inputByRate: Record<number, { net: number; tax: number }>;
  outputTax: number;
  inputTax: number;
  rcBase: number;
  rcTax: number;
  rcCount: number;
  due: number;
}

export function vatSummary(transactions: Transaction[], testMode = false): VatSummary {
  const s: VatSummary = { outputByRate: {}, inputByRate: {}, outputTax: 0, inputTax: 0, rcBase: 0, rcTax: 0, rcCount: 0, due: 0 };
  for (const t of transactions) {
    if (!countsInBooks(t, testMode) || t.payment_status === "cancelled") continue;
    const byRate = t.type === "income" ? s.outputByRate : s.inputByRate;
    for (const l of transactionLines(t)) {
      const bucket = byRate[l.rate] ?? { net: 0, tax: 0 };
      bucket.net += l.net_cents;
      bucket.tax += l.tax_cents;
      byRate[l.rate] = bucket;
    }
    if (t.type === "income") s.outputTax += t.tax_cents;
    else if (t.reverse_charge) {
      s.rcBase += t.net_cents;
      s.rcTax += Math.round((t.net_cents * RC_RATE) / 100);
      s.rcCount += 1;
    } else s.inputTax += t.deductible_tax_cents;
  }
  // § 13b: Steuer gleichzeitig geschuldet und als Vorsteuer abziehbar -> neutral.
  s.due = s.outputTax + s.rcTax - s.inputTax - s.rcTax;
  return s;
}

/** Buchungen, die in ein USt-Quartal fallen. */
export function vatTransactionsOfQuarter(
  transactions: Transaction[],
  year: number,
  quarter: number,
  method: TaxationMethod,
  testMode = false,
): Transaction[] {
  return transactions.filter(
    (t) => countsInBooks(t, testMode) && t.payment_status !== "cancelled" && vatQuarterOf(t, method, year) === quarter,
  );
}

/** Monat (0–11) einer Buchung für die USt-Zuordnung. */
export function vatMonthOf(t: Transaction, method: TaxationMethod): number | null {
  return monthOfDate(vatDate(t, method));
}

export function useAllTransactions() {
  return useQuery({
    queryKey: ["transactions", "all"],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase.from("transactions").select("*");
      if (error) throw error;
      const mode = await getOwnerTestMode();
      return ((data ?? []) as unknown as Transaction[]).filter((t) => visibleInMode(t, mode));
    },
  });
}

/** Offene Posten, älteste zuerst. */
export function useOpenItems() {
  return useQuery({
    queryKey: ["transactions", "open-items"],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("booking_status", "freigegeben")
        .is("storno_of", null)
        .in("payment_status", ["open", "overdue"])
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      const mode = await getOwnerTestMode();
      return ((data ?? []) as unknown as Transaction[]).filter((t) => visibleInMode(t, mode));
    },
  });
}

/** Zahlung bei einer freigegebenen Buchung ohne Zahldatum einmalig nachtragen. */
export async function recordPayment(t: Transaction, paymentDate: string, paymentMethod: string): Promise<void> {
  const patch = {
    payment_date: paymentDate,
    payment_status: "paid" as const,
    payment_method: paymentMethod,
    fiscal_year: Number(paymentDate.slice(0, 4)),
  };
  const { error } = await supabase.from("transactions").update(patch).eq("id", t.id);
  if (error) throw error;
  await logAudit({
    entity_type: "transaction",
    entity_id: t.id,
    action: "geaendert",
    old_data: {
      payment_date: t.payment_date,
      payment_status: t.payment_status,
      payment_method: t.payment_method,
      fiscal_year: t.fiscal_year,
    },
    new_data: patch,
    note: "Zahlung erfasst",
  });
}

export function expensesByCategory(
  transactions: Transaction[],
  categories: Category[],
  testMode = false,
): { name: string; value: number; color: string }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || !countsInBooks(t, testMode) || t.payment_status === "cancelled") continue;
    const key = t.category_id ?? "none";
    map.set(key, (map.get(key) ?? 0) + t.net_cents);
  }
  return [...map.entries()]
    .map(([id, value]) => {
      const category = categories.find((c) => c.id === id);
      return { name: category?.name ?? "Ohne Kategorie", value, color: category?.color ?? "#999" };
    })
    .sort((a, b) => b.value - a.value);
}

export function incomeByCategory(
  transactions: Transaction[],
  categories: Category[],
  testMode = false,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "income" || !countsInBooks(t, testMode) || t.payment_status === "cancelled") continue;
    const key = t.category_id ?? "none";
    map.set(key, (map.get(key) ?? 0) + t.net_cents);
  }
  return [...map.entries()]
    .map(([id, value]) => ({
      name: categories.find((c) => c.id === id)?.name ?? "Ohne Kategorie",
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------ Periods ------------------------------ */

export type PeriodKey =
  | "current_month"
  | "current_quarter"
  | "current_year"
  | "prev_month"
  | "prev_quarter"
  | "prev_year"
  | "custom";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  current_month: "Aktueller Monat",
  current_quarter: "Aktuelles Quartal",
  current_year: "Aktuelles Jahr",
  prev_month: "Vorheriger Monat",
  prev_quarter: "Vorheriges Quartal",
  prev_year: "Vorheriges Jahr",
  custom: "Benutzerdefiniert",
};

export interface Range {
  from: string;
  to: string;
  label: string;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function resolveRange(
  key: PeriodKey,
  fiscalYear: number,
  custom?: { from: string; to: string },
): Range {
  const now = new Date();
  const isCurrentYear = now.getFullYear() === fiscalYear;
  const month = isCurrentYear ? now.getMonth() + 1 : 12;
  const quarter = Math.floor((month - 1) / 3) + 1;

  switch (key) {
    case "current_month":
      return {
        from: iso(fiscalYear, month, 1),
        to: iso(fiscalYear, month, lastDay(fiscalYear, month)),
        label: `${["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][month - 1]} ${fiscalYear}`,
      };
    case "prev_month": {
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? fiscalYear - 1 : fiscalYear;
      return {
        from: iso(y, m, 1),
        to: iso(y, m, lastDay(y, m)),
        label: `Vormonat ${String(m).padStart(2, "0")}/${y}`,
      };
    }
    case "current_quarter":
      return {
        from: iso(fiscalYear, quarter * 3 - 2, 1),
        to: iso(fiscalYear, quarter * 3, lastDay(fiscalYear, quarter * 3)),
        label: `Q${quarter} ${fiscalYear}`,
      };
    case "prev_quarter": {
      const q = quarter === 1 ? 4 : quarter - 1;
      const y = quarter === 1 ? fiscalYear - 1 : fiscalYear;
      return {
        from: iso(y, q * 3 - 2, 1),
        to: iso(y, q * 3, lastDay(y, q * 3)),
        label: `Q${q} ${y}`,
      };
    }
    case "prev_year":
      return {
        from: iso(fiscalYear - 1, 1, 1),
        to: iso(fiscalYear - 1, 12, 31),
        label: `Geschäftsjahr ${fiscalYear - 1}`,
      };
    case "custom":
      return {
        from: custom?.from || iso(fiscalYear, 1, 1),
        to: custom?.to || iso(fiscalYear, 12, 31),
        label: "Benutzerdefiniert",
      };
    case "current_year":
    default:
      return {
        from: iso(fiscalYear, 1, 1),
        to: iso(fiscalYear, 12, 31),
        label: `Geschäftsjahr ${fiscalYear}`,
      };
  }
}

export function inRange(t: Transaction, range: Range): boolean {
  const date = t.invoice_date.slice(0, 10);
  return date >= range.from && date <= range.to;
}

export function vatDueDate(
  fiscalYear: number,
  quarter: number,
  permanentExtension: boolean,
): string {
  const baseMonth = quarter * 3 + 1;
  const year = baseMonth > 12 ? fiscalYear + 1 : fiscalYear;
  const month = baseMonth > 12 ? baseMonth - 12 : baseMonth;
  const shifted = permanentExtension ? month + 1 : month;
  const finalYear = shifted > 12 ? year + 1 : year;
  const finalMonth = shifted > 12 ? shifted - 12 : shifted;
  return iso(finalYear, finalMonth, 10);
}

export function isOverdue(t: Transaction): boolean {
  if (t.type !== "income" || t.payment_status !== "open") return false;
  const due = new Date(t.invoice_date);
  due.setDate(due.getDate() + 14);
  return due < new Date();
}
