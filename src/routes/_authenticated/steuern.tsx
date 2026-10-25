import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { GlassCard, KpiCard, SectionTitle } from "@/components/finance/GlassCard";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/lib/app-state";
import {
  TAX_STATUS_LABEL,
  summarize,
  useInvalidateFinance,
  useSettings,
  useTaxPeriods,
  useAllTransactions,
  vatSummary,
  vatTransactionsOfQuarter,
  euerOfYear,
  type TaxationMethod,
  vatDueDate,
  type TaxPeriod,
} from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/steuern")({
  head: () => ({
    meta: [
      { title: "Steuern · Finanz-Cockpit" },
      {
        name: "description",
        content:
          "Umsatzsteuer-Voranmeldungen, Fristen und Zahllast pro Quartal übersichtlich verwalten.",
      },
      { property: "og:title", content: "Steuern · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Quartalsweise Umsatzsteuer, Vorsteuer und Fristen im Blick.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SteuernPage,
});

function SteuernPage() {
  const { fiscalYear } = useAppState();
  const { data: allTx = [] } = useAllTransactions();
  const { data: periods = [] } = useTaxPeriods(fiscalYear);
  const { data: settings } = useSettings();
  const testMode = settings?.test_mode ?? false;
  const invalidate = useInvalidateFinance();

  const method: TaxationMethod = settings?.taxation_method ?? "ist";
  const quarters = [1, 2, 3, 4].map((q) => vatSummary(vatTransactionsOfQuarter(allTx, fiscalYear, q, method, testMode), testMode));
  const vatYear = vatSummary([1, 2, 3, 4].flatMap((q) => vatTransactionsOfQuarter(allTx, fiscalYear, q, method, testMode)), testMode);
  // EÜR nach Zahldatum
  const year = { ...summarize(euerOfYear(allTx, fiscalYear, testMode), testMode), incomeTax: vatYear.outputTax, inputTax: vatYear.inputTax, vatDue: vatYear.due };
  const extension = settings?.permanent_extension ?? false;

  async function updateStatus(period: TaxPeriod, status: TaxPeriod["status"]) {
    const { error } = await supabase.from("tax_periods").update({ status }).eq("id", period.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status aktualisiert.");
    invalidate();
  }

  return (
    <AppShell
      title="Steuern"
      subtitle={`Umsatzsteuer ${fiscalYear}${extension ? " · mit Dauerfristverlängerung" : ""}`}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Umsatzsteuer (Jahr)" value={formatEur(year.incomeTax)} />
        <KpiCard label="Vorsteuer (Jahr)" value={formatEur(year.inputTax)} />
        <KpiCard
          label="Zahllast"
          value={formatEur(year.vatDue)}
          tone={year.vatDue > 0 ? "negative" : "positive"}
          hint={year.vatDue > 0 ? "An das Finanzamt" : "Erstattung erwartet"}
        />
      </div>

      <GlassCard className="mt-6">
        <SectionTitle title="Voranmeldungen" hint={method === "ist" ? "Ist-Versteuerung: Umsatzsteuer nach Zahldatum, Vorsteuer nach Rechnungsdatum" : "Soll-Versteuerung: Umsatzsteuer nach Leistungs-/Rechnungsdatum, Vorsteuer nach Rechnungsdatum"} />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quartal</TableHead>
                <TableHead className="hidden sm:table-cell">Zeitraum</TableHead>
                <TableHead>Frist</TableHead>
                <TableHead className="text-right">Umsatzsteuer</TableHead>
                <TableHead className="text-right">Vorsteuer</TableHead>
                <TableHead className="hidden text-right md:table-cell">§ 13b (USt = VSt)</TableHead>
                <TableHead className="text-right">Zahllast</TableHead>
                <TableHead className="w-[12rem]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4].map((quarter) => {
                const period = periods.find((p) => p.quarter === quarter);
                const data = quarters[quarter - 1];
                if (!data) return null;
                const due = period?.due_date ?? vatDueDate(fiscalYear, quarter, extension);
                const overdue =
                  due < new Date().toISOString().slice(0, 10) &&
                  period?.status !== "paid" &&
                  period?.status !== "submitted";
                return (
                  <TableRow key={quarter}>
                    <TableCell className="font-medium">Q{quarter}</TableCell>
                    <TableCell className="num hidden text-muted-foreground sm:table-cell">
                      {period
                        ? `${formatDate(period.period_start)} – ${formatDate(period.period_end)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="num">
                      <span className={overdue ? "text-destructive" : undefined}>
                        {formatDate(due)}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right">{formatEur(data.outputTax)}</TableCell>
                    <TableCell className="num text-right">{formatEur(data.inputTax)}</TableCell>
                    <TableCell className="num hidden text-right text-muted-foreground md:table-cell">
                      {data.rcCount ? `± ${formatEur(data.rcTax)}` : "—"}
                    </TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatEur(data.due)}
                    </TableCell>
                    <TableCell>
                      {period ? (
                        <Select
                          value={period.status}
                          onValueChange={(value) =>
                            void updateStatus(period, value as TaxPeriod["status"])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TAX_STATUS_LABEL).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">Nicht angelegt</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      <GlassCard className="mt-6">
        <SectionTitle title="Jahresabschluss" hint="Grundlage für die Einkommensteuererklärung" />
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="label-caps">Betriebseinnahmen</dt>
            <dd className="num mt-1 text-lg font-semibold">{formatEur(year.incomeNet)}</dd>
          </div>
          <div>
            <dt className="label-caps">Betriebsausgaben</dt>
            <dd className="num mt-1 text-lg font-semibold">{formatEur(year.expenseNet)}</dd>
          </div>
          <div>
            <dt className="label-caps">Gewinn (EÜR)</dt>
            <dd className="num mt-1 text-lg font-semibold">{formatEur(year.profit)}</dd>
          </div>
          <div>
            <dt className="label-caps">USt-Saldo</dt>
            <dd className="num mt-1 text-lg font-semibold">{formatEur(year.vatDue)}</dd>
          </div>
        </dl>
      </GlassCard>
    </AppShell>
  );
}
