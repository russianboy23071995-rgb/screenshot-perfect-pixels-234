import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GlassCard } from "@/components/finance/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Anmelden · Finanz-Cockpit" },
      {
        name: "description",
        content: "Melde dich an, um deine Einnahmen, Ausgaben und Belege zu sehen.",
      },
      { property: "og:title", content: "Anmelden · Finanz-Cockpit" },
      {
        property: "og:description",
        content: "Geschützter Zugang zu deinem persönlichen Finanz-Cockpit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      toast.error("Bitte E-Mail und ein Passwort mit mindestens 6 Zeichen eingeben.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Bitte bestätige die E-Mail, die wir dir gesendet haben.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="fade-in-up w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Finanz-Cockpit</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Deine Zahlen sind privat – bitte melde dich an.
          </p>
        </div>
        <GlassCard>
          {sent ? (
            <p className="text-sm text-muted-foreground">
              Wir haben dir eine Bestätigungs-E-Mail geschickt. Öffne den Link darin, danach kannst
              du dich anmelden.
            </p>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
              </div>
              <Button onClick={() => void submit()} disabled={busy}>
                {mode === "signup" ? "Konto anlegen" : "Anmelden"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup"
                  ? "Ich habe schon ein Konto – anmelden"
                  : "Noch kein Konto? Jetzt anlegen"}
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
