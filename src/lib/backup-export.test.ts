import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { authorizeExport, exportData, exportFile, readExportTable, EXPORT_TABLES } from "./backup-export.server";

const owner = "00000000-0000-4000-8000-000000000001";
// Test-only fixture, not a configured credential.
const config = { owner, key: "unit-test-export-credential" };
const request = (path = "", authorized = true) => new Request(`https://example.test/api/public/export${path}`, { headers: authorized ? { "x-export-key": config.key } : {} });

function mockClient(rows: Record<string, unknown>[] = [], count = rows.length) {
  const filters: unknown[][] = [];
  const orders: string[] = [];
  const ranges: number[][] = [];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((...args: unknown[]) => { filters.push(args); return query; }),
    order: vi.fn((column: string) => { orders.push(column); return query; }),
    range: vi.fn(async (start: number, end: number) => { ranges.push([start, end]); return { data: rows.slice(start, end + 1), error: null, count }; }),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
  };
  const download = vi.fn(async () => ({ data: new Blob(["original-file"]), error: null }));
  const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient<Database>;
  return { client, query, filters, orders, ranges, download };
}

describe("read-only backup export rules", () => {
  it("returns 503 for both routes without EXPORT_API_KEY before any reads", async () => {
    const getClient = vi.fn();
    expect((await exportData(request(), { owner }, getClient)).status).toBe(503);
    expect((await exportFile(request("/datei?id=" + owner), { owner }, getClient)).status).toBe(503);
    expect(getClient).not.toHaveBeenCalled();
  });
  it("rejects missing and wrong keys with 401", () => {
    expect(authorizeExport(request("", false), config)?.status).toBe(401);
    expect(authorizeExport(request(), { ...config, key: "different-test-credential" })?.status).toBe(401);
    expect(authorizeExport(request(), config)).toBeNull();
  });
  it("exports exactly the seven requested tables, all columns, including tests", async () => {
    const mock = mockClient([{ id: owner, is_demo: true, is_test: true, extra_column: "preserved" }]);
    const response = await exportData(request(), config, async () => mock.client);
    const body = await response.json();
    expect(body.schema_version).toBe(1);
    expect(body.owner_user_id).toBe(owner);
    expect(Object.keys(body.tables)).toEqual([...EXPORT_TABLES]);
    expect(body.tables.transactions[0]).toEqual({ id: owner, is_demo: true, is_test: true, extra_column: "preserved" });
    expect(mock.filters).toEqual(EXPORT_TABLES.map(() => ["user_id", owner]));
    expect(mock.query.select.mock.calls.every(([columns]) => columns === "*")).toBe(true);
    expect(mock.orders.filter((column) => column === "created_at")).toHaveLength(5);
    expect(mock.orders.filter((column) => column === "updated_at")).toHaveLength(2);
  });
  it("does not silently truncate data after 1000 rows", async () => {
    const mock = mockClient(Array.from({ length: 1001 }, (_, id) => ({ id })));
    expect(await readExportTable(mock.client, "transactions", owner)).toHaveLength(1001);
    expect(mock.ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("permits 50,000 rows but returns 500 above 50,000", async () => {
    const allowed = mockClient(Array.from({ length: 50_000 }, (_, id) => ({ id })));
    expect(await readExportTable(allowed.client, "transactions", owner)).toHaveLength(50_000);
    const oversized = mockClient([{ id: 1 }], 50_001);
    const response = await exportData(request(), config, async () => oversized.client);
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("50.000");
  });
  it("returns original file bytes, type, filename and stored checksum for the owner only", async () => {
    const mock = mockClient([{ storage_path: `${owner}/receipt.pdf`, original_filename: "Rechnung ä.pdf", file_type: "application/pdf", sha256: "a".repeat(64) }]);
    const response = await exportFile(request(`/datei?id=${owner}`), config, async () => mock.client);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("original-file");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("Rechnung%20%C3%A4.pdf");
    expect(response.headers.get("x-sha256")).toBe("a".repeat(64));
    expect(mock.filters).toEqual([["id", owner], ["user_id", owner]]);
  });
  it("returns 404 for unknown or non-owner document paths without downloading", async () => {
    for (const rows of [[], [{ storage_path: "another-owner/receipt.pdf" }]]) {
      const mock = mockClient(rows);
      expect((await exportFile(request(`/datei?id=${owner}`), config, async () => mock.client)).status).toBe(404);
      expect(mock.download).not.toHaveBeenCalled();
    }
  });
  it("validates document IDs before accessing storage", async () => {
    const getClient = vi.fn();
    expect((await exportFile(request("/datei?id=invalid"), config, getClient)).status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });
});