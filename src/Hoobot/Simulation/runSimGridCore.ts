import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  parseArgsSimulate,
  validateOptions,
  findProjectRoot,
  getSimulateOptionsFilePath,
  maskConfigSecretsForExport,
  symbolsActiveForTrading,
  type ConfigOptions,
} from "../Utilities/Args";
import {
  gridVariantCacheNeedsMetadata,
  readGridVariantCacheFile,
  writeGridVariantCacheFile,
} from "./gridVariantCache";
import {
  loadSimulationPreload,
  logSimulationProgressToConsole,
  runSimulationWithConfig,
  type SimulationApiResult,
  type SimulationProgress,
} from "./runSimulationCore";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** Syvä yhdistäminen: taulukot indeksikohtaisesti (sama pituus kuin base). */
export function deepMergeConfig(a: unknown, b: unknown): unknown {
  if (b === undefined || b === null) return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (a as unknown[]).map((item, i) =>
      i < (b as unknown[]).length ? deepMergeConfig(item, (b as unknown[])[i]) : item
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      const bk = b[k];
      const ak = (a as Record<string, unknown>)[k];
      if (k in a) {
        (out as Record<string, unknown>)[k] = deepMergeConfig(ak, bk);
      } else {
        (out as Record<string, unknown>)[k] = bk;
      }
    }
    return out;
  }
  return b;
}

export type GridPayload = {
  simulationHistoryYears?: number;
  variants?: unknown[];
  axes?: Array<{
    name?: string;
    values?: unknown[];
    range?: { from: number; to: number; step: number };
    template?: unknown;
  }>;
  includeBaseline?: boolean;
  maxVariants?: number;
};

function replaceTemplateValue(node: unknown, value: number): unknown {
  if (node === "$value") return value;
  if (Array.isArray(node)) return node.map((x) => replaceTemplateValue(x, value));
  if (isPlainObject(node)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node)) {
      out[k] = replaceTemplateValue((node as Record<string, unknown>)[k], value);
    }
    return out;
  }
  return node;
}

function buildAxisValues(
  axis: NonNullable<GridPayload["axes"]>[number]
): { ok: true; values: unknown[] } | { ok: false; error: string } {
  if (Array.isArray(axis.values) && axis.values.length > 0) {
    return { ok: true, values: axis.values };
  }
  if (axis.range && isPlainObject(axis.range)) {
    const from = Number(axis.range.from);
    const to = Number(axis.range.to);
    const step = Number(axis.range.step);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0) {
      return { ok: false, error: "range.from/to/step pitää olla numeroita ja step > 0." };
    }
    if (to < from) {
      return { ok: false, error: "range.to ei voi olla pienempi kuin range.from." };
    }
    const count = Math.floor((to - from) / step) + 1;
    if (count <= 0 || count > 2000) {
      return { ok: false, error: `range tuottaa virheellisen määrän arvoja (${count}).` };
    }
    const vals: number[] = [];
    for (let i = 0; i < count; i++) {
      const raw = from + i * step;
      const rounded = Number(raw.toFixed(10));
      if (rounded > to + 1e-10) break;
      vals.push(rounded);
    }
    if (vals.length === 0) {
      return { ok: false, error: "range ei tuottanut yhtään arvoa." };
    }
    if (axis.template != null) {
      const mapped = vals.map((v) => replaceTemplateValue(axis.template, v));
      return { ok: true, values: mapped };
    }
    const mapped = vals.map((v) => ({ value: v }));
    return { ok: true, values: mapped };
  }
  return { ok: false, error: "Akselilta puuttuu values tai range." };
}

