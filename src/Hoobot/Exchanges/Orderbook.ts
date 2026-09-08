import { toSymbolKey } from "../Utilities/Args";
import { Exchange, isBinance, isNonKYC, isDexTrade } from "./Exchange";
import { NonKYCOrderbook, NonKYCResponse } from "./NonKYC/NonKYC";
import { DexTradeSocketBookEntry, DexTradeSocketBookEvent } from "./DexTrade/DexTrade";

export interface Depth {
  [price: string]: number;
}

export interface Orderbook {
  bids: Depth;
  asks: Depth;
}

export interface Orderbooks {
  [symbol: string]: Orderbook;
}

export const getOrderbook = async (exchange: Exchange, symbol: string): Promise<Orderbook> => {
  let orderbook: Orderbook = {
    bids: {},
    asks: {},
  };
  if (isBinance(exchange)) {
    orderbook = await exchange.depth(toSymbolKey(symbol));
  } else if (isNonKYC(exchange)) {
    const fetchedOrderbook = await exchange.getOrderbook(symbol, "50");
    if (fetchedOrderbook.asks && fetchedOrderbook.asks.length > 0) {
      for (const ask of fetchedOrderbook.asks) {
        const price = ask[0];
        const quantity = Number.isFinite(parseFloat(ask[1])) ? parseFloat(ask[1]) : 0;
        if (quantity > 0) {
          orderbook.asks[price] = quantity;
        }
      }
    }
    if (fetchedOrderbook.bids && fetchedOrderbook.bids.length > 0) {
      for (const bid of fetchedOrderbook.bids) {
        const price = bid[0];
        const quantity = Number.isFinite(parseFloat(bid[1])) ? parseFloat(bid[1]) : 0;
        if (quantity > 0) {
          orderbook.bids[price] = quantity;
        }
      }
    }
  } else if (isDexTrade(exchange)) {
    const fetchedOrderbook = await exchange.getOrderbook(toSymbolKey(symbol));
    if (fetchedOrderbook?.data?.sell) {
      for (const entry of fetchedOrderbook.data.sell) {
        const rate = Number.isFinite(entry.rate) ? entry.rate.toString() : "0";
        const volume = Number.isFinite(entry.volume) ? entry.volume : 0;
        if (volume > 0) {
          orderbook.asks[rate] = volume;
        }
      }
    }
    if (fetchedOrderbook?.data?.buy) {
      for (const entry of fetchedOrderbook.data.buy) {
        const rate = Number.isFinite(entry.rate) ? entry.rate.toString() : "0";
        const volume = Number.isFinite(entry.volume) ? entry.volume : 0;
        if (volume > 0) {
          orderbook.bids[rate] = volume;
        }
      }
    }
  }
  return orderbook;
};

export const listenForOrderbooks = async (
  exchange: Exchange,
  symbol: string,
  returnCallback: (symbol: string, orderbook: Orderbook) => void,
) => {
  if (isBinance(exchange)) {
    exchange.websockets.depthCache(toSymbolKey(symbol), (symbol: any, depth: any) => {
      let asks: Depth = exchange.sortAsks(depth.asks);
      let bids: Depth = exchange.sortBids(depth.bids);
      const book: Orderbook = {
        asks: asks,
        bids: bids,
      };
      returnCallback(symbol, book);
    });
  } else if (isNonKYC(exchange)) {
    const book: Orderbook = {
      asks: {},
      bids: {},
    };
    exchange.subscribeOrderbook(symbol, (response: NonKYCResponse) => {
      if (response.method === "snapshotOrderbook") {
        const asks = (response.params as NonKYCOrderbook).asks;
        const bids = (response.params as NonKYCOrderbook).bids;
        for (const ask of asks) {
          if (book.asks[ask.price] !== undefined) {
            book.asks[ask.price] = typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
          } else {
            book.asks[ask.price] += typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
          }
        }
        for (const bid of bids) {
          if (book.bids[bid.price] !== undefined) {
            book.bids[bid.price] = typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
          } else {
            book.bids[bid.price] += typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
          }
        }
        returnCallback(symbol, book);
      } else if (response.method === "updateOrderbook") {
        const asks = (response.params as NonKYCOrderbook).asks;
        const bids = (response.params as NonKYCOrderbook).bids;
        for (const ask of asks) {
          if (typeof ask.quantity === "number" && ask.quantity === 0) {
            delete book.asks[ask.price];
          } else {
            if (book.asks[ask.price] !== undefined) {
              book.asks[ask.price] = typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
            } else {
              book.asks[ask.price] += typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
            }
          }
        }
        for (const bid of bids) {
          if (typeof bid.quantity === "number" && bid.quantity === 0) {
            delete book.bids[bid.price];
          } else {
            if (book.bids[bid.price] !== undefined) {
              book.bids[bid.price] = typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
            } else {
              book.bids[bid.price] += typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
            }
          }
        }
        // book.asks = book.asks.sort((a, b) => (parseFloat(a[0]) - parseFloat(b[0])));
        // book.bids = book.bids.sort((a, b) => (parseFloat(b[0]) - parseFloat(a[0])));
        returnCallback(symbol, book);
      }
    });
  } else if (isDexTrade(exchange)) {
    const book: Orderbook = { asks: {}, bids: {} };
    // Load initial snapshot via REST, then apply socket delta updates
    const initialBook = await exchange.getOrderbook(toSymbolKey(symbol));
    if (initialBook?.data?.sell) {
      for (const entry of initialBook.data.sell) {
        book.asks[entry.rate.toString()] = entry.volume;
      }
    }
    if (initialBook?.data?.buy) {
      for (const entry of initialBook.data.buy) {
        book.bids[entry.rate.toString()] = entry.volume;
      }
    }
    returnCallback(symbol, book);
    const pairInfo = await exchange.getPairInfo(toSymbolKey(symbol));
    const rateDecimal = pairInfo?.rate_decimal ?? 8;
    const baseDecimal = pairInfo?.base_decimal ?? 8;
    await exchange.subscribeOrderbook(toSymbolKey(symbol), (event: DexTradeSocketBookEvent) => {
      const applyDelta = (side: { [rate: string]: DexTradeSocketBookEntry }, depth: Depth) => {
        for (const entry of Object.values(side)) {
          const rate = (entry.rate / Math.pow(10, rateDecimal)).toString();
          const volume = entry.volume / Math.pow(10, baseDecimal);
          if (volume === 0 || entry.count === 0) {
            delete depth[rate];
          } else {
            depth[rate] = volume;
          }
        }
      };
      if (event.data.sell) applyDelta(event.data.sell, book.asks);
      if (event.data.buy) applyDelta(event.data.buy, book.bids);
      returnCallback(symbol, book);
    });
  }
};
