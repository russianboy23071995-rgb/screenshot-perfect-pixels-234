import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
}

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
}

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
}

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
      return (data ?? []) as unknown as Transaction[];
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
      return (data ?? []) as unknown as DocumentRow[];
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
        .eq("id", "default")
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
  };
}

export function useDeleteDemoData() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async () => {
      const { error: docError } = await supabase.from("documents").delete().eq("is_demo", true);
      if (docError) throw docError;
      const { error } = await supabase.from("transactions").delete().eq("is_demo", true);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ---------------------------- Aggregation ---------------------------- */

export interface Summary {
  incomeNet: number;
  incomeGross: number;
  incomeTax: number;
  expenseNet: number;
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
  expenseGross: 0,
  inputTax: 0,
  profit: 0,
  vatDue: 0,
  incomeCount: 0,
  expenseCount: 0,
};

export function summarize(transactions: Transaction[]): Summary {
  const s: Summary = { ...EMPTY };
  for (const t of transactions) {
    if (t.payment_status === "cancelled") continue;
    if (t.type === "income") {
      s.incomeNet += t.net_cents;
      s.incomeGross += t.gross_cents;
      s.incomeTax += t.tax_cents;
      s.incomeCount += 1;
    } else {
      s.expenseNet += t.net_cents;
      s.expenseGross += t.gross_cents;
      s.inputTax += t.deductible_tax_cents;
      s.expenseCount += 1;
    }
  }
  s.profit = s.incomeNet - s.expenseNet;
  s.vatDue = s.incomeTax - s.inputTax;
  return s;
}

export function monthOf(t: Transaction): number {
  return Number(t.invoice_date.slice(5, 7)) - 1;
}

export function quarterOf(t: Transaction): number {
  return Math.floor(monthOf(t) / 3) + 1;
}

export function byMonth(transactions: Transaction[]): Summary[] {
  return Array.from({ length: 12 }, (_, month) =>
    summarize(transactions.filter((t) => monthOf(t) === month)),
  );
}

export function byQuarter(transactions: Transaction[]): Summary[] {
  return Array.from({ length: 4 }, (_, index) =>
    summarize(transactions.filter((t) => quarterOf(t) === index + 1)),
  );
}

export function expensesByCategory(
  transactions: Transaction[],
  categories: Category[],
): { name: string; value: number; color: string }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || t.payment_status === "cancelled") continue;
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
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "income" || t.payment_status === "cancelled") continue;
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
