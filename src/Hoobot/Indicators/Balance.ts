import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import { Filter } from "../Exchanges/Filters";
import { checkPreviousTrade } from "../Exchanges/Trades";

export const checkBalanceSignals = (
  consoleLogger: ConsoleLogger,
  symbol: string,
  closePrice: number,
  exchangeOptions: ExchangeOptions,
  filter: Filter,
) => {
  let check = "HOLD";
  
  // Validate symbol format
  const symbolParts = symbol?.split("/") || [];
  if (symbolParts.length !== 2 || !symbolParts[0] || !symbolParts[1]) {
    consoleLogger.push("Balance Check", `Invalid symbol format: ${symbol}. Expected BASE/QUOTE`);
    return check;
  }
  
  const [baseSymbol, quoteSymbol] = symbolParts;
  
  if (exchangeOptions.balances !== undefined) {
    if (exchangeOptions.balances[baseSymbol] == undefined) {
      exchangeOptions.balances[baseSymbol] = {
        crypto: 0,
        usdt: 0,
      };
    }
    if (exchangeOptions.balances[quoteSymbol] == undefined) {
      exchangeOptions.balances[quoteSymbol] = {
        crypto: 0,
        usdt: 0,
      };
    }
    const baseBalance = exchangeOptions.balances[baseSymbol].crypto;
    const quoteBalance = exchangeOptions.balances[quoteSymbol].crypto;
    const baseBalanceConverted = baseBalance * closePrice;
    let tradeCheck = checkPreviousTrade(symbol, exchangeOptions);
    if (tradeCheck === "SELL") {
      if (quoteBalance > filter.minNotional) {
        check = "BUY";
      } else {
        if (baseBalanceConverted >= filter.minNotional) {
          check = "SELL";
        } else {
          check = "HOLD";
        }
      }
    } else if (tradeCheck === "BUY") {
      if (baseBalanceConverted > filter.minNotional) {
        check = "SELL";
      } else {
        if (quoteBalance >= filter.minNotional) {
          check = "BUY";
        } else {
          check = "HOLD";
        }
      }
    }
    if (check === "SELL" && (baseBalanceConverted < filter.minNotional || baseBalanceConverted > filter.maxNotional)) {
      check = "HOLD";
    } else if (check === "BUY" && (quoteBalance < filter.minNotional || quoteBalance > filter.maxNotional)) {
      check = "HOLD";
    }
    consoleLogger.push("Trades", {
      previous: tradeCheck,
      next: check,
    });
  }

  return check;
};
