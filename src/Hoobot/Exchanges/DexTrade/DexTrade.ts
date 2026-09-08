import crypto from "crypto";
import EventEmitter from "events";
import { io, Socket } from "socket.io-client";
import { logToFile } from "../../Utilities/LogToFile";

// ========== Helpers ==========

const getRequestId = (): string => Date.now().toString();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const normalizeDexTradePairKey = (pair: string): string => pair.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const toDexTradeDecimalString = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error(`DexTrade: invalid numeric value ${value}`);
  }

  const normalized = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

  return normalized.includes(".") ? normalized.replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "") : normalized;
};

const quantizeDexTradeValue = (value: number, decimals: number, direction: "down" | "nearest" = "nearest"): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`DexTrade: invalid numeric value ${value}`);
  }
  if (!Number.isFinite(decimals) || decimals < 0) {
    return value;
  }

  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const rounded = direction === "down" ? Math.floor(scaled + 1e-9) : Math.round(scaled);
  return rounded / factor;
};

const toDexTradePairDecimalString = (
  value: number,
  decimals: number | undefined,
  direction: "down" | "nearest" = "nearest",
): string => {
  if (decimals === undefined) {
    return toDexTradeDecimalString(value);
  }
  return toDexTradeDecimalString(quantizeDexTradeValue(value, decimals, direction));
};

const countDecimalPlaces = (value: string): number => {
  const [, fractional = ""] = value.split(".");
  return fractional.length;
};

