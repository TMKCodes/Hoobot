import { Exchange, isBinance, isNonKYC } from "./Exchange";
import { NonKYCOrderbook, NonKYCResponse } from "./NonKYC/NonKYC";

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
    orderbook = await exchange.depth(symbol.split("/").join(""));
  } else if (isNonKYC(exchange)) {
    const fetchedOrderbook = await exchange.getOrderbook(symbol, "50");
    if (fetchedOrderbook.asks && fetchedOrderbook.asks.length > 0) {
      for (const ask of fetchedOrderbook.asks) {
        orderbook.asks[ask[0]] = parseFloat(ask[1]);
      }
    }
    if (fetchedOrderbook.bids && fetchedOrderbook.bids.length > 0) {
      for (const bid of fetchedOrderbook.bids) {
        orderbook.bids[bid[0]] = parseFloat(bid[1]);
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
    exchange.websockets.depthCache(symbol.split("/").join(""), (symbol: any, depth: any) => {
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
            book.asks[ask.price] = typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
          }
        }
        for (const bid of bids) {
          if (book.bids[bid.price] !== undefined) {
            book.bids[bid.price] = typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
          } else {
            book.bids[bid.price] = typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
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
              book.asks[ask.price] = typeof ask.quantity !== "string" ? ask.quantity : parseFloat(ask.quantity);
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
              book.bids[bid.price] = typeof bid.quantity !== "string" ? bid.quantity : parseFloat(bid.quantity);
            }
          }
        }
        // book.asks = book.asks.sort((a, b) => (parseFloat(a[0]) - parseFloat(b[0])));
        // book.bids = book.bids.sort((a, b) => (parseFloat(b[0]) - parseFloat(a[0])));
        returnCallback(symbol, book);
      }
    });
  }
};