export function validateGridPayload(grid: unknown): { ok: true; data: GridPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(grid)) {
    return { ok: false, errors: ["Gridin juuren pitää olla JSON-objekti."] };
  }
  const g = grid as Record<string, unknown>;
  if ("simulationHistoryYears" in g) {
    const y = g.simulationHistoryYears;
    if (typeof y !== "number" || !Number.isFinite(y) || y < 0) {
      errors.push("simulationHistoryYears: oltava ei-negatiivinen numero (tai jätä pois).");
    }
  }
  if ("variants" in g && g.variants !== undefined) {
    if (!Array.isArray(g.variants)) {
      errors.push("variants: oltava taulukko.");
    } else {
      g.variants.forEach((v, i) => {
        if (v !== null && !isPlainObject(v)) {
          errors.push(`variants[${i}]: oltava objekti tai tyhjä {}.`);
        }
      });
    }
  }
  if ("axes" in g && g.axes !== undefined) {
    if (!Array.isArray(g.axes)) {
      errors.push("axes: oltava taulukko.");
    } else {
      g.axes.forEach((ax, i) => {
        if (!isPlainObject(ax)) {
          errors.push(`axes[${i}]: oltava objekti (esim. {"name":"x","values":[...]}).`);
          return;
        }
        const axisObj = ax as {
          values?: unknown[];
          range?: { from?: unknown; to?: unknown; step?: unknown };
          template?: unknown;
        };
        const hasValues = Array.isArray(axisObj.values) && axisObj.values.length > 0;
        const hasRange = axisObj.range != null && typeof axisObj.range === "object";
        if (!hasValues && !hasRange) {
          errors.push(`axes[${i}]: anna joko values[] tai range{from,to,step}.`);
          return;
        }
        if (hasValues && hasRange) {
          errors.push(`axes[${i}]: käytä joko values tai range, ei molempia.`);
          return;
        }
        if (hasValues) {
          axisObj.values!.forEach((v, j) => {
            if (v !== null && !isPlainObject(v)) {
              errors.push(`axes[${i}].values[${j}]: oltava objekti tai tyhjä {}.`);
            }
          });
        }
        if (hasRange) {
          const r = axisObj.range!;
          const from = Number(r.from);
          const to = Number(r.to);
          const step = Number(r.step);
          if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0) {
            errors.push(`axes[${i}].range: from/to/step oltava numeroita ja step > 0.`);
          } else if (to < from) {
            errors.push(`axes[${i}].range: to ei voi olla pienempi kuin from.`);
          }
          if (axisObj.template !== undefined && !isPlainObject(axisObj.template)) {
            errors.push(`axes[${i}].template: oltava objekti (käytä "$value" placeholderia).`);
          }
        }
      });
    }
  }
  if ("includeBaseline" in g && g.includeBaseline !== undefined && typeof g.includeBaseline !== "boolean") {
    errors.push("includeBaseline: oltava boolean (true/false) tai jätä pois.");
  }
  if ("maxVariants" in g && g.maxVariants !== undefined) {
    const mv = g.maxVariants;
    if (typeof mv !== "number" || !Number.isFinite(mv) || mv <= 0) {
      errors.push("maxVariants: oltava positiivinen numero (tai jätä pois).");
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: grid as GridPayload };
}

function countBinanceSymbols(cfg: ConfigOptions): number {
  const ex = cfg.exchanges?.find((e) => e.name === "binance");
  return symbolsActiveForTrading(ex?.symbols).length;
}

type PreparedAxes = {
  valuesByAxis: unknown[][];
  includeBaseline: boolean;
  comboCount: number;
  variantCount: number;
};

function prepareAxesForCartesian(grid: GridPayload): PreparedAxes {
  const axes = Array.isArray(grid.axes) ? grid.axes : [];
  const includeBaseline = grid.includeBaseline !== false;
  if (axes.length === 0) {
    return { valuesByAxis: [], includeBaseline, comboCount: 0, variantCount: includeBaseline ? 1 : 0 };
  }
  const maxVariants = typeof grid.maxVariants === "number" && Number.isFinite(grid.maxVariants) ? grid.maxVariants : 500;
  const valuesByAxis: unknown[][] = [];
  let comboCount = 1;
  for (let i = 0; i < axes.length; i++) {
    const axisResolved = buildAxisValues(axes[i]!);
    if (!axisResolved.ok) {
      const axisName = axes[i]?.name ? ` (${axes[i]?.name})` : "";
      throw new Error(`Virhe akselissa #${i}${axisName}: ${axisResolved.error}`);
    }
    const values = axisResolved.values;
    valuesByAxis.push(values);
    comboCount *= values.length;
    const totalWithBaseline = comboCount + (includeBaseline ? 1 : 0);
    if (totalWithBaseline > maxVariants) {
      const axisName = axes[i]?.name ? ` (${axes[i]?.name})` : "";
      throw new Error(
        `Grid tuottaa liikaa yhdistelmiä: > ${maxVariants}. Kasvu pysäytetty akselilla #${i}${axisName}. ` +
          `Pienennä arvojoukkoja tai nosta maxVariants.`
      );
    }
  }
  return { valuesByAxis, includeBaseline, comboCount, variantCount: comboCount + (includeBaseline ? 1 : 0) };
}

export function estimateGridVariantCount(grid: GridPayload): number {
  const prepared = prepareAxesForCartesian(grid);
  if (prepared.variantCount > 0) return prepared.variantCount;
  if (Array.isArray(grid.variants) && grid.variants.length > 0) return grid.variants.length;
  return 1;
}

/** Yhdistää akselien patchit; käytetään grid-varianttien rakentamiseen ja testeissä. */
export function buildGridVariantPatch(grid: GridPayload, variantIndex: number): unknown {
  return patchForVariantIndex(prepareAxesForCartesian(grid), variantIndex);
}

function patchForVariantIndex(prepared: PreparedAxes, variantIndex: number): unknown {
  if (prepared.valuesByAxis.length === 0) return {};
  if (prepared.includeBaseline) {
    if (variantIndex === 0) return {};
    variantIndex -= 1;
  }
  if (variantIndex < 0 || variantIndex >= prepared.comboCount) return {};
  let idx = variantIndex;
  let patch: unknown = {};
  for (let axis = prepared.valuesByAxis.length - 1; axis >= 0; axis--) {
    const vals = prepared.valuesByAxis[axis];
    const base = vals.length;
    const pick = idx % base;
    idx = Math.floor(idx / base);
    patch = deepMergeConfig(patch, vals[pick]);
  }
  return patch;
}