const decimalStringToScaledBigInt = (value: string, scale: number): bigint => {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [integerPartRaw, fractionalPartRaw = ""] = unsigned.split(".");
  const integerPart = integerPartRaw === "" ? "0" : integerPartRaw;
  const paddedFraction = (fractionalPartRaw + "0".repeat(scale)).slice(0, scale);
  const digits = `${integerPart}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0";
  const scaled = BigInt(digits);
  return negative ? -scaled : scaled;
};

const scaledBigIntToDecimalString = (value: bigint, scale: number): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const integerPart = scale === 0 ? digits : digits.slice(0, -scale) || "0";
  const fractionalPart = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  const formatted = fractionalPart.length > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
  return negative ? `-${formatted}` : formatted;
};

const quantizeToStepString = (value: number, step: string, direction: "down" | "up" | "nearest" = "down"): string => {
  const valueString = toDexTradeDecimalString(value);
  const parsedStep = Number(step);
  if (!Number.isFinite(parsedStep) || parsedStep <= 0) {
    return toDexTradeDecimalString(value);
  }

  const scale = Math.max(countDecimalPlaces(valueString), countDecimalPlaces(step));
  const valueUnits = decimalStringToScaledBigInt(valueString, scale);
  const stepUnits = decimalStringToScaledBigInt(step, scale);
  if (stepUnits <= 0n) {
    return valueString;
  }

  const quotient = valueUnits / stepUnits;
  const remainder = valueUnits % stepUnits;

  let roundedQuotient = quotient;
  if (direction === "up" && remainder !== 0n) {
    roundedQuotient += 1n;
  } else if (direction === "nearest" && remainder !== 0n) {
    const doubleRemainder = remainder * 2n;
    if (doubleRemainder >= stepUnits) {
      roundedQuotient += 1n;
    }
  }

  return scaledBigIntToDecimalString(roundedQuotient * stepUnits, scale);
};

const extractDexTradeStep = (message: string | undefined, field: "volume" | "rate"): string | null => {
  if (!message) return null;
  const match = message.match(
    field === "volume"
      ? /Incorrect min step volume\. Step is ([0-9.]+)/i
      : /Incorrect min step rate\. Step is ([0-9.]+)/i,
  );
  return match?.[1] ?? null;
};

/** Deep-sort object keys alphabetically (recursive). */
const deepSortKeys = (obj: any): any => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  const sorted: any = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = deepSortKeys(obj[key]);
  }
  return sorted;
};

/** Extract leaf values from a deeply-sorted object (depth-first, alphabetical). */
const extractLeafValues = (obj: any): string[] => {
  if (typeof obj !== "object" || obj === null) return [String(obj)];
  if (Array.isArray(obj)) return obj.flatMap(extractLeafValues);
  return Object.keys(obj)
    .sort()
    .flatMap((key) => extractLeafValues(obj[key]));
};

/**
 * Create X-Auth-Sign for DexTrade private API.
 * Algorithm: sort body keys alphabetically (deep), concatenate all leaf values, append secret, SHA256.
 */
const createSignature = (body: Record<string, any>, secret: string): string => {
  const sorted = deepSortKeys(body);
  const values = extractLeafValues(sorted);
  const str = values.join("") + secret;
  return crypto.createHash("sha256").update(str).digest("hex");
};

// ========== Public API Types ==========

export interface DexTradePair {
  id: number;
  pair: string;
  base: string;
  quote: string;
  rate_decimal: number;
  base_decimal: number;
  quote_decimal: number;
}

export interface DexTradeTicker {
  id: number;
  pair: string;
  last: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume_24H: number;
  min_trade: number;
  percent_change: number;
}

export interface DexTradeBookEntry {
  volume: number;
  rate: number;
  count: number;
}

export interface DexTradeOrderbookData {
  buy: DexTradeBookEntry[];
  sell: DexTradeBookEntry[];
  sequenceId: number;
}

export interface DexTradeOrderbookResponse {
  status: boolean;
  data: DexTradeOrderbookData;
}

export interface DexTradePublicTrade {
  volume: number;
  rate: number;
  price: number;
  timestamp: number;
  type: "BUY" | "SELL";
}

export interface DexTradeCandle {
  low: number;
  high: number;
  volume: number;
  time: number;
  open: number;
  close: number;
  pair_id: number;
  pair: string;
}

// ========== Socket Event Types ==========

export interface DexTradeSocketBookEntry {
  volume: number;
  count: number;
  rate: number;
  price: number;
}

export interface DexTradeSocketBookData {
  buy?: { [rate: string]: DexTradeSocketBookEntry };
  sell?: { [rate: string]: DexTradeSocketBookEntry };
  sequenceId: number;
}

export interface DexTradeSocketBookEvent {
  type: "book";
  data: DexTradeSocketBookData;
  room: string;
}

export interface DexTradeSocketHistData {
  rate: number;
  volume: number;
  type: "BUY" | "SELL";
  price: number;
  time_create: number;
  pair_id: number;
}

export interface DexTradeSocketHistEvent {
  type: "hist";
  data: DexTradeSocketHistData;
  room: string;
}

export interface DexTradeSocketGraphData {
  low: number;
  high: number;
  volume: number;
  time: number;
  open: number;
  close: number;
  pair_id: number;
  pair: string;
}

export interface DexTradeSocketGraphEvent {
  type: "graph";
  data: DexTradeSocketGraphData;
  room: string;
}

interface DexTradeSocketGraphBatchMessage {
  type: "graph";
  data: DexTradeSocketGraphData[];
  chanel?: string;
  room?: string;
}

export type DexTradeSocketEvent = DexTradeSocketBookEvent | DexTradeSocketHistEvent | DexTradeSocketGraphEvent;

// ========== Private API Types ==========

export interface DexTradeBalanceEntry {
  balance: number;
  balance_available: number;
  balances: { total: number; available: number };
  decimal: number;
  currency: {
    iso3: string;
    name: string;
    networks: { [key: string]: string };
    refill: number;
    withdraw: number;
  };
}

export interface DexTradeOrder {
  id: number;
  /** 0 = buy, 1 = sell */
  type: number;
  /** 0 = in process, 1 = added to book, 2 = filled, 3 = closed / partial */
  status: number;
  /** 0 = limit, 1 = market, 2 = stop-limit, 3 = quick market, 4 = hidden limit */
  type_trade: number;
  pair: string;
  volume: number;
  volume_done: number;
  rate: number;
  price: number;
  price_done: number;
  time_create: number;
  time_done: number | null;
  commission?: number;
  currency_pair_id?: number;
}

export interface DexTradeCreateOrderResult {
  id: string;
  price: string;
  quantity: string;
  side: "buy" | "sell";
  status: string;
  createdAt: number;
}

// ========== DexTrade Class ==========

export class DexTrade extends EventEmitter {
  private readonly ApiURL = "https://api.dex-trade.com/v1";
  private readonly CandleURL = "https://socket.dex-trade.com/graph/hist";
  private readonly SocketURL = "https://socket.dex-trade.com";
  private readonly tickerCacheTtlMs = 15_000;
  private readonly missingTickerCacheTtlMs = 5 * 60_000;

  private readonly token: string;
  private readonly secret: string;

  private socket: Socket | null = null;
  private pairCache: DexTradePair[] = [];
  private tickerCache = new Map<string, { expiresAt: number; value: DexTradeTicker | null }>();
  private orderStepOverrides = new Map<string, { volumeStep?: string; rateStep?: string }>();

  private bookCallbacks: Map<string, (event: DexTradeSocketBookEvent) => void> = new Map();
  private histCallbacks: Map<string, (event: DexTradeSocketHistEvent) => void> = new Map();
  private graphCallbacks: Map<string, (events: DexTradeSocketGraphEvent[]) => void> = new Map();

  constructor(token: string, secret: string) {
    super();
    this.token = token;
    this.secret = secret;
    this.connectSocket();
  }

  /** Tag method used by isDexTrade() guard in Exchange.ts. */
  public DexTrade = (): string => "DexTrade";

  // ---------- Connection ----------

  public waitConnect = (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      if (this.socket?.connected) {
        resolve(true);
        return;
      }
      this.once("connected", () => resolve(true));
    });
  };

  private connectSocket = (): void => {
    this.socket = io(this.SocketURL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.socket.on("connect", () => {
      console.log("DexTrade socket connected.");
      this.emit("connected");
    });

    this.socket.on("disconnect", (reason: string) => {
      console.log(`DexTrade socket disconnected: ${reason}`);
    });

    this.socket.on("connect_error", (err: Error) => {
      console.error("DexTrade socket connection error:", err.message);
    });

    this.socket.on("message", (messages: any) => {
      const msgs: DexTradeSocketEvent[] = Array.isArray(messages) ? messages : [messages];
      this.handleSocketMessages(msgs);
    });
  };

  public disconnect = (): void => {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log("DexTrade disconnected.");
    }
  };

  private handleSocketMessages = (messages: DexTradeSocketEvent[]): void => {
    const graphByRoom = new Map<string, DexTradeSocketGraphEvent[]>();

    for (const msg of messages) {
      if (!msg || !msg.type) continue;

      if (msg.type === "book") {
        const event = msg as DexTradeSocketBookEvent;
        const pairId = event.room.replace("book_", "");
        const pair = this.pairCache.find((p) => p.id.toString() === pairId);
        if (pair) {
          const cb = this.bookCallbacks.get(pair.pair);
          if (cb) cb(event);
        }
      } else if (msg.type === "hist") {
        const event = msg as DexTradeSocketHistEvent;
        const pairId = event.room.replace("hist_", "");
        const pair = this.pairCache.find((p) => p.id.toString() === pairId);
        if (pair) {
          const cb = this.histCallbacks.get(pair.pair);
          if (cb) cb(event);
        }
      } else if (msg.type === "graph") {
        const graphMessage = msg as DexTradeSocketGraphEvent | DexTradeSocketGraphBatchMessage;
        const room =
          (graphMessage as DexTradeSocketGraphBatchMessage).room ??
          (graphMessage as DexTradeSocketGraphBatchMessage).chanel;

        if (!room) continue;

        const rawData = (graphMessage as DexTradeSocketGraphBatchMessage).data;
        const dataItems = Array.isArray(rawData) ? rawData : [rawData];

        if (!graphByRoom.has(room)) {
          graphByRoom.set(room, []);
        }

        for (const data of dataItems) {
          const event: DexTradeSocketGraphEvent = {
            type: "graph",
            room,
            data,
          };
          graphByRoom.get(room)!.push(event);
        }
      }
    }

    for (const [room, events] of graphByRoom) {
      const cb = this.graphCallbacks.get(room);
      if (cb) cb(events);
    }
  };

  // ---------- Pair cache ----------

  private ensurePairCache = async (): Promise<void> => {
    if (this.pairCache.length > 0) return;
    try {
      const response = await this.publicGet(`${this.ApiURL}/public/symbols`);
      if (response?.status && Array.isArray(response?.data)) {
        this.pairCache = response.data as DexTradePair[];
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logToFile("./logs/error.log", `DexTrade ensurePairCache: ${errorMessage}`);
    }
  };

  public getPairInfo = async (pair: string): Promise<DexTradePair | undefined> => {
    await this.ensurePairCache();
    const normalizedPair = normalizeDexTradePairKey(pair);
    return this.pairCache.find((p) => normalizeDexTradePairKey(p.pair) === normalizedPair);
  };

  public hasPair = async (pair: string): Promise<boolean> => {
    const pairInfo = await this.getPairInfo(pair);
    return pairInfo !== undefined;
  };

  // ---------- HTTP helpers ----------

  private publicGet = async (url: string, params: Record<string, string> = {}): Promise<any> => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = query ? `${url}?${query}` : url;
    const maxRetries = 6;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(fullUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          logToFile("./logs/error.log", `DexTrade GET ${fullUrl} → ${res.status}`);
        }
        return await res.json();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logToFile("./logs/error.log", `DexTrade GET ${fullUrl} error: ${errorMessage}`);
        if (attempt + 1 >= maxRetries) throw err;
        await delay(1000);
      }
    }
  };

  private privatePost = async (endpoint: string, body: Record<string, any>): Promise<any> => {
    const bodyWithId = { ...body, request_id: getRequestId() };
    const signature = createSignature(bodyWithId, this.secret);
    const url = `${this.ApiURL}${endpoint}`;
    const maxRetries = 6;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "login-token": this.token,
            "X-Auth-Sign": signature,
          },
          body: JSON.stringify(bodyWithId),
        });
        if (!res.ok) {
          logToFile("./logs/error.log", `DexTrade POST ${endpoint} → ${res.status}`);
        }
        return await res.json();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logToFile("./logs/error.log", `DexTrade POST ${endpoint} error: ${errorMessage}`);
        if (attempt + 1 >= maxRetries) throw err;
        await delay(1000);
      }
    }
  };

  // ========== Public REST API ==========

  public getSymbols = async (): Promise<DexTradePair[]> => {
    const response = await this.publicGet(`${this.ApiURL}/public/symbols`);
    if (response?.status && Array.isArray(response?.data)) {
      this.pairCache = response.data;
      return response.data as DexTradePair[];
    }
    return [];
  };

  public getTicker = async (pair: string): Promise<DexTradeTicker | null> => {
    const now = Date.now();
    const cached = this.tickerCache.get(pair);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const pairExists = await this.hasPair(pair);
    if (!pairExists) {
      this.tickerCache.set(pair, {
        expiresAt: now + this.missingTickerCacheTtlMs,
        value: null,
      });
      return null;
    }

    const response = await this.publicGet(`${this.ApiURL}/public/ticker`, { pair });
    const ticker = response && response.status !== false ? (response as DexTradeTicker) : null;
    this.tickerCache.set(pair, {
      expiresAt: now + (ticker ? this.tickerCacheTtlMs : this.missingTickerCacheTtlMs),
      value: ticker,
    });
    return ticker;
  };

  public getOrderbook = async (pair: string, _depth?: string): Promise<DexTradeOrderbookResponse> => {
    return this.publicGet(`${this.ApiURL}/public/book`, { pair });
  };

  public getPublicTrades = async (pair: string): Promise<DexTradePublicTrade[]> => {
    return this.publicGet(`${this.ApiURL}/public/trades`, { pair });
  };

  /**
   * Fetch candlestick bars from the DexTrade graph history endpoint.
   * Returns bars normalised to float values and time in milliseconds.
   */
  public getCandles = async (
    pair: string,
    _from: number | null,
    _to: number | null,
    resolution: number,
    countBack: number,
    _firstDataRequest: number,
  ): Promise<{
    bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  }> => {
    const pairInfo = await this.getPairInfo(pair);
    const rateDecimal = pairInfo?.rate_decimal ?? 8;
    const baseDecimal = pairInfo?.base_decimal ?? 8;
    const end = Math.floor(Date.now() / 1000);

    let periodStr: string;
    if (resolution >= 1440 && resolution % 1440 === 0) {
      periodStr = "D";
    } else if (resolution >= 10080 && resolution % 10080 === 0) {
      periodStr = "W";
    } else {
      periodStr = resolution.toString();
    }

    const response = await this.publicGet(this.CandleURL, {
      t: pair,
      r: periodStr,
      end: end.toString(),
      limit: countBack.toString(),
    });

    if (!Array.isArray(response)) return { bars: [] };

    const bars = (response as DexTradeCandle[]).map((candle) => ({
      time: candle.time * 1000,
      open: candle.open / Math.pow(10, rateDecimal),
      high: candle.high / Math.pow(10, rateDecimal),
      low: candle.low / Math.pow(10, rateDecimal),
      close: candle.close / Math.pow(10, rateDecimal),
      volume: candle.volume / Math.pow(10, baseDecimal),
    }));

    return { bars };
  };

  /** Returns all trading pairs with their last price (fetched individually only if needed). */
  public getMarkets = async (): Promise<Array<{ symbol: string; lastPrice: string }>> => {
    await this.ensurePairCache();
    return this.pairCache.map((p) => ({ symbol: p.pair, lastPrice: "0" }));
  };

  // ========== Private REST API ==========

  public getTradingBalance = async (): Promise<DexTradeBalanceEntry[]> => {
    const response = await this.privatePost("/private/balances", {});
    if (response?.status && Array.isArray(response?.data?.list)) {
      return response.data.list as DexTradeBalanceEntry[];
    }
    return [];
  };

  public getActiveOrders = async (pair?: string): Promise<DexTradeOrder[]> => {
    const body: Record<string, any> = {};
    if (pair) body.pair = pair;
    const response = await this.privatePost("/private/orders", body);
    if (response?.status && Array.isArray(response?.data?.list)) {
      return response.data.list as DexTradeOrder[];
    }
    return [];
  };

  public getAllOrders = async (
    symbol: string,
    status: string,
    limit: number,
    page: number,
  ): Promise<DexTradeOrder[]> => {
    if (status === "active") {
      return this.getActiveOrders(symbol);
    }
    const body: Record<string, any> = {
      pair: symbol,
      page: page > 0 ? page : 1,
      limit: Math.min(limit, 2000),
      format_number: 1,
    };
    const response = await this.privatePost("/private/history", body);
    if (response?.status && Array.isArray(response?.data?.list)) {
      let orders = response.data.list as DexTradeOrder[];
      if (status === "filled") orders = orders.filter((o) => o.status === 2);
      else if (status === "cancelled") orders = orders.filter((o) => o.status === 3);
      return orders;
    }
    return [];
  };

  public getOrderByID = async (orderId: string): Promise<DexTradeOrder | null> => {
    const response = await this.privatePost("/private/get-order", {
      order_id: parseInt(orderId, 10),
    });
    if (response?.status && response?.data) {
      return response.data as DexTradeOrder;
    }
    return null;
  };

  /**
   * Create a new order on DexTrade.
   * Returns a normalised result object matching the shape expected by Orders.ts / Trades.ts.
   */
  public newOrder = async (
    symbol: string,
    side: "buy" | "sell",
    type: "limit" | "market",
    quantity: number,
    price: number = 0,
  ): Promise<DexTradeCreateOrderResult> => {
    const pairInfo = await this.getPairInfo(symbol);
    const pair = pairInfo?.pair ?? symbol;
    const stepOverride = this.orderStepOverrides.get(pair) ?? {};
    let volume = stepOverride.volumeStep
      ? quantizeToStepString(quantity, stepOverride.volumeStep, side === "buy" ? "up" : "down")
      : toDexTradePairDecimalString(quantity, pairInfo?.base_decimal, "down");
    let rate = stepOverride.rateStep
      ? quantizeToStepString(price, stepOverride.rateStep, "nearest")
      : toDexTradePairDecimalString(price, pairInfo?.rate_decimal);
    const typeTradeMap: Record<string, number> = { limit: 0, market: 1 };
    const body: Record<string, any> = {
      type_trade: typeTradeMap[type] ?? 0,
      type: side === "buy" ? 0 : 1,
      volume,
      pair,
    };
    if (type === "limit") body.rate = rate;
    let response = await this.privatePost("/private/create-order", body);
    const stepVolume = extractDexTradeStep(response?.message ?? response?.error, "volume");
    if (stepVolume) {
      this.orderStepOverrides.set(pair, { ...stepOverride, volumeStep: stepVolume });
    }
    const correctedVolume = stepVolume ? quantizeToStepString(quantity, stepVolume, side === "buy" ? "up" : "down") : null;
    if (correctedVolume && body.volume !== correctedVolume) {
      volume = correctedVolume;
      body.volume = volume;
      response = await this.privatePost("/private/create-order", body);
    }

    const stepRate = extractDexTradeStep(response?.message ?? response?.error, "rate");
    if (stepRate) {
      const existingOverride = this.orderStepOverrides.get(pair) ?? {};
      this.orderStepOverrides.set(pair, { ...existingOverride, rateStep: stepRate });
    }
    const correctedRate = stepRate ? quantizeToStepString(price, stepRate, "nearest") : null;
    if (correctedRate && type === "limit" && body.rate !== correctedRate) {
      rate = correctedRate;
      body.rate = rate;
      response = await this.privatePost("/private/create-order", body);
    }

    if (response?.status && response?.data?.id) {
      return {
        id: response.data.id.toString(),
        price: rate,
        quantity: volume,
        side,
        status: "NEW",
        createdAt: Date.now(),
      };
    }
    logToFile(
      "./logs/error.log",
      `DexTrade create-order failed pair=${pair} side=${side} type=${type} volume=${body.volume} rate=${String(body.rate ?? "")}` +
      ` response=${JSON.stringify(response)}`,
    );
    throw new Error(response?.message ?? response?.error ?? "DexTrade: failed to create order");
  };

  public cancelOrder = async (orderId: string): Promise<any> => {
    return this.privatePost("/private/delete-order", {
      order_id: parseInt(orderId, 10),
    });
  };

  public cancelOrders = async (orderIds: number[]): Promise<any> => {
    return this.privatePost("/private/delete-orders", { list: orderIds });
  };

  public getOrderHistory = async (pair?: string, page: number = 1, limit: number = 2000): Promise<DexTradeOrder[]> => {
    const body: Record<string, any> = { page, limit, format_number: 1 };
    if (pair) body.pair = pair;
    const response = await this.privatePost("/private/history", body);
    if (response?.status && Array.isArray(response?.data?.list)) {
      return response.data.list as DexTradeOrder[];
    }
    return [];
  };

  /**
   * Returns user's executed trades for a symbol, mapped to the shape expected by Trades.ts.
   * DexTrade has no dedicated "my trades" endpoint; we use filled orders from history.
   */
  public getAllTrades = async (
    symbol: string,
    limit: number,
    _page: number,
  ): Promise<
    Array<{
      id: string;
      orderid: string;
      price: string;
      quantity: string;
      fee: string;
      alternateFeeAsset: string;
      createdAt: number;
      side: string;
    }>
  > => {
    const orders = await this.getOrderHistory(symbol, 1, Math.min(limit, 2000));
    return orders
      .filter((o) => o.status === 2)
      .map((o) => ({
        id: o.id.toString(),
        orderid: o.id.toString(),
        price: (o.rate ?? 0).toString(),
        quantity: (o.volume_done ?? o.volume ?? 0).toString(),
        fee: (o.commission ?? 0).toString(),
        alternateFeeAsset: "",
        createdAt: (o.time_create ?? 0) * 1000,
        side: o.type === 0 ? "buy" : "sell",
      }));
  };

  public getDepositAddress = async (iso: string, network?: string): Promise<any> => {
    const body: Record<string, any> = { iso, new: 0 };
    if (network) body.network = network;
    return this.privatePost("/private/get-address", body);
  };

  public createWithdrawal = async (iso: string, amount: number, toAddress: string, comment?: string): Promise<any> => {
    const body: Record<string, any> = { iso, amount, to_address: toAddress };
    if (comment) body.comment = comment;
    // Withdrawal uses /v1/withdraw (not /v1/private/withdraw)
    const bodyWithId = { ...body, request_id: getRequestId() };
    const signature = createSignature(bodyWithId, this.secret);
    const url = `${this.ApiURL}/withdraw`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "login-token": this.token,
        "X-Auth-Sign": signature,
      },
      body: JSON.stringify(bodyWithId),
    });
    return res.json();
  };

  // ========== Socket API ==========

  public subscribeOrderbook = async (
    pair: string,
    callback: (event: DexTradeSocketBookEvent) => void,
  ): Promise<void> => {
    await this.ensurePairCache();
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (!pairInfo) {
      console.warn(`DexTrade subscribeOrderbook: pair ${pair} not found in cache`);
      return;
    }
    this.bookCallbacks.set(pair, callback);
    this.socket?.emit("subscribe", { type: "book", event: `book_${pairInfo.id}` });
    console.log(`DexTrade: subscribed to orderbook for ${pair}`);
  };

  public unsubscribeOrderbook = (pair: string): void => {
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (pairInfo) {
      this.socket?.emit("unsubscribe", `book_${pairInfo.id}`);
    }
    this.bookCallbacks.delete(pair);
  };

  public subscribeTrades = async (pair: string, callback: (event: DexTradeSocketHistEvent) => void): Promise<void> => {
    await this.ensurePairCache();
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (!pairInfo) {
      console.warn(`DexTrade subscribeTrades: pair ${pair} not found in cache`);
      return;
    }
    this.histCallbacks.set(pair, callback);
    this.socket?.emit("subscribe", { type: "hist", event: `hist_${pairInfo.id}` });
    console.log(`DexTrade: subscribed to trades for ${pair}`);
  };

  public unsubscribeTrades = (pair: string): void => {
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (pairInfo) {
      this.socket?.emit("unsubscribe", `hist_${pairInfo.id}`);
    }
    this.histCallbacks.delete(pair);
  };

  /**
   * Subscribe to candlestick updates via socket.io.
   * The first message delivers ~256 historical candles; subsequent messages deliver single updates.
   * @param period Period in minutes (e.g. 1, 5, 60). Use 1440 for daily.
   */
  public subscribeCandles = async (
    pair: string,
    period: number,
    callback: (events: DexTradeSocketGraphEvent[]) => void,
    _limit?: number,
  ): Promise<void> => {
    await this.ensurePairCache();
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (!pairInfo) {
      console.warn(`DexTrade subscribeCandles: pair ${pair} not found in cache`);
      return;
    }
    const room = `${pair}:${period}:${pairInfo.id}`;
    this.graphCallbacks.set(room, callback);
    this.socket?.emit("subscribe", { type: "graph", event: room });
    console.log(`DexTrade: subscribed to candles for ${pair} period=${period}`);
  };

  public unsubscribeCandles = (pair: string, period: number): void => {
    const pairInfo = this.pairCache.find((p) => p.pair === pair);
    if (pairInfo) {
      const room = `${pair}:${period}:${pairInfo.id}`;
      this.socket?.emit("unsubscribe", room);
      this.graphCallbacks.delete(room);
    }
  };

  /** No-op: DexTrade has no order-report subscription equivalent. */
  public subscribeReports = (_callback: (event: any) => void): void => {
    console.warn("DexTrade: subscribeReports is not supported by this exchange.");
  };

  public unsubscribeReports = (): void => {
    // no-op
  };
}
