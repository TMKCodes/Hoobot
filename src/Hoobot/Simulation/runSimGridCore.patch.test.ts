import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGridVariantPatch, estimateGridVariantCount, validateGridPayload } from "./runSimGridCore";

describe("buildGridVariantPatch", () => {
  it("combines all axis fields for axis-grid-from-ui (minimal templates)", () => {
    const raw = {
      includeBaseline: true,
      maxVariants: 2000,
      axes: [
        { name: "stopLoss.pnl", range: { from: -5.5, to: -4.5, step: 0.25 }, template: { exchanges: [{ name: "binance", symbols: [{ stopLoss: { pnl: "$value" } }] }] } },
        { name: "takeProfit.minimum", range: { from: 2.5, to: 3.5, step: 0.5 }, template: { exchanges: [{ name: "binance", symbols: [{ takeProfit: { minimum: "$value" } }] }] } },
        { name: "takeProfit.drop", range: { from: 0.15, to: 0.25, step: 0.05 }, template: { exchanges: [{ name: "binance", symbols: [{ takeProfit: { drop: "$value" } }] }] } },
        { name: "takeProfit.limit", range: { from: 0.15, to: 0.25, step: 0.05 }, template: { exchanges: [{ name: "binance", symbols: [{ takeProfit: { limit: "$value" } }] }] } },
        { name: "takeProfit.forceAfterDrop", range: { from: 0.15, to: 0.25, step: 0.05 }, template: { exchanges: [{ name: "binance", symbols: [{ takeProfit: { forceAfterDrop: "$value" } }] }] } },
        { name: "takeProfit.forceMinProfit", range: { from: 0.75, to: 1.25, step: 0.25 }, template: { exchanges: [{ name: "binance", symbols: [{ takeProfit: { forceMinProfit: "$value" } }] }] } },
      ],
    };
    const validated = validateGridPayload(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const p1 = buildGridVariantPatch(validated.data, 1) as {
      exchanges?: Array<{ symbols?: Array<{ stopLoss?: { pnl?: number }; takeProfit?: Record<string, number> }> }>;
    };
    const p2 = buildGridVariantPatch(validated.data, 2) as typeof p1;
    const sym1 = p1.exchanges?.[0]?.symbols?.[0];
    const sym2 = p2.exchanges?.[0]?.symbols?.[0];
    expect(sym1?.stopLoss?.pnl).toBe(-5.5);
    expect(sym1?.takeProfit?.minimum).toBe(2.5);
    expect(sym1?.takeProfit?.drop).toBe(0.15);
    expect(sym1?.takeProfit?.limit).toBe(0.15);
    expect(sym1?.takeProfit?.forceAfterDrop).toBe(0.15);
    expect(sym1?.takeProfit?.forceMinProfit).toBe(0.75);

    expect(sym2?.takeProfit?.forceMinProfit).toBe(1);
    expect(sym2?.takeProfit?.minimum).toBe(2.5);
    expect(JSON.stringify(p1)).not.toBe(JSON.stringify(p2));
  });

  it("validates extreme axis grids under maxVariants", () => {
    const root = resolve(__dirname, "../../../");
    for (const rel of [
      "settings/axis-grid-extreme.json",
      "settings/axis-grid-extreme-mega.json",
      "settings/axis-grid-extreme-flags.json",
    ]) {
      const raw = JSON.parse(readFileSync(join(root, rel), "utf-8"));
      const validated = validateGridPayload(raw);
      expect(validated.ok).toBe(true);
      if (!validated.ok) continue;
      const n = estimateGridVariantCount(validated.data);
      expect(n).toBeGreaterThan(50);
      const max = typeof raw.maxVariants === "number" ? raw.maxVariants : 500;
      expect(n).toBeLessThanOrEqual(max);
    }
  });
});
