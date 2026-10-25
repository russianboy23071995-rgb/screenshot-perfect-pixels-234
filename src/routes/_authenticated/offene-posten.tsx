import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/finance/AppShell";
import { EmptyState, KpiCard } from "@/components/finance/GlassCard";
import { RecordPaymentForm, TransactionDetailSheet } from "@/components/finance/TransactionDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOpenItems } from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/offene-posten")({
  head: () => ({
    meta: [
      { title: "Offene Posten · Finanz-Cockpit" },
      { name: "description", content: "Freigegebene, noch nicht bezahlte Buchungen – Zahlung direkt nachtragen." },
      { property: "og:title", content: "Offene Posten · Finanz-Cockpit" },
      { property: "og:description", content: "Freigegebene, noch nicht bezahlte Buchungen – Zahlung direkt nachtragen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OffenePostenPage,
});

function OffenePostenPage() {
  const { data: items = [], isLoading } = useOpenItems();
  const [detailId, setDetailId] = useState<string | null>(null);
  const income = items.filter((t) => t.type === "income").reduce((s, t) => s + t.gross_cents, 0);
  const expense = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.gross_cents, 0);

  return (
    <AppShell title="Offene Posten" subtitle={`${items.length} noch nicht bezahlt · älteste zuerst`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Offene Forderungen" value={formatEur(income)} hint="Einnahmen, noch nicht erhalten" />
        <KpiCard label="Offene Verbindlichkeiten" value={formatEur(expense)} hint="Ausgaben, noch nicht bezahlt" />
      </div>
      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade offene Posten …</p>
        ) : items.length === 0 ? (
          <EmptyState title="Keine offenen Posten" description="Alle freigegebenen Buchungen sind bezahlt." />
        ) : (
          <div className="grid gap-3">
            {items.map((t) => (
              <div key={t.id} className="glass flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t.type === "income" ? "Einnahme" : "Ausgabe"}</Badge>
                    <p className="truncate font-medium">{t.counterparty || "Ohne Partner"}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.invoice_number ?? "—"} · Rechnung vom {formatDate(t.invoice_date)} ·{" "}
                    <span className="num font-medium text-foreground">{formatEur(t.gross_cents)}</span>
                  </p>
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setDetailId(t.id)}>
                    Details & Verlauf
                  </Button>
                </div>
                <RecordPaymentForm transaction={t} />
              </div>
            ))}
          </div>
        )}
      </div>
      <TransactionDetailSheet transactionId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
    </AppShell>
  );
}
