import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTOR_LABEL,
  BOOKING_STATUS_LABEL,
  useAuditLog,
  useCategories,
  type Transaction,
} from "@/lib/finance";
import { formatDate, formatEur } from "@/lib/money";

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditHistory({ entityId }: { entityId: string }) {
  const { data: entries = [], isLoading } = useAuditLog({ entityId });
  if (isLoading) return <p className="text-sm text-muted-foreground">Lade Verlauf …</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Kein Verlauf vorhanden.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl border bg-background/50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{AUDIT_ACTION_LABEL[e.action]}</Badge>
            <Badge variant="outline">{AUDIT_ACTOR_LABEL[e.actor]}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(e.created_at).toLocaleString("de-DE")}
            </span>
          </div>
          {e.note && <p className="mt-1 text-xs">{e.note}</p>}
          {e.action === "geaendert" && e.new_data && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {Object.keys(e.new_data).map((k) => (
                <li key={k} className="break-all">
                  <span className="text-muted-foreground">{k}: </span>
                  {formatValue(e.old_data?.[k])} → {formatValue(e.new_data?.[k])}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TransactionDetailSheet({
  transactionId,
  onOpenChange,
}: {
  transactionId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: categories = [] } = useCategories();
  const { data: tx } = useQuery({
    queryKey: ["transactions", "detail", transactionId],
    enabled: !!transactionId,
    queryFn: async (): Promise<Transaction | null> => {
      const { data } = await supabase.from("transactions").select("*").eq("id", transactionId!).maybeSingle();
      return (data ?? null) as unknown as Transaction | null;
    },
  });

  return (
    <Sheet open={transactionId != null} onOpenChange={onOpenChange}>
      <SheetContent className="glass-strong w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Buchung & Verlauf</SheetTitle>
          <SheetDescription>Nur lesen – das Protokoll kann nicht geändert werden.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-4 pb-6">
          {tx ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border bg-background/50 p-3 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant="outline">{BOOKING_STATUS_LABEL[tx.booking_status]}</Badge>
              </dd>
              <dt className="text-muted-foreground">Partner</dt>
              <dd className="truncate">{tx.counterparty || "—"}</dd>
              <dt className="text-muted-foreground">Rechnungsnr.</dt>
              <dd>{tx.invoice_number ?? "—"}</dd>
              <dt className="text-muted-foreground">Rechnungsdatum</dt>
              <dd>{formatDate(tx.invoice_date)}</dd>
              <dt className="text-muted-foreground">Zahldatum</dt>
              <dd>{tx.payment_date ? formatDate(tx.payment_date) : "—"}</dd>
              <dt className="text-muted-foreground">Kategorie</dt>
              <dd>{categories.find((c) => c.id === tx.category_id)?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Netto / USt / Brutto</dt>
              <dd className="num">
                {formatEur(tx.net_cents)} / {formatEur(tx.tax_cents)} / {formatEur(tx.gross_cents)}
              </dd>
              {tx.currency !== "EUR" && (
                <>
                  <dt className="text-muted-foreground">Original ({tx.currency})</dt>
                  <dd className="num">{((tx.original_gross_cents ?? 0) / 100).toFixed(2)}</dd>
                </>
              )}
              {tx.reverse_charge && (
                <>
                  <dt className="text-muted-foreground">Reverse Charge</dt>
                  <dd>§ 13b UStG</dd>
                </>
              )}
            </dl>
          ) : transactionId ? (
            <p className="text-sm text-muted-foreground">Buchung nicht gefunden (evtl. gelöschter Entwurf).</p>
          ) : null}
          <div>
            <p className="label-caps mb-2">Verlauf</p>
            {transactionId && <AuditHistory entityId={transactionId} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
