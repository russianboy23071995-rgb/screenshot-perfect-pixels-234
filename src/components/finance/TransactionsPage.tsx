import { Download, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/finance/AppShell";
import { EmptyState, KpiCard } from "@/components/finance/GlassCard";
import {
  TransactionDialog,
  type TransactionPrefill,
} from "@/components/finance/TransactionDialog";
import { TransactionTable } from "@/components/finance/TransactionTable";
import { UploadDialog } from "@/components/finance/UploadDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppState } from "@/lib/app-state";
import { exportTransactionsCsv } from "@/lib/export";
import {
  PERIOD_LABEL,
  inRange,
  resolveRange,
  summarize,
  useSettings,
  useCategories,
  useTransactions,
  type PeriodKey,
  type Transaction,
  type TxType,
} from "@/lib/finance";
import { formatEur } from "@/lib/money";

export function TransactionsPage({ type }: { type: TxType }) {
  const { fiscalYear } = useAppState();
  const { data: transactions = [], isLoading } = useTransactions(fiscalYear);
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const testMode = settings?.test_mode ?? false;

  const [period, setPeriod] = useState<PeriodKey>("current_year");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);

  const range = resolveRange(period, fiscalYear);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter(
      (t) =>
        t.type === type &&
        inRange(t, range) &&
        (categoryId === "all" || t.category_id === categoryId) &&
        (status === "all" || t.payment_status === status) &&
        (!term ||
          t.counterparty.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          (t.invoice_number ?? "").toLowerCase().includes(term)),
    );
  }, [transactions, type, range, categoryId, status, search]);

  const summary = summarize(filtered, testMode);
  const isIncome = type === "income";
  const openSum = filtered
    .filter((t) => t.payment_status === "open" || t.payment_status === "overdue")
    .reduce((sum, t) => sum + t.gross_cents, 0);

  return (
    <AppShell
      title={isIncome ? "Einnahmen" : "Ausgaben"}
      subtitle={`${range.label} · ${filtered.length} Buchungen`}
      actions={
        <>
          {!isIncome ? (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 size-4" /> Beleg
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() =>
              exportTransactionsCsv(
                filtered,
                categories,
                `${isIncome ? "einnahmen" : "ausgaben"}-${fiscalYear}.csv`,
              )
            }
          >
            <Download className="mr-2 size-4" /> CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setPrefill(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> {isIncome ? "Einnahme" : "Ausgabe"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={isIncome ? "Einnahmen netto" : "Ausgaben netto"}
          value={formatEur(isIncome ? summary.incomeNet : summary.expenseNet)}
          hint={range.label}
        />
        <KpiCard
          label={isIncome ? "Umsatzsteuer" : "Vorsteuer"}
          value={formatEur(isIncome ? summary.incomeTax : summary.inputTax)}
        />
        <KpiCard
          label={isIncome ? "Offene Forderungen" : "Offene Zahlungen"}
          value={formatEur(openSum)}
          tone={openSum > 0 ? "negative" : "neutral"}
        />
      </div>

      <div className="glass mt-6 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suchen …"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_LABEL)
              .filter(([key]) => key !== "custom")
              .map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {categories
              .filter((c) => c.type === type)
              .map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[10rem]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="open">Offen</SelectItem>
            <SelectItem value="paid">Bezahlt</SelectItem>
            <SelectItem value="overdue">Überfällig</SelectItem>
            <SelectItem value="cancelled">Storniert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Buchungen"
            description="Für diesen Zeitraum und diese Filter gibt es noch keine Einträge."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setPrefill(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-2 size-4" /> Jetzt erfassen
              </Button>
            }
          />
        ) : (
          <TransactionTable
            transactions={filtered}
            onEdit={(transaction) => {
              setEditing(transaction);
              setPrefill(null);
              setDialogOpen(true);
            }}
          />
        )}
      </div>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={type}
        transaction={editing}
        prefill={prefill}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUseData={(data) => {
          setEditing(null);
          setPrefill(data);
          setDialogOpen(true);
        }}
      />
    </AppShell>
  );
}
