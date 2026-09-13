import { FolderOpen, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GlassCard } from "@/components/finance/GlassCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useInvalidateFinance } from "@/lib/finance";
import {
  connectFolder,
  disconnectFolder,
  getConnectedFolder,
  getSyncOptions,
  isLocalSyncSupported,
  setSyncOptions,
  syncDocuments,
} from "@/lib/local-sync";

export function SyncPanel({ pendingCount }: { pendingCount: number }) {
  const invalidate = useInvalidateFinance();
  const [supported, setSupported] = useState(true);
  const [folder, setFolder] = useState<{ name: string; granted: boolean } | null>(null);
  const [byCategory, setByCategory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isLocalSyncSupported());
    setByCategory(getSyncOptions().groupExpensesByCategory);
    void getConnectedFolder().then(setFolder);
  }, []);

  async function handleConnect() {
    try {
      const name = await connectFolder();
      setFolder({ name, granted: true });
      toast.success(`Ordner „${name}“ verbunden.`);
    } catch {
      toast.error("Es wurde kein Ordner freigegeben.");
    }
  }

  async function handleSync(force: boolean) {
    setBusy(true);
    setProgress(null);
    try {
      const result = await syncDocuments({
        force,
        onProgress: (done, total) => setProgress(`${done} / ${total}`),
      });
      invalidate();
      if (result.written === 0 && result.failed === 0) {
        toast.success("Alle Belege sind bereits lokal archiviert.");
      } else {
        toast.success(
          `${result.written} Belege in „${result.folder}“ abgelegt${
            result.failed > 0 ? `, ${result.failed} fehlgeschlagen` : ""
          }.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Synchronisation fehlgeschlagen.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!supported) {
    return (
      <GlassCard className="p-5">
        <p className="label">Lokale Ablage</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Dieser Browser unterstützt den direkten Ordnerzugriff nicht. Nutze Chrome oder Edge am
          Rechner, um Belege automatisch in deinen Finanz-Ordner zu legen.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">Lokale Ablage</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {folder
              ? `Verbunden mit „${folder.name}“ · Struktur: Jahr / Monat / Einnahmen bzw. Ausgaben`
              : "Verbinde einen eigenen Ordner. Die App legt dort Kopien deiner Belege ab und löscht nie etwas."}
          </p>
          {folder && (
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingCount > 0
                ? `${pendingCount} Belege noch nicht lokal archiviert`
                : "Alle Belege lokal archiviert"}
              {progress ? ` · ${progress}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {folder ? (
            <>
              <Button onClick={() => void handleSync(false)} disabled={busy}>
                <RefreshCw className={`mr-2 size-4 ${busy ? "animate-spin" : ""}`} />
                Belege synchronisieren
              </Button>
              <Button variant="outline" onClick={() => void handleSync(true)} disabled={busy}>
                Alle erneut ablegen
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Ordner trennen"
                onClick={() => {
                  void disconnectFolder().then(() => {
                    setFolder(null);
                    toast.success("Ordner getrennt.");
                  });
                }}
              >
                <Unlink className="size-4" />
              </Button>
            </>
          ) : (
            <Button onClick={() => void handleConnect()}>
              <FolderOpen className="mr-2 size-4" /> Ordner verbinden
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
        <div>
          <p className="text-sm font-medium">Ausgaben nach Kategorien sortieren</p>
          <p className="text-xs text-muted-foreground">
            Zusätzliche Unterordner je Kategorie innerhalb von „Ausgaben“.
          </p>
        </div>
        <Switch
          checked={byCategory}
          onCheckedChange={(value) => {
            setByCategory(value);
            setSyncOptions({ groupExpensesByCategory: value });
          }}
        />
      </div>
    </GlassCard>
  );
}
