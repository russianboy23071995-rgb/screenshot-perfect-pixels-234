import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/finance/AppShell";
import { GlassCard, KpiCard, SectionTitle } from "@/components/finance/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppState } from "@/lib/app-state";
import { exportTransactionsCsv } from "@/lib/export";
import {
  PERIOD_LABEL,
  byMonth,
  expensesByCategory,
  inRange,
  incomeByCategory,
  quarterOf,
  resolveRange,
  summarize,
  useCategories,
  useTransactions,
  type PeriodKey,
} from "@/lib/finance";
import { MONTHS_DE, MONTHS_SHORT, formatEur, formatPercent } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/auswertungen")({
  head: () => ({
    meta: [
      { title: "Auswertungen · Finanz-Cockpit" },
      {
        name: "description",
        content: "Monats- und Quartalsauswertungen, Kategorien-Verteilung und CSV-Export.",
      },
      { property: "og:title", content: "Auswertungen · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Umsätze, Kosten und Margen nach Monat, Quartal und Kategorie auswerten.",
      },
    ],
  }),
  component: AuswertungenPage,
});

function AuswertungenPage() {
  const { fiscalYear } = useAppState();
  const { data: transactions = [] } = useTransactions(fiscalYear);
  const { data: categories = [] } = useCategories();
  const [period, setPeriod] = useState<PeriodKey>("current_year");

  const quarterOptions = useMemo(() => {
    const now = new Date();
    const curY = now.getFullYear();
    const curQ = Math.floor(now.getMonth() / 3) + 1;
    const list: { year: number; quarter: number }[] = [];
    for (let y = curY; y >= 2026; y--) {
      for (let q = y === curY ? curQ : 4; q >= 1; q--) list.push({ year: y, quarter: q });
    }
    return list.length ? list : [{ year: 2026, quarter: 1 }];
  }, []);
  const [quarterKey, setQuarterKey] = useState(
    () => `${quarterOptions[0].year}-${quarterOptions[0].quarter}`,
  );
  const [qYear, quarter] = quarterKey.split("-").map(Number);
  const { data: qYearTx = [] } = useTransactions(qYear);
  const qTx = useMemo(
    () => qYearTx.filter((t) => quarterOf(t) === quarter && t.payment_status !== "cancelled"),
    [qYearTx, quarter],
  );
  const qSummary = useMemo(() => summarize(qTx), [qTx]);
  const qMonths = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const m = (quarter - 1) * 3 + i;
        const rows = qTx.filter((t) => Number(t.invoice_date.slice(5, 7)) - 1 === m);
        const agg = (type: "income" | "expense") => {
          const r = rows.filter((t) => t.type === type);
          return {
            net: r.reduce((s, t) => s + t.net_cents, 0),
            tax: r.reduce((s, t) => s + t.tax_cents, 0),
            gross: r.reduce((s, t) => s + t.gross_cents, 0),
          };
        };
        return { month: m, income: agg("income"), expense: agg("expense") };
      }),
    [qTx, quarter],
  );
  const range = resolveRange(period, fiscalYear);
  const filtered = useMemo(() => transactions.filter((t) => inRange(t, range)), [transactions, range]);
  const summary = summarize(filtered);
  const months = useMemo(() => byMonth(filtered), [filtered]);
  const expenseCategories = expensesByCategory(filtered, categories);
  const incomeCategories = incomeByCategory(filtered, categories);

  const margin = summary.incomeNet > 0 ? (summary.profit / summary.incomeNet) * 100 : 0;
  const pieData = expenseCategories.slice(0, 6).map((entry) => ({
    name: entry.name,
    value: entry.value / 100,
  }));

  return (
    <AppShell
      title="Auswertungen"
      subtitle={range.label}
      actions={
        <>
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
          <Button
            variant="outline"
            onClick={() =>
              exportTransactionsCsv(filtered, categories, `buchungen-${fiscalYear}.csv`)
            }
          >
            <Download className="mr-2 size-4" /> CSV-Export
          </Button>
        </>
      }
    >
      <GlassCard className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            title="Umsatzsteuer-Übersicht für das Finanzamt"
            hint={`Quartal Q${quarter} ${qYear}`}
          />
          <Select value={quarterKey} onValueChange={setQuarterKey}>
            <SelectTrigger className="w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {quarterOptions.map((o) => (
                <SelectItem key={`${o.year}-${o.quarter}`} value={`${o.year}-${o.quarter}`}>
                  {o.year} · Q{o.quarter}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(["income", "expense"] as const).map((type) => {
          const total = qMonths.reduce(
            (s, m) => ({
              net: s.net + m[type].net,
              tax: s.tax + m[type].tax,
              gross: s.gross + m[type].gross,
            }),
            { net: 0, tax: 0, gross: 0 },
          );
          return (
            <div key={type} className="mt-4">
              <p className="mb-2 font-display text-sm font-semibold">
                {type === "income" ? "Einnahmen" : "Ausgaben"}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Monat</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">MwSt.</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qMonths.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{MONTHS_DE[m.month]}</TableCell>
                        <TableCell className="num text-right">{formatEur(m[type].net)}</TableCell>
                        <TableCell className="num text-right">{formatEur(m[type].tax)}</TableCell>
                        <TableCell className="num text-right">{formatEur(m[type].gross)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold hover:bg-transparent">
                      <TableCell>Summe Q{quarter}</TableCell>
                      <TableCell className="num text-right">{formatEur(total.net)}</TableCell>
                      <TableCell className="num text-right">{formatEur(total.tax)}</TableCell>
                      <TableCell className="num text-right">{formatEur(total.gross)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}

        <div className="mt-6 rounded-xl border border-border/60 bg-muted/40 px-5 py-4">
          <p className="mb-3 font-display text-sm font-semibold">Zahllast Q{quarter} {qYear}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Umsatzsteuer geschuldet (aus Einnahmen)</span>
              <span className="num font-semibold">{formatEur(qSummary.incomeTax)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vorsteuer zurück (aus Ausgaben, abziehbar)</span>
              <span className="num font-semibold">− {formatEur(qSummary.inputTax)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-2 text-base">
              <span className="font-semibold">
                {qSummary.vatDue >= 0 ? "Tatsächliche Zahllast ans Finanzamt" : "Erstattung vom Finanzamt"}
              </span>
              <span
                className={`num font-bold ${qSummary.vatDue >= 0 ? "text-destructive" : "text-positive"}`}
              >
                {formatEur(Math.abs(qSummary.vatDue))}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Einnahmen netto" value={formatEur(summary.incomeNet)} />
        <KpiCard label="Ausgaben netto" value={formatEur(summary.expenseNet)} />
        <KpiCard
          label="Gewinn"
          value={formatEur(summary.profit)}
          tone={summary.profit >= 0 ? "positive" : "negative"}
        />
        <KpiCard label="Marge" value={formatPercent(margin)} hint="Gewinn / Einnahmen" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <SectionTitle title="Monatsvergleich" hint="Netto pro Monat" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={months.map((month, index) => ({
                  name: MONTHS_SHORT[index],
                  Einnahmen: month.incomeNet / 100,
                  Ausgaben: month.expenseNet / 100,
                }))}
              >
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
                <Bar dataKey="Einnahmen" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Ausgaben" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Kostenverteilung" hint="Anteil je Kategorie" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={`var(--chart-${(index % 5) + 1})`} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatEur(Math.round(value * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <SectionTitle title="Ausgaben nach Kategorie" />
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kategorie</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Anteil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseCategories.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell className="num text-right">{formatEur(entry.value)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatPercent(
                      summary.expenseNet > 0 ? (entry.value / summary.expenseNet) * 100 : 0,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Einnahmen nach Kategorie" />
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kategorie</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Anteil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomeCategories.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell className="num text-right">{formatEur(entry.value)}</TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatPercent(
                      summary.incomeNet > 0 ? (entry.value / summary.incomeNet) * 100 : 0,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </GlassCard>
      </div>

      <GlassCard className="mt-6">
        <SectionTitle title="Monatsübersicht" hint="Netto, Steuer und Gewinn je Monat" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Monat</TableHead>
                <TableHead className="text-right">Einnahmen</TableHead>
                <TableHead className="text-right">Ausgaben</TableHead>
                <TableHead className="text-right">Gewinn</TableHead>
                <TableHead className="text-right">USt-Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((month, index) => (
                <TableRow key={index}>
                  <TableCell>{MONTHS_DE[index]}</TableCell>
                  <TableCell className="num text-right">{formatEur(month.incomeNet)}</TableCell>
                  <TableCell className="num text-right">{formatEur(month.expenseNet)}</TableCell>
                  <TableCell className="num text-right font-medium">
                    {formatEur(month.profit)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatEur(month.vatDue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </AppShell>
  );
}
