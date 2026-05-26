import fs from "fs";
import path from "path";
import { maskConfigSecretsForExport, type ConfigOptions } from "../Utilities/Args";
import type { SimulationApiResult } from "./runSimulationCore";

/** Levylle tallennettu grid-variantin sim-tulos + parametrit (yhteenveto / Käytä simulaatiossa). */
export type GridVariantCachePayload = {
  savedAt: string;
  variantIndex: number;
  /** Grid-axis patch (sama kuin grid-results-rivillä). */
  variant: unknown;
  /** Litteät avaimet UI:lle ja nopeaan palautukseen. */
  values: Record<string, unknown>;
  gridPath: string;
  simulationHistoryYears?: number;
  baselineOptionsSnapshotFile?: string;
  baselineConfig?: ConfigOptions;
  result: SimulationApiResult;
};

export function flattenLeafValues(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (node: unknown, prefix: string): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${prefix}[${i}]`);
      }
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        walk(obj[key], next);
      }
      return;
    }
    if (!prefix) return;
    out[prefix] = node;
  };
  walk(input, "");
  return out;
}

export function buildGridVariantCacheValues(
  variant: unknown,
  opts?: { variantIndex?: number; baselineOptionsSnapshotFile?: string }
): Record<string, unknown> {
  const flat = flattenLeafValues(variant ?? {});
  if (
    typeof opts?.variantIndex === "number" &&
    opts.variantIndex === 0 &&
    typeof opts.baselineOptionsSnapshotFile === "string" &&
    opts.baselineOptionsSnapshotFile.length > 0
  ) {
    flat["baseline.optionsSnapshotFile"] = opts.baselineOptionsSnapshotFile;
  }
  return flat;
}

/** Vanha cache (vain result) tai puuttuvat parametrit — täydennetään seuraavalla osumalla. */
export function gridVariantCacheNeedsMetadata(payload: Partial<GridVariantCachePayload>): boolean {
  if (typeof payload.gridPath !== "string" || payload.gridPath.trim() === "") return true;
  if (payload.variant === undefined) return true;
  if (payload.values == null || typeof payload.values !== "object") return true;
  const patchKeys =
    payload.variant != null && typeof payload.variant === "object"
      ? Object.keys(payload.variant as Record<string, unknown>).length
      : 0;
  const valueKeys = Object.keys(payload.values).length;
  if (patchKeys > 0 && valueKeys === 0) return true;
  if (payload.variantIndex === 0) {
    const hasBaseline =
      (payload.baselineConfig != null && typeof payload.baselineConfig === "object") ||
      (typeof payload.baselineOptionsSnapshotFile === "string" &&
        payload.baselineOptionsSnapshotFile.length > 0);
    if (!hasBaseline) return true;
  }
  return false;
}

export function writeGridVariantCacheFile(
  variantCacheFile: string,
  opts: {
    variantIndex: number;
    variant: unknown;
    gridPath: string;
    simulationHistoryYears?: number;
    baselineOptionsSnapshotFile?: string;
    baselineConfig: ConfigOptions;
    result: SimulationApiResult;
  }
): void {
  try {
    const variant = opts.variant ?? {};
    const payload: GridVariantCachePayload = {
      savedAt: new Date().toISOString(),
      variantIndex: opts.variantIndex,
      variant,
      values: buildGridVariantCacheValues(variant, {
        variantIndex: opts.variantIndex,
        baselineOptionsSnapshotFile: opts.baselineOptionsSnapshotFile,
      }),
      gridPath: opts.gridPath,
      simulationHistoryYears: opts.simulationHistoryYears,
      baselineOptionsSnapshotFile: opts.baselineOptionsSnapshotFile,
      baselineConfig: maskConfigSecretsForExport(
        JSON.parse(JSON.stringify(opts.baselineConfig)) as ConfigOptions
      ),
      result: opts.result,
    };
    const dir = path.dirname(variantCacheFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(variantCacheFile, JSON.stringify(payload, null, 2));
  } catch {
    // ignore cache write errors
  }
}

export function readGridVariantCacheFile(
  variantCacheFile: string
): Partial<GridVariantCachePayload> | null {
  try {
    if (!fs.existsSync(variantCacheFile)) return null;
    const raw = fs.readFileSync(variantCacheFile, "utf-8");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<GridVariantCachePayload>;
  } catch {
    return null;
  }
}