export function totalTradesFromSimulationResult(result: SimulationApiResult): number {
  if (!result.ok) return 0;
  return (result.symbols ?? []).reduce((sum, s) => sum + (Number(s.trades) || 0), 0);
}

function buildVariantSummaryRow(row: {
  variantIndex: number;
  result: SimulationApiResult;
}): GridRunSummary["variantSummaries"][number] {
  if (!row.result.ok) {
    return { variantIndex: row.variantIndex, ok: false, error: row.result.error };
  }
  const r = row.result;
  const trades = totalTradesFromSimulationResult(r);
  return {
    variantIndex: row.variantIndex,
    ok: true,
    roiPercent: r.roiPercent,
    roi: r.roi,
    finalPortfolio: r.finalPortfolio,
    startingBalance: r.startingBalance,
    trades,
    zeroTrades: trades === 0,
  };
}

/** Lisää validationWarnings-listaan, jos variant(e)illa ei yhtään kauppaa. */
export function appendZeroTradesGridWarnings(
  warnings: string[],
  variantSummaries: GridRunSummary["variantSummaries"]
): number {
  const okRows = variantSummaries.filter((v) => v.ok);
  const zeroCount = okRows.filter((v) => v.zeroTrades === true || (v.trades ?? 0) === 0).length;
  if (zeroCount === 0) return 0;
  if (zeroCount === okRows.length && okRows.length > 0) {
    warnings.push(
      `Kaikissa ${zeroCount} onnistuneessa variantissa 0 kauppaa — ROI ja loppusaldo eivät heijasta strategiaa (usein vain alkusaldo). Tarkista agreement, profit-portti ja tyhjennä simulation/cache/grid-variants ennen uutta ajoa.`
    );
  } else {
    warnings.push(
      `${zeroCount}/${okRows.length} onnistunutta varianttia: 0 kauppaa — vertaile tuloksia vain variantteihin joissa trades > 0.`
    );
  }
  return zeroCount;
}

function warnZeroTradesVariant(variantIndex: number, variantCount: number, result: SimulationApiResult): void {
  if (!result.ok) return;
  const trades = totalTradesFromSimulationResult(result);
  if (trades === 0) {
    console.warn(
      `[sim-grid] Variantti ${variantIndex + 1}/${variantCount}: 0 kauppaa — loppusaldo ${result.finalPortfolio.toFixed(2)} voi olla vain alkusaldo (ei strategiatulosta).`
    );
  }
}

export type GridRunSummary = {
  gridPath: string;
  simulationHistoryYears?: number;
  variantCount: number;
  results: Array<{ variantIndex: number; variant: unknown; result: SimulationApiResult }>;
  variantSummaries: Array<{
    variantIndex: number;
    ok: boolean;
    roiPercent?: string;
    roi?: number;
    finalPortfolio?: number;
    startingBalance?: number;
    trades?: number;
    zeroTrades?: boolean;
    error?: string;
  }>;
  /** Onnistuneita variantteja joissa symbols.trades yhteensä = 0. */
  zeroTradesVariantCount?: number;
  best: {
    variantIndex: number;
    roiPercent: string;
    roi: number;
    finalPortfolio: number;
    startingBalance: number;
  } | null;
  validationWarnings: string[];
  outputFile: string;
  /**
   * Gridin pohja ajon alussa: parseArgsSimulate + grid-tiedoston simulationHistoryYears (ei variantti-patchia).
   * API-avaimet maskattu. Uudet ajot täyttävät aina; vanhoissa tulostiedostoissa voi puuttua.
   */
  baselineConfig?: ConfigOptions;
  /**
   * Jos baseline on mukana (includeBaseline=true), kopio sen hetkisestä sim-asetustiedostosta.
   * Polku on absoluuttinen. Vanhoissa yhteenvetotiedostoissa voi puuttua.
   */
  baselineOptionsSnapshotFile?: string;
};

export type GridRuntimeProgress = {
  variantIndex: number;
  variantTotal: number;
  simulation: SimulationProgress;
  elapsedMs?: number;
  avgVariantMs?: number;
  etaMs?: number;
};

function stableSortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortJson);
  }
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = stableSortJson(obj[key]);
    }
    return out;
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableSortJson(value))).digest("hex");
}

export type { GridVariantCachePayload } from "./gridVariantCache";

/**
 * Varoita jos eri axis-patchit sulautuvat samaan konfigiin (yleinen virhe: template käyttää "0"/"2" ilman "$value").
 * Tällöin variantti-cache jakaa yhden tuloksen kaikille indekseille.
 */
