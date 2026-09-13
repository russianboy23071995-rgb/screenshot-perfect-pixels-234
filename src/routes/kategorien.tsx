import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { GlassCard, SectionTitle } from "@/components/finance/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/lib/app-state";
import {
  useCategories,
  useInvalidateFinance,
  useTransactions,
  type Category,
  type TxType,
} from "@/lib/finance";
import { formatEur } from "@/lib/money";

export const Route = createFileRoute("/kategorien")({
  head: () => ({
    meta: [
      { title: "Kategorien · Finanz-Cockpit" },
      {
        name: "description",
        content: "Einnahme- und Ausgabekategorien anlegen, umbenennen und deaktivieren.",
      },
      { property: "og:title", content: "Kategorien · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Eigene Kategorien für Einnahmen und Ausgaben verwalten.",
      },
    ],
  }),
  component: KategorienPage,
});

function CategoryList({ type, categories }: { type: TxType; categories: Category[] }) {
  const { fiscalYear } = useAppState();
  const { data: transactions = [] } = useTransactions(fiscalYear);
  const invalidate = useInvalidateFinance();

  async function rename(category: Category, name: string) {
    if (!name.trim() || name === category.name) return;
    const { error } = await supabase
      .from("categories")
      .update({ name: name.trim() })
      .eq("id", category.id);
    if (error) toast.error(error.message);
    else invalidate();
  }

  async function toggle(category: Category, active: boolean) {
    const { error } = await supabase.from("categories").update({ active }).eq("id", category.id);
    if (error) toast.error(error.message);
    else invalidate();
  }

  async function remove(category: Category) {
    const used = transactions.some((t) => t.category_id === category.id);
    if (used) {
      toast.error("Kategorie ist in Buchungen verwendet – bitte stattdessen deaktivieren.");
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", category.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Kategorie gelöscht.");
      invalidate();
    }
  }

  const list = categories.filter((c) => c.type === type);

  return (
    <GlassCard>
      <SectionTitle
        title={type === "income" ? "Einnahmen" : "Ausgaben"}
        hint={`${list.length} Kategorien`}
      />
      <ul className="divide-y">
        {list.map((category) => {
          const sum = transactions
            .filter((t) => t.category_id === category.id)
            .reduce((total, t) => total + t.net_cents, 0);
          return (
            <li key={category.id} className="flex items-center gap-3 py-3">
              <Input
                defaultValue={category.name}
                onBlur={(e) => void rename(category, e.target.value)}
                className="max-w-xs"
              />
              <span className="num ml-auto text-sm text-muted-foreground">{formatEur(sum)}</span>
              <Switch
                checked={category.active}
                onCheckedChange={(checked) => void toggle(category, checked)}
              />
              <Button variant="ghost" size="icon" onClick={() => void remove(category)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
        {list.length === 0 ? (
          <li className="py-3 text-sm text-muted-foreground">Noch keine Kategorien.</li>
        ) : null}
      </ul>
    </GlassCard>
  );
}

function KategorienPage() {
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState<TxType>("expense");

  async function create() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      type,
      color: "#1a1a1a",
      active: true,
      sort_order: categories.filter((c) => c.type === type).length + 1,
      is_demo: false,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Kategorie angelegt.");
    setName("");
    invalidate();
  }

  return (
    <AppShell title="Kategorien" subtitle="Struktur für Einnahmen und Ausgaben">
      <GlassCard>
        <SectionTitle title="Neue Kategorie" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-[14rem] flex-1 gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Software & Tools"
            />
          </div>
          <div className="grid gap-2">
            <Label>Typ</Label>
            <Select value={type} onValueChange={(v) => setType(v as TxType)}>
              <SelectTrigger className="w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Einnahme</SelectItem>
                <SelectItem value="expense">Ausgabe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void create()}>
            <Plus className="mr-2 size-4" /> Anlegen
          </Button>
        </div>
      </GlassCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CategoryList type="income" categories={categories} />
        <CategoryList type="expense" categories={categories} />
      </div>
    </AppShell>
  );
}
