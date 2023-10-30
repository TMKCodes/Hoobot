/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All 
* modifications in source or binary must be submitted to Hoosat Oy in source format.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */
import fs from 'fs';
import { SymbolCandlesticks } from "../Binance/candlesticks";
import { SymbolInfo } from "../Binance/symbols";
import { logToFile } from '../Utilities/logToFile';


interface ProfitInfo {
  amount: number,
  profit: number,
  percentage: number,
}

export const findRoundTrips = (initialSymbol: string, symbols: SymbolInfo[]): SymbolInfo[][] => {
  console.log("Searching for round trips...");
  let roundTrips: SymbolInfo[][] = [];

  const graph: { [symbol: string]: SymbolInfo[] } = {};

  // Build the graph where the keys are symbols and values are the connected symbols
  for (const symbol of symbols) {
    if (!graph[symbol.base]) {
      graph[symbol.base] = [];
    }
    graph[symbol.base].push(symbol);
    if (!graph[symbol.quote]) {
      graph[symbol.quote] = [];
    }
    graph[symbol.quote].push(symbol);
  }

  // Check if the initial symbol exists in the symbols array
  const symbolA = symbols.find((symbol) => symbol.symbol === initialSymbol.split("/").join(""));
  if (!symbolA) {
    console.log("Initial symbol not found in the symbols array.");
    return roundTrips;
  } else {
    console.log(`Initial Symbol ${initialSymbol.split("/").join("")} found in the symbols array.`);
  }

  let progressInterval = 100; // Adjust this to change how often the progress is logged
  let pathCount = 0;
  const visitedNodes = new Set<string>(); // Track visited nodes

  const dfs = (currentPath: SymbolInfo[], visitedNodes: Set<string>, depth: number) => {
    if (depth > 3) return; // Set a maximum depth to avoid going too deep into cycles

    const currentSymbol = currentPath[currentPath.length - 1];

    if (currentPath.length >= 2 && currentSymbol.quote === symbolA.quote) {
      roundTrips.push(currentPath);
      return;
    }

    const connectedSymbols = graph[currentSymbol.quote];

    if (connectedSymbols) {
      for (const nextSymbol of connectedSymbols) {
        const nextBase = nextSymbol.base;
        const nextPath = [...currentPath, nextSymbol];

        // Check for cycles by verifying if the nextBase already exists in the currentPath
        if (currentPath.every((s) => s.base !== nextBase) && !visitedNodes.has(nextBase)) {
          visitedNodes.add(nextBase);
          dfs(nextPath, new Set(visitedNodes), depth + 1); // Pass a new set of visited nodes to avoid modifying the original set
          visitedNodes.delete(nextBase); // Remove the node from the visited set when backtracking
        }
      }
    }

    pathCount++;
    if (pathCount % progressInterval === 0) {
      console.log(`Current path length: ${currentPath.length}, Round trips found: ${roundTrips.length}`);
    }
  };

  dfs([symbolA], visitedNodes, 0);

  console.log(`Search completed. Total round trips found: ${roundTrips.length}`);
  return roundTrips;
};


const printUniqueSymbols = (symbols: SymbolInfo[]) => {
  const uniqueSymbols = symbols.reduce((acc, symbol) => {
    if (!acc.includes(symbol.symbol)) {
      acc.push(symbol.symbol);
    }
    return acc;
  }, []);
  console.log("Unique symbols found:", uniqueSymbols.length);
};

export const uniqueSymbolsOfRoundTrips = (roundTrips: SymbolInfo[][]): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];
  for (const tripSymbols of roundTrips) {
    for(const symbol of tripSymbols) {
      symbols.push(symbol);
    }
  }
  return Array.from(new Set(symbols));
}

export const roundTripsContainsSymbol = (roundTrips: SymbolInfo[][], symbol: string): SymbolInfo[][] => {
  return roundTrips.filter(tripSymbols => tripSymbols.some(s => s.symbol === symbol));
}


export const arbitrageProfit = (
  candles: SymbolCandlesticks,
  roundTrip: SymbolInfo[],
  startBalance: number
): ProfitInfo | undefined => {
  const symbolCandles: SymbolCandlesticks = {};
  const symbols = roundTrip.map((symbol) => symbol.symbol);
  
  // Check if all required candles are available.
  for (const symbol of symbols) {
    if (!candles[symbol]?.candles || candles[symbol].candles.length === 0) {
      return undefined; // Not ready to do arbitrageProfit calculations, missing candles
    }
    symbolCandles[symbol] = { candles: candles[symbol].candles };
  }

  let curBaseAmount: number = startBalance;
  let curBaseAsset: string = symbols[0].replace(roundTrip[0].symbol, "");

  // Calculate for the inner pairs, skip the first pair and do not calculate last pair.
  for (let i = 1; i < symbols.length - 1; i++) {
    const close = symbolCandles[symbols[i]].candles[symbolCandles[symbols[i]].candles.length - 1].close;
    const prevSymbol = symbols[i - 1];
    if (symbols[i].indexOf(curBaseAsset) === 0) {
      // If the current symbol starts with the curBaseAsset, it means the currentAsset is the quote asset.
      // So, we need to divide the current balance by the close value to get the new base amount.
      curBaseAmount = curBaseAmount / close;
    } else {
      // If the current symbol does not start with the curBaseAsset, it means the currentAsset is the base asset.
      // So, we need to multiply the current balance by the close value to get the new base amount.
      curBaseAmount = curBaseAmount * close;
    }
    curBaseAsset = symbols[i].replace(prevSymbol, "");
  }

  // Now calculate the last pair trade.
  const lastClose = symbolCandles[symbols[symbols.length - 1]].candles[symbolCandles[symbols[symbols.length - 1]].candles.length - 1].close;
  if (symbols[symbols.length - 1].indexOf(curBaseAsset) === 0) {
    // If the last symbol starts with the curBaseAsset, it means the lastAsset is the quote asset.
    // So, we need to divide the current balance by the close value to get the new base amount.
    curBaseAmount = curBaseAmount / lastClose;
  } else {
    // If the last symbol does not start with the curBaseAsset, it means the lastAsset is the base asset.
    // So, we need to multiply the current balance by the close value to get the new base amount.
    curBaseAmount = curBaseAmount * lastClose;
  }

  const profit = curBaseAmount - startBalance;
  const percentage = (profit / startBalance) * 100;

  return {
    amount: curBaseAmount,
    profit,
    percentage,
  };
};

export const arbitage = async () => {

}