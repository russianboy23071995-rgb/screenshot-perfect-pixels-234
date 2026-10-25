import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/finance/AppShell";
import { EmptyState } from "@/components/finance/GlassCard";
import { TransactionDetailSheet } from "@/components/finance/TransactionDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTOR_LABEL,
  useAuditLog,
  type AuditAction,
  type AuditActor,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/protokoll")({
  head: () => ({
    meta: [
      { title: "Protokoll · Finanz-Cockpit" },
      { name: "description", content: "Unveränderbares Protokoll aller Buchungs- und Belegvorgänge." },
      { property: "og:title", content: "Protokoll · Finanz-Cockpit" },
      { property: "og:description", content: "Unveränderbares Protokoll aller Buchungs- und Belegvorgänge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProtokollPage,
});

function ProtokollPage() {
  const { data: entries = [], isLoading } = useAuditLog();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState<"all" | AuditAction>("all");
  const [actor, setActor] = useState<"all" | AuditActor>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        const day = e.created_at.slice(0, 10);
        return (
          (!from || day >= from) &&
          (!to || day <= to) &&
          (action === "all" || e.action === action) &&
          (actor === "all" || e.actor === actor)
        );
      }),
    [entries, from, to, action, actor],
  );

  return (
    <AppShell title="Protokoll" subtitle={`${filtered.length} Einträge · nur lesen`}>
      <div className="glass mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-1">
          <span className="label-caps">Von</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <span className="label-caps">Bis</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Select value={action} onValueChange={(v) => setAction(v as typeof action)}>
          <SelectTrigger className="w-[12rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Aktionen</SelectItem>
            {Object.entries(AUDIT_ACTION_LABEL).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={(v) => setActor(v as typeof actor)}>
          <SelectTrigger className="w-[10rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Akteure</SelectItem>
            {Object.entries(AUDIT_ACTOR_LABEL).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade Protokoll …</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Keine Einträge" description="Für diese Filter gibt es keine Protokolleinträge." />
      ) : (
        <div className="glass overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Akteur</TableHead>
                <TableHead>Objekt</TableHead>
                <TableHead>Notiz</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const txId =
                  e.entity_type === "transaction"
                    ? e.entity_id
                    : ((e.new_data?.["transaction_id"] ?? e.old_data?.["transaction_id"]) as string | undefined) ?? null;
                return (
                  <TableRow
                    key={e.id}
                    className={txId ? "cursor-pointer" : ""}
                    onClick={() => txId && setOpenId(txId)}
                  >
                    <TableCell className="num whitespace-nowrap">{new Date(e.created_at).toLocaleString("de-DE")}</TableCell>
                    <TableCell><Badge variant="secondary">{AUDIT_ACTION_LABEL[e.action]}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{AUDIT_ACTOR_LABEL[e.actor]}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.entity_type === "transaction" ? "Buchung" : "Beleg"} · {e.entity_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-[24rem] truncate text-xs">{e.note ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <TransactionDetailSheet transactionId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </AppShell>
  );
}