function warnIfVariantCacheKeyCollisions(
  base: ConfigOptions,
  variantPatchAt: (i: number) => unknown,
  variantCount: number,
  years: number | undefined
): void {
  if (variantCount <= 1) return;
  const keyToFirstIndex = new Map<string, number>();
  const scanLimit = Math.min(variantCount, 500);
  for (let i = 0; i < scanLimit; i++) {
    const patch = variantPatchAt(i);
    const merged = validateOptions(
      deepMergeConfig(JSON.parse(JSON.stringify(base)), patch) as ConfigOptions
    ) as ConfigOptions;
    merged.simulate = true;
    if (typeof years === "number" && Number.isFinite(years)) merged.simulationHistoryYears = years;
    const variantCacheKey = sha256({
      simulationHistoryYears: merged.simulationHistoryYears ?? null,
      config: merged,
    });
    const first = keyToFirstIndex.get(variantCacheKey);
    if (first === undefined) {
      keyToFirstIndex.set(variantCacheKey, i);
      continue;
    }
    if (JSON.stringify(variantPatchAt(first)) !== JSON.stringify(patch)) {
      console.warn(
        `[sim-grid] Variantit #${first + 1} ja #${i + 1} tuottavat saman cache-avaimen — axis-patchit eivät muuta lopullista konfigia. ` +
          `Range-templateissa käytä paikkamerkkiä \"$value\" (ei kiinteitä \"0\"/\"2\"), katso settings/sim-grid-range.example.json. ` +
          `Muuten kaikki ${variantCount} ajoa voivat käyttää samaa välimuistitulosta.`
      );
      return;
    }
  }
}

function simulationHistoryYearsNormalize(y: unknown): number | undefined {
  return typeof y === "number" && Number.isFinite(y) ? y : undefined;
}

function simulationHistoryYearsMatch(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined) return b === undefined;
  if (b === undefined) return false;
  return Math.abs(a - b) < 1e-6;
}

type PersistedGridVariantRow = {
  variantIndex: number;
  variant: unknown;
  result: SimulationApiResult;
};

