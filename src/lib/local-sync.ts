import { supabase } from "@/integrations/supabase/client";
import { MONTHS_DE } from "@/lib/money";

/* ------------------------------------------------------------------ *
 * Lokale Beleg-Synchronisation (Phase 3)
 *
 * Nutzt die Datei-System-Schnittstelle des Browsers (File System Access
 * API). Der Zugriff erfolgt ausschließlich auf einen Ordner, den der
 * Benutzer selbst ausgewählt und freigegeben hat. Originaldateien in der
 * App werden nie gelöscht, im lokalen Ordner wird nur geschrieben.
 * ------------------------------------------------------------------ */

const DB_NAME = "finanz-cockpit";
const STORE = "handles";
const HANDLE_KEY = "root-folder";
const OPTION_KEY = "finanz-sync-categories";

export interface SyncOptions {
  /** Ausgaben zusätzlich nach Kategorien ablegen */
  groupExpensesByCategory: boolean;
}

export interface SyncResult {
  written: number;
  skipped: number;
  failed: number;
  folder: string;
}

interface FileSystemDirectoryHandleLike {
  name: string;
  kind: "directory";
  queryPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export function isLocalSyncSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function getSyncOptions(): SyncOptions {
  if (typeof window === "undefined") return { groupExpensesByCategory: false };
  return { groupExpensesByCategory: window.localStorage.getItem(OPTION_KEY) === "1" };
}

export function setSyncOptions(options: SyncOptions): void {
  window.localStorage.setItem(OPTION_KEY, options.groupExpensesByCategory ? "1" : "0");
}

/* --------------------------- Handle-Speicher --------------------------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(): Promise<unknown> {
  const db = await openDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/* ----------------------------- Verbindung ----------------------------- */

export async function connectFolder(): Promise<string> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (o?: { mode?: "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: "readwrite", id: "finanz-belege" });
  await idbSet(handle);
  return handle.name;
}

export async function getConnectedFolder(): Promise<{ name: string; granted: boolean } | null> {
  if (!isLocalSyncSupported()) return null;
  try {
    const handle = (await idbGet()) as FileSystemDirectoryHandleLike | undefined;
    if (!handle) return null;
    const state = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    return { name: handle.name, granted: state === "granted" };
  } catch {
    return null;
  }
}

export async function disconnectFolder(): Promise<void> {
  await idbClear();
}

async function requireHandle(): Promise<FileSystemDirectoryHandleLike> {
  const handle = (await idbGet()) as FileSystemDirectoryHandleLike | undefined;
  if (!handle) throw new Error("Kein lokaler Ordner verbunden.");
  const state = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (state !== "granted") {
    const next = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "denied";
    if (next !== "granted") throw new Error("Zugriff auf den Ordner wurde nicht erlaubt.");
  }
  return handle;
}

/* --------------------------- Namensbildung --------------------------- */

export function sanitizeSegment(value: string): string {
  return (
    value
      .normalize("NFC")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Unbenannt"
  );
}

export function monthFolder(dateIso: string): string {
  const date = new Date(dateIso);
  const index = Number.isNaN(date.getTime()) ? 0 : date.getMonth();
  return `${String(index + 1).padStart(2, "0")} ${MONTHS_DE[index]}`;
}

export function buildFileName(input: {
  date: string;
  counterparty?: string | null;
  reference?: string | null;
  grossCents?: number | null;
  extension: string;
}): string {
  const parts = [input.date.slice(0, 10)];
  if (input.counterparty) parts.push(sanitizeSegment(input.counterparty).replace(/ /g, "-"));
  if (input.reference) parts.push(sanitizeSegment(input.reference).replace(/ /g, "-"));
  if (input.grossCents != null && input.grossCents > 0) {
    parts.push(`${Math.floor(input.grossCents / 100)}-${String(input.grossCents % 100).padStart(2, "0")}EUR`);
  }
  const ext = input.extension.replace(/^\.*/, "").toLowerCase() || "pdf";
  return `${parts.join("_")}.${ext}`;
}

function extensionOf(filename: string, fileType: string): string {
  const fromName = filename.includes(".") ? filename.split(".").pop()! : "";
  if (fromName) return fromName;
  if (fileType.includes("pdf")) return "pdf";
  if (fileType.includes("png")) return "png";
  return "jpg";
}

/* ---------------------------- Synchronisation ---------------------------- */

interface SyncDocument {
  id: string;
  original_filename: string;
  file_type: string;
  storage_path: string;
  upload_date: string;
  transaction_id: string | null;
  local_path: string | null;
  extracted_data: Record<string, unknown> | null;
}

interface SyncTransaction {
  id: string;
  type: "income" | "expense";
  invoice_date: string;
  counterparty: string;
  invoice_number: string | null;
  gross_cents: number;
  category_id: string | null;
}

/** Zielpfad eines Belegs innerhalb des freigegebenen Hauptordners. */
export function buildTargetPath(
  document: SyncDocument,
  transaction: SyncTransaction | undefined,
  categoryName: string | undefined,
  options: SyncOptions,
): { segments: string[]; filename: string } {
  const extracted = document.extracted_data ?? {};
  const date =
    transaction?.invoice_date ??
    (typeof extracted["invoice_date"] === "string" ? (extracted["invoice_date"] as string) : null) ??
    document.upload_date;
  const year = String(new Date(date).getFullYear() || new Date().getFullYear());
  const extension = extensionOf(document.original_filename, document.file_type);

  const counterparty =
    transaction?.counterparty ??
    (typeof extracted["counterparty"] === "string" ? (extracted["counterparty"] as string) : null);
  const reference =
    transaction?.invoice_number ??
    (typeof extracted["invoice_number"] === "string" ? (extracted["invoice_number"] as string) : null);
  const grossCents =
    transaction?.gross_cents ??
    (typeof extracted["gross"] === "number" ? Math.round((extracted["gross"] as number) * 100) : null);

  const filename = buildFileName({ date, counterparty, reference, grossCents, extension });

  if (!transaction) {
    return { segments: [year, "Unsortiert"], filename };
  }

  const kind = transaction.type === "income" ? "Einnahmen" : "Ausgaben";
  const segments = [year, monthFolder(date), kind];
  if (transaction.type === "expense" && options.groupExpensesByCategory) {
    segments.push(sanitizeSegment(categoryName ?? "Sonstiges"));
  }
  return { segments, filename };
}

async function ensureDirectory(
  root: FileSystemDirectoryHandleLike,
  segments: string[],
): Promise<FileSystemDirectoryHandleLike> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

/**
 * Legt alle noch nicht synchronisierten Belege im freigegebenen Ordner ab.
 * Bereits abgelegte Belege werden übersprungen (kein erneutes Schreiben),
 * Originale werden niemals gelöscht.
 */
export async function syncDocuments(opts?: {
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<SyncResult> {
  const root = await requireHandle();
  const options = getSyncOptions();

  const [{ data: docs, error: docError }, { data: txs }, { data: cats }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, original_filename, file_type, storage_path, upload_date, transaction_id, local_path, extracted_data",
      ),
    supabase.from("transactions").select("id, type, invoice_date, counterparty, invoice_number, gross_cents, category_id"),
    supabase.from("categories").select("id, name"),
  ]);
  if (docError) throw docError;

  const documents = (docs ?? []) as unknown as SyncDocument[];
  const transactions = new Map(
    ((txs ?? []) as unknown as SyncTransaction[]).map((t) => [t.id, t] as const),
  );
  const categories = new Map(
    ((cats ?? []) as unknown as { id: string; name: string }[]).map((c) => [c.id, c.name] as const),
  );

  const pending = documents.filter((d) => opts?.force || !d.local_path);
  let written = 0;
  let failed = 0;
  let done = 0;

  for (const document of pending) {
    try {
      const transaction = document.transaction_id
        ? transactions.get(document.transaction_id)
        : undefined;
      const categoryName = transaction?.category_id ? categories.get(transaction.category_id) : undefined;
      const target = buildTargetPath(document, transaction, categoryName, options);

      const { data: signed, error: signError } = await supabase.storage
        .from("belege")
        .createSignedUrl(document.storage_path, 300);
      if (signError || !signed) throw signError ?? new Error("Datei nicht verfügbar");
      const response = await fetch(signed.signedUrl);
      if (!response.ok) throw new Error("Datei konnte nicht geladen werden");
      const blob = await response.blob();

      const directory = await ensureDirectory(root, target.segments);
      const fileHandle = await directory.getFileHandle(target.filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      const localPath = [root.name, ...target.segments, target.filename].join("/");
      await supabase
        .from("documents")
        .update({ sync_status: "synced", local_path: localPath, synced_at: new Date().toISOString() })
        .eq("id", document.id);
      written += 1;
    } catch {
      failed += 1;
      await supabase.from("documents").update({ sync_status: "error" }).eq("id", document.id);
    }
    done += 1;
    opts?.onProgress?.(done, pending.length);
  }

  return {
    written,
    failed,
    skipped: documents.length - pending.length,
    folder: root.name,
  };
}
