import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileText,
  BarChart3,
  Landmark,
  Tags,
  Settings as SettingsIcon,
  Menu,
  LogOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAppState } from "@/lib/app-state";
import { useSettings } from "@/lib/finance";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/einnahmen", label: "Einnahmen", icon: TrendingUp },
  { to: "/ausgaben", label: "Ausgaben", icon: TrendingDown },
  { to: "/belege", label: "Belege", icon: FileText },
  { to: "/auswertungen", label: "Auswertungen", icon: BarChart3 },
  { to: "/steuern", label: "Steuern", icon: Landmark },
  { to: "/kategorien", label: "Kategorien", icon: Tags },
  { to: "/einstellungen", label: "Einstellungen", icon: SettingsIcon },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { data: settings } = useSettings();
  return (
    <div className="px-3 py-1">
      <p className="font-display text-base leading-tight font-semibold">
        {settings?.company_name ?? "Finanz-Cockpit"}
      </p>
      <p className="label-caps mt-1">Finanz-Cockpit</p>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { fiscalYear, setFiscalYear, years } = useAppState();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 rounded-none border-y-0 border-l-0 p-4 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto px-3">
          <p className="label-caps">Geschäftsjahr</p>
          <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
            <SelectTrigger className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <div className="mt-6 flex flex-col gap-6">
                <Brand />
                <NavLinks onNavigate={() => setMobileOpen(false)} />
                <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>

        <main className="fade-in-up mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