/** Palautetaan sama grid + sama varianttiluku + sama simulationHistoryYears (katso levyllä oleva yhteenveto). */
function tryLoadPriorSuccessfulVariantsFromPersistedSummaries(
  gridFileAbsResolved: string,
  variantCount: number,
  baseSimulationHistoryYears: number | undefined,
  simulationOutDir: string
): Map<number, PersistedGridVariantRow> {
  const target = path.resolve(gridFileAbsResolved);
  const merged = new Map<number, PersistedGridVariantRow>();

  const consumeSummaryFile = (fileName: string, onlyMissingIndices: boolean): void => {
    const fp = path.join(simulationOutDir, fileName);
    if (!fs.existsSync(fp)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch {
      return;
    }
    if (!isPlainObject(parsed)) return;
    if (typeof parsed.gridPath !== "string") return;
    if (path.resolve(parsed.gridPath) !== target) return;
    if (typeof parsed.variantCount !== "number" || parsed.variantCount !== variantCount) return;
    if (
      !simulationHistoryYearsMatch(
        simulationHistoryYearsNormalize(parsed.simulationHistoryYears),
        baseSimulationHistoryYears
      )
    )
      return;
    const rows = parsed.results;
    if (!Array.isArray(rows)) return;
    for (const raw of rows) {
      if (!isPlainObject(raw)) continue;
      const vi = raw.variantIndex;
      if (typeof vi !== "number" || vi < 0 || vi >= variantCount) continue;
      if (onlyMissingIndices && merged.has(vi)) continue;
      const res = raw.result;
      if (
        !res ||
        typeof res !== "object" ||
        !("ok" in (res as object)) ||
        !(res as { ok?: boolean }).ok
      )
        continue;
      merged.set(vi, {
        variantIndex: vi,
        variant: raw.variant,
        result: res as SimulationApiResult,
      });
    }
  };

  consumeSummaryFile("grid-progress-summary.json", false);
  consumeSummaryFile("grid-last-summary.json", true);

  return merged;
}

/**
 * Aja grid-tiedoston mukaiset variantit. Kirjoittaa tulokset levylle ja tulostaa konsoliin parhaan ROI:n.
 */
export async function executeSimGrid(
  gridPath: string,
  shouldAbort?: () => boolean,
  onProgress?: (progress: GridRuntimeProgress) => void
): Promise<GridRunSummary> {
  const absPath = path.resolve(gridPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Grid-tiedostoa ei löydy: ${absPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } catch {
    throw new Error("Grid-tiedosto ei ole kelvollista JSONia.");
  }

  const validated = validateGridPayload(raw);
  if (!validated.ok) {
    throw new Error(`Grid-validointi epäonnistui:\n- ${validated.errors.join("\n- ")}`);
  }

  const grid = validated.data;
  const outDir = path.join(findProjectRoot(), "simulation");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const progressFile = path.join(outDir, "grid-progress-summary.json");
  let variantCount = 0;
  let variantPatchAt = (_i: number): unknown => ({});
  const preparedAxes = prepareAxesForCartesian(grid);
  if (preparedAxes.variantCount > 0) {
    variantCount = preparedAxes.variantCount;
    variantPatchAt = (i: number) => patchForVariantIndex(preparedAxes, i);
  } else if (Array.isArray(grid.variants) && grid.variants.length > 0) {
    variantCount = grid.variants.length;
    variantPatchAt = (i: number) => grid.variants![i] ?? {};
  } else {
    variantCount = 1;
    variantPatchAt = () => ({});
  }

  const base = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
  const years = grid.simulationHistoryYears;
  if (typeof years === "number" && Number.isFinite(years)) {
    base.simulationHistoryYears = years;
  }

  const validationWarnings: string[] = [];
  const sym0 = countBinanceSymbols(
    validateOptions(deepMergeConfig(JSON.parse(JSON.stringify(base)), variantPatchAt(0)) as ConfigOptions) as ConfigOptions
  );
  const validationScanLimit = Math.min(variantCount - 1, 200);
  for (let i = 1; i <= validationScanLimit; i++) {
    const merged = validateOptions(
      deepMergeConfig(JSON.parse(JSON.stringify(base)), variantPatchAt(i)) as ConfigOptions
    ) as ConfigOptions;
    const n = countBinanceSymbols(merged);
    if (n !== sym0) {
      validationWarnings.push(
        `Variantti ${i}: Binance-symbolien määrä (${n}) poikkeaa variantista 0 (${sym0}) — preload voi olla väärä.`
      );
    }
  }
  if (variantCount - 1 > validationScanLimit) {
    validationWarnings.push(
      `Symbolimäärän validointi skannattiin osittain (${validationScanLimit + 1}/${variantCount} varianttia) suorituskyvyn takia.`
    );
  }
  for (const w of validationWarnings) {
    console.warn("[sim-grid]", w);
  }

  warnIfVariantCacheKeyCollisions(base, variantPatchAt, variantCount, years);

  console.log(
    `Sim-grid: ${variantCount} varianttia, simulationHistoryYears=${base.simulationHistoryYears ?? "koko ladattu"}`
  );
  const gridStartedAt = Date.now();
  const variantDurationsMs: number[] = [];
  const emitProgress = (variantIndex: number, simulation: SimulationProgress): void => {
    const elapsedMs = Date.now() - gridStartedAt;
    const avgVariantMs =
      variantDurationsMs.length > 0
        ? variantDurationsMs.reduce((sum, ms) => sum + ms, 0) / variantDurationsMs.length
        : undefined;
    const remaining = Math.max(0, variantCount - Math.max(variantIndex + 1, variantDurationsMs.length));
    const etaMs = avgVariantMs != null ? Math.round(avgVariantMs * remaining) : undefined;
    const gridPrefix = `[grid ${variantIndex + 1}/${variantCount}]`;
    logSimulationProgressToConsole(simulation, { prefix: gridPrefix });
    if (etaMs != null && etaMs > 0 && simulation.phase === "loading") {
      const etaMin = Math.max(1, Math.round(etaMs / 60_000));
      console.log(`${gridPrefix} Arvio jäljellä noin ${etaMin} min`);
    }
    onProgress?.({
      variantIndex,
      variantTotal: variantCount,
      simulation,
      elapsedMs,
      avgVariantMs,
      etaMs,
    });
  };
  emitProgress(0, {
    phase: "loading",
    message: `Valmistellaan gridiä (${variantCount} varianttia): ladataan yhteiset kynttilät...`,
  });

  const variantCacheDir = path.join(findProjectRoot(), "simulation", "cache", "grid-variants");
  if (!fs.existsSync(variantCacheDir)) fs.mkdirSync(variantCacheDir, { recursive: true });

  const baselineConfig = maskConfigSecretsForExport(JSON.parse(JSON.stringify(base)) as ConfigOptions);
  let baselineOptionsSnapshotFile: string | undefined;
  if (preparedAxes.includeBaseline) {
    try {
      const sourceSettingsPath = getSimulateOptionsFilePath();
      if (fs.existsSync(sourceSettingsPath)) {
        const snapshotName = `baseline-options-${Date.now()}.json`;
        baselineOptionsSnapshotFile = path.join(outDir, snapshotName);
        fs.copyFileSync(sourceSettingsPath, baselineOptionsSnapshotFile);
      }
    } catch (e) {
      console.warn("[sim-grid] Baseline-asetusten snapshotin tallennus epäonnistui:", e);
    }
  }
  const results: Array<{ variantIndex: number; variant: unknown; result: SimulationApiResult }> = [];

  const writeProgressSnapshot = (): void => {
    try {
      if (fs.existsSync(progressFile)) {
        try {
          const prevRaw = fs.readFileSync(progressFile, "utf-8");
          if (prevRaw) {
            const prev = JSON.parse(prevRaw) as { results?: unknown[] };
            if (Array.isArray(prev.results) && prev.results.length > 0) {
              const backupName = `grid-progress-summary-${Date.now()}.bak.json`;
              fs.copyFileSync(progressFile, path.join(outDir, backupName));
            }
          }
        } catch {
          // ignore backup errors
        }
      }
      fs.writeFileSync(
        progressFile,
        JSON.stringify(
          {
            gridPath: absPath,
            simulationHistoryYears: base.simulationHistoryYears,
            variantCount,
            results,
            partial: true,
            updatedAt: new Date().toISOString(),
            baselineConfig,
            baselineOptionsSnapshotFile,
          },
          null,
          2
        )
      );
    } catch {
      // ignore progress snapshot write errors
    }
  };
  writeProgressSnapshot();

  const priorOkFromSummaries = tryLoadPriorSuccessfulVariantsFromPersistedSummaries(
    absPath,
    variantCount,
    base.simulationHistoryYears,
    outDir
  );
  if (priorOkFromSummaries.size > 0) {
    console.log(
      `[sim-grid] Ohitettavaksi kelpaavia aiempia tuloksia: ${priorOkFromSummaries.size}/${variantCount} varianttia (${path.basename(
        progressFile
      )}, grid-last-summary.json — sama grid + varianttiluku + simulationHistoryYears).`
    );
  }

  const cachedPerVariant: Array<SimulationApiResult | null> = [];
  for (let i = 0; i < variantCount; i++) {
    const priorRow = priorOkFromSummaries.get(i);
    if (priorRow?.result.ok) {
      emitProgress(i, {
        phase: "loading",
        message: `Variantti ${i + 1}/${variantCount} löytyi aiemmasta grid-yhteenvetoon tallennettuna.`,
      });
      cachedPerVariant.push(priorRow.result);
      continue;
    }
    const patch = variantPatchAt(i);
    const merged = validateOptions(
      deepMergeConfig(JSON.parse(JSON.stringify(base)), patch) as ConfigOptions
    ) as ConfigOptions;
    merged.simulate = true;
    if (typeof years === "number" && Number.isFinite(years)) merged.simulationHistoryYears = years;
    const variantCacheKey = sha256({
      simulationHistoryYears: merged.simulationHistoryYears ?? null,
      config: merged,
    });
    const variantCacheFile = path.join(variantCacheDir, `${variantCacheKey}.json`);
    try {
      if (!fs.existsSync(variantCacheFile)) {
        cachedPerVariant.push(null);
        continue;
      }
      const parsed = readGridVariantCacheFile(variantCacheFile);
      if (!parsed?.result?.ok) {
        cachedPerVariant.push(null);
        continue;
      }
      emitProgress(i, { phase: "loading", message: `Variantti ${i + 1}/${variantCount} haettiin cachesta.` });
      cachedPerVariant.push(parsed.result);
      if (gridVariantCacheNeedsMetadata(parsed)) {
        writeGridVariantCacheFile(variantCacheFile, {
          variantIndex: i,
          variant: patch,
          gridPath: absPath,
          simulationHistoryYears: base.simulationHistoryYears,
          baselineOptionsSnapshotFile,
          baselineConfig: base,
          result: parsed.result,
        });
      }
    } catch {
      cachedPerVariant.push(null);
    }
  }
  const allCached = cachedPerVariant.length > 0 && cachedPerVariant.every((r) => r != null && r.ok);
  if (allCached) {
    console.log(`Sim-grid: kaikki ${variantCount} varianttia löytyivät cachesta, preload ohitettu.`);
    for (let i = 0; i < cachedPerVariant.length; i++) {
      const result = cachedPerVariant[i] as SimulationApiResult;
      const patch = variantPatchAt(i);
      results.push({ variantIndex: i, variant: patch, result });
      const mergedAllCached = validateOptions(
        deepMergeConfig(JSON.parse(JSON.stringify(base)), patch) as ConfigOptions
      ) as ConfigOptions;
      mergedAllCached.simulate = true;
      if (typeof years === "number" && Number.isFinite(years)) {
        mergedAllCached.simulationHistoryYears = years;
      }
      const cacheKeyAll = sha256({
        simulationHistoryYears: mergedAllCached.simulationHistoryYears ?? null,
        config: mergedAllCached,
      });
      writeGridVariantCacheFile(path.join(variantCacheDir, `${cacheKeyAll}.json`), {
        variantIndex: i,
        variant: patch,
        gridPath: absPath,
        simulationHistoryYears: base.simulationHistoryYears,
        baselineOptionsSnapshotFile,
        baselineConfig: base,
        result,
      });
    }
    writeProgressSnapshot();
    // jump to summary generation by reusing existing block below
    const outFile = path.join(outDir, `grid-results-${Date.now()}.json`);
    let best: GridRunSummary["best"] = null;
    const variantSummaries: GridRunSummary["variantSummaries"] = [];
    for (const row of results) {
      const vs = buildVariantSummaryRow(row);
      variantSummaries.push(vs);
      if (!row.result.ok) continue;
      const r = row.result;
      if (best == null || r.roi > best.roi || (r.roi === best.roi && r.finalPortfolio > best.finalPortfolio)) {
        best = {
          variantIndex: row.variantIndex,
          roiPercent: r.roiPercent,
          roi: r.roi,
          finalPortfolio: r.finalPortfolio,
          startingBalance: r.startingBalance,
        };
      }
    }
    const zeroTradesVariantCount = appendZeroTradesGridWarnings(validationWarnings, variantSummaries);
    for (const w of validationWarnings) {
      if (w.includes("0 kauppaa")) console.warn("[sim-grid]", w);
    }
    const summary: GridRunSummary = {
      gridPath: absPath,
      simulationHistoryYears: base.simulationHistoryYears,
      variantCount,
      results,
      variantSummaries,
      best,
      zeroTradesVariantCount,
      validationWarnings,
      outputFile: outFile,
      baselineConfig,
      baselineOptionsSnapshotFile,
    };
    fs.writeFileSync(outFile, JSON.stringify({ ...summary, gridPath: absPath }, null, 2));
    fs.writeFileSync(path.join(outDir, "grid-last-summary.json"), JSON.stringify(summary, null, 2));
    return summary;
  }

  const preloadProbe = validateOptions(
    deepMergeConfig(JSON.parse(JSON.stringify(base)), variantPatchAt(0)) as ConfigOptions
  ) as ConfigOptions;
  preloadProbe.simulate = true;
  if (typeof years === "number" && Number.isFinite(years)) preloadProbe.simulationHistoryYears = years;

  const preloadResult = await loadSimulationPreload(preloadProbe, (p) => {
    emitProgress(0, p);
  });
  if ("error" in preloadResult) {
    throw new Error(preloadResult.error);
  }
  const preload = preloadResult;

  let lastProgressPersistAt = Date.now();
  let lastProgressPersistCount = 0;
  const maybeWriteProgressSnapshot = (force = false): void => {
    const now = Date.now();
    const shouldWrite =
      force ||
      results.length - lastProgressPersistCount >= 5 ||
      now - lastProgressPersistAt >= 5000;
    if (!shouldWrite) return;
    writeProgressSnapshot();
    lastProgressPersistAt = now;
    lastProgressPersistCount = results.length;
  };

  for (let i = 0; i < variantCount; i++) {
    if (shouldAbort && shouldAbort()) {
      console.log("\n[sim-grid] Keskeytys pyydetty — lopetetaan ennen seuraavaa varianttia.");
      break;
    }
    const patch = variantPatchAt(i);
    const merged = validateOptions(
      deepMergeConfig(JSON.parse(JSON.stringify(base)), patch) as ConfigOptions
    ) as ConfigOptions;
    merged.simulate = true;
    if (typeof years === "number" && Number.isFinite(years)) merged.simulationHistoryYears = years;
    const variantStartedAt = Date.now();

    const variantCacheKey = sha256({
      simulationHistoryYears: merged.simulationHistoryYears ?? null,
      config: merged,
    });
    const variantCacheFile = path.join(variantCacheDir, `${variantCacheKey}.json`);

    const priorRow = priorOkFromSummaries.get(i);
    if (priorRow && priorRow.result.ok === true) {
      console.log(`\n=== Variant ${i + 1}/${variantCount} (aiempi yhteenveto) ===`);
      console.log(
        `ROI ${priorRow.result.roiPercent}% | loppusaldo ${priorRow.result.finalPortfolio.toFixed(2)} | kynttilärivejä ${priorRow.result.candleRows}`
      );
      variantDurationsMs.push(Date.now() - variantStartedAt);
      emitProgress(i, {
        phase: "loading",
        message: `Variantti ${i + 1}/${variantCount} palautettu aiemmasta grid-yhteenvetosta (simulation/grid-progress tai grid-last).`,
      });
      results.push({ variantIndex: i, variant: patch, result: priorRow.result });
      warnZeroTradesVariant(i, variantCount, priorRow.result);
      maybeWriteProgressSnapshot();
      writeGridVariantCacheFile(variantCacheFile, {
        variantIndex: i,
        variant: patch,
        gridPath: absPath,
        simulationHistoryYears: base.simulationHistoryYears,
        baselineOptionsSnapshotFile,
        baselineConfig: base,
        result: priorRow.result,
      });
      continue;
    }

    try {
      if (fs.existsSync(variantCacheFile)) {
        const parsed = readGridVariantCacheFile(variantCacheFile);
        if (parsed?.result?.ok) {
          console.log(`\n=== Variant ${i + 1}/${variantCount} (cache) ===`);
          console.log(
            `ROI ${parsed.result.roiPercent}% | loppusaldo ${parsed.result.finalPortfolio.toFixed(2)} | kynttilärivejä ${parsed.result.candleRows}`
          );
          variantDurationsMs.push(Date.now() - variantStartedAt);
          emitProgress(i, { phase: "loading", message: `Variantti ${i + 1}/${variantCount} haettiin cachesta.` });
          const useVariant = parsed.variant !== undefined ? parsed.variant : patch;
          results.push({ variantIndex: i, variant: useVariant, result: parsed.result });
          warnZeroTradesVariant(i, variantCount, parsed.result);
          if (gridVariantCacheNeedsMetadata(parsed)) {
            writeGridVariantCacheFile(variantCacheFile, {
              variantIndex: i,
              variant: patch,
              gridPath: absPath,
              simulationHistoryYears: base.simulationHistoryYears,
              baselineOptionsSnapshotFile,
              baselineConfig: base,
              result: parsed.result,
            });
          }
          maybeWriteProgressSnapshot();
          continue;
        }
      }
    } catch {
      // ignore cache read errors and run variant normally
    }

    console.log(`\n=== Variant ${i + 1}/${variantCount} ===`);
    emitProgress(i, { phase: "loading", message: `Grid variantti ${i + 1}/${variantCount} käynnissä...` });
    const result = await runSimulationWithConfig(merged, preload, shouldAbort, (p) => {
      emitProgress(i, p);
    });
    variantDurationsMs.push(Date.now() - variantStartedAt);
    results.push({ variantIndex: i, variant: patch, result });
    maybeWriteProgressSnapshot();
    if (result.ok) {
      writeGridVariantCacheFile(variantCacheFile, {
        variantIndex: i,
        variant: patch,
        gridPath: absPath,
        simulationHistoryYears: base.simulationHistoryYears,
        baselineOptionsSnapshotFile,
        baselineConfig: base,
        result,
      });
    }
    if (result.ok) {
      const trades = totalTradesFromSimulationResult(result);
      console.log(
        `ROI ${result.roiPercent}% | loppusaldo ${result.finalPortfolio.toFixed(2)} | kauppoja ${trades} | kynttilärivejä ${result.candleRows}`
      );
      warnZeroTradesVariant(i, variantCount, result);
    } else {
      console.log(`Virhe: ${result.error}`);
    }
  }

  let best: GridRunSummary["best"] = null;
  const variantSummaries: GridRunSummary["variantSummaries"] = [];
  for (const row of results) {
    const vs = buildVariantSummaryRow(row);
    variantSummaries.push(vs);
    if (!row.result.ok) continue;
    const r = row.result;
    if (best == null || r.roi > best.roi || (r.roi === best.roi && r.finalPortfolio > best.finalPortfolio)) {
      best = {
        variantIndex: row.variantIndex,
        roiPercent: r.roiPercent,
        roi: r.roi,
        finalPortfolio: r.finalPortfolio,
        startingBalance: r.startingBalance,
      };
    }
  }

  const zeroTradesVariantCount = appendZeroTradesGridWarnings(validationWarnings, variantSummaries);
  for (const w of validationWarnings) {
    if (w.includes("0 kauppaa")) console.warn("[sim-grid]", w);
  }

  const outFile = path.join(outDir, `grid-results-${Date.now()}.json`);

  const summary: GridRunSummary = {
    gridPath: absPath,
    simulationHistoryYears: base.simulationHistoryYears,
    variantCount,
    results,
    variantSummaries,
    best,
    zeroTradesVariantCount,
    validationWarnings,
    outputFile: outFile,
    baselineConfig,
    baselineOptionsSnapshotFile,
  };

  fs.writeFileSync(outFile, JSON.stringify({ ...summary, gridPath: absPath }, null, 2));

  const summaryFile = path.join(outDir, "grid-last-summary.json");
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  try {
    fs.writeFileSync(progressFile, JSON.stringify({ ...summary, partial: false, updatedAt: new Date().toISOString() }, null, 2));
  } catch {
    // ignore progress snapshot write errors
  }

  console.log(`\nTulokset tallennettu: ${outFile}`);
  console.log(`Yhteenveto: ${summaryFile}`);
  console.log("\nVarianttien yhteenveto:");
  for (const vs of variantSummaries) {
    if (vs.ok) {
      const tradeNote = vs.zeroTrades ? " | VAROITUS: 0 kauppaa" : ` | kauppoja ${vs.trades ?? 0}`;
      console.log(
        `- #${vs.variantIndex + 1} (idx ${vs.variantIndex}) ROI ${vs.roiPercent}% | loppusaldo ${(
          vs.finalPortfolio ?? 0
        ).toFixed(2)}${tradeNote}`
      );
    } else {
      console.log(`- #${vs.variantIndex + 1} (idx ${vs.variantIndex}) VIRHE: ${vs.error}`);
    }
  }

  if (best != null) {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log(
      `PARAS ROI — variantti #${best.variantIndex + 1} (indeksi ${best.variantIndex}): ${best.roiPercent}% | loppusaldo ${best.finalPortfolio.toFixed(2)} (alku ${best.startingBalance.toFixed(2)})`
    );
    console.log("══════════════════════════════════════════════════════════════\n");
  } else {
    console.log("\n[Ei onnistunutta varianttia ROI-yhteenvetoon.]\n");
  }

  return summary;
}
