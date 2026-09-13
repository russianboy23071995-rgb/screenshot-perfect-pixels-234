import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { GlassCard, KpiCard, SectionTitle } from "@/components/finance/GlassCard";
import {
  TransactionDialog,
  type TransactionPrefill,
} from "@/components/finance/TransactionDialog";
import { UploadDialog } from "@/components/finance/UploadDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppState } from "@/lib/app-state";
import {
  byMonth,
  expensesByCategory,
  summarize,
  useCategories,
  useSettings,
  useTaxPeriods,
  useTransactions,
  type TxType,
} from "@/lib/finance";
import { MONTHS_SHORT, formatDate, formatEur, formatEurShort } from "@/lib/money";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Finanz-Cockpit" },
      {
        name: "description",
        content:
          "Überblick über Einnahmen, Ausgaben, Gewinn und Umsatzsteuer im laufenden Geschäftsjahr.",
      },
      { property: "og:title", content: "Dashboard · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Einnahmen, Ausgaben, Gewinn und Steuertermine auf einen Blick.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { fiscalYear } = useAppState();
  const { data: transactions = [], isLoading } = useTransactions(fiscalYear);
  const { data: categories = [] } = useCategories();
  const { data: taxPeriods = [] } = useTaxPeriods(fiscalYear);
  const { data: settings } = useSettings();

  const [dialogType, setDialogType] = useState<TxType>("income");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);

  const summary = summarize(transactions);
  const months = useMemo(() => byMonth(transactions), [transactions]);

  const chartData = months.map((month, index) => ({
    name: MONTHS_SHORT[index],
    Einnahmen: month.incomeNet / 100,
    Ausgaben: month.expenseNet / 100,
    Gewinn: month.profit / 100,
  }));

  const categoryData = expensesByCategory(transactions, categories)
    .slice(0, 6)
    .map((entry) => ({ ...entry, amount: entry.value / 100 }));

  const openInvoices = transactions
    .filter((t) => t.type === "income" && (t.payment_status === "open" || t.payment_status === "overdue"))
    .slice(0, 5);

  const nextPeriod = taxPeriods.find((p) => p.status !== "paid" && p.status !== "submitted");
  const recent = [...transactions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  return (
    <AppShell
      title="Dashboard"
      subtitle={`Geschäftsjahr ${fiscalYear}${settings?.owner_name ? ` · ${settings.owner_name}` : ""}`}
      actions={
        <>
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 size-4" /> Beleg
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPrefill(null);
              setDialogType("expense");
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Ausgabe
          </Button>
          <Button
            onClick={() => {
              setPrefill(null);
              setDialogType("income");
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Einnahme
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Einnahmen netto"
            value={formatEur(summary.incomeNet)}
            hint={`${summary.incomeCount} Rechnungen`}
          />
          <KpiCard
            label="Ausgaben netto"
            value={formatEur(summary.expenseNet)}
            hint={`${summary.expenseCount} Belege`}
          />
          <KpiCard
            label="Gewinn"
            value={formatEur(summary.profit)}
            tone={summary.profit >= 0 ? "positive" : "negative"}
            hint="Einnahmen minus Ausgaben"
          />
          <KpiCard
            label="Umsatzsteuer-Saldo"
            value={formatEur(summary.vatDue)}
            tone={summary.vatDue > 0 ? "negative" : "positive"}
            hint={`USt ${formatEurShort(summary.incomeTax)} · Vorsteuer ${formatEurShort(summary.inputTax)}`}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <SectionTitle title="Verlauf" hint="Einnahmen und Ausgaben pro Monat (netto)" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatEur(Math.round(value * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                  }}
                />
                <Legend iconType="circle" fontSize={12} />
                <Bar dataKey="Einnahmen" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Ausgaben" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Top-Ausgaben" hint="Nach Kategorie, netto" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <Tooltip
                  formatter={(value: number) => formatEur(Math.round(value * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                  }}
                />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={`var(--chart-${(index % 5) + 1})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassCard>
          <SectionTitle
            title="Offene Rechnungen"
            hint={openInvoices.length ? "Noch nicht bezahlt" : "Alles bezahlt"}
          />
          <ul className="space-y-3">
            {openInvoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invoice.counterparty}</p>
                  <p className="text-xs text-muted-foreground">
                    {invoice.invoice_number ?? "—"} · {formatDate(invoice.invoice_date)}
                  </p>
                </div>
                <span className="num font-medium">{formatEur(invoice.gross_cents)}</span>
              </li>
            ))}
            {openInvoices.length === 0 ? (
              <li className="text-sm text-muted-foreground">Keine offenen Posten.</li>
            ) : null}
          </ul>
          <Button asChild variant="ghost" className="mt-4 w-full">
            <Link to="/einnahmen">Alle Einnahmen</Link>
          </Button>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Nächster Steuertermin" />
          {nextPeriod ? (
            <div>
              <p className="font-display text-2xl font-semibold">
                Q{nextPeriod.quarter} {nextPeriod.fiscal_year}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fällig am {formatDate(nextPeriod.due_date)}
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Umsatzsteuer</span>
                  <span className="num">{formatEur(summary.incomeTax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vorsteuer</span>
                  <span className="num">{formatEur(summary.inputTax)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>Saldo Jahr</span>
                  <span className="num">{formatEur(summary.vatDue)}</span>
                </div>
              </div>
              <Button asChild variant="ghost" className="mt-4 w-full">
                <Link to="/steuern">Steuerübersicht</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Keine offenen Termine.</p>
          )}
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Gewinnentwicklung" hint="Monatlich, netto" />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip
                  formatter={(value: number) => formatEur(Math.round(value * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Gewinn"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="mt-6">
        <SectionTitle title="Letzte Buchungen" />
        <ul className="divide-y">
          {recent.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{transaction.counterparty}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(transaction.invoice_date)} · {transaction.description}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">
                  {transaction.type === "income" ? "Einnahme" : "Ausgabe"}
                </Badge>
                <span className="num text-sm font-medium">
                  {formatEur(transaction.gross_cents)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={dialogType}
        prefill={prefill}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUseData={(data) => {
          setPrefill(data);
          setDialogType("expense");
          setDialogOpen(true);
        }}
      />
    </AppShell>
  );
}
