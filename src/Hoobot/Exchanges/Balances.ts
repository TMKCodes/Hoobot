import fs from "fs";
import { Exchange, isBinance, isNonKYC } from "./Exchange";
import { logToFile } from "../Utilities/LogToFile";

export interface DatedBalances {
  [date: string]: Balances;
}

export interface Balance {
  crypto: number;
  usdt: number;
}

export interface Balances {
  [asset: string]: Balance;
}

export const getCurrentBalances = async (exchange: Exchange): Promise<Balances> => {
  const fiat = "USDT";
  const currentBalances: Balances = {
    USDT: {
      crypto: 0,
      usdt: 0,
    },
  };
  if (isBinance(exchange)) {
    const balances = await exchange.balance();
    const assets = Object.keys(balances);
    const prices = await exchange.prices();
    const symbols = Object.keys(prices);
    for (let i = 0; i < assets.length; i++) {
      const { available, onOrder } = balances[assets[i]];
      const amount = parseFloat(available) + parseFloat(onOrder);
      if (amount === 0) {
        currentBalances[assets[i]] = {
          crypto: 0,
          usdt: 0,
        };
        continue;
      }
      if (assets[i] === "USDT") {
        currentBalances[assets[i]] = {
          crypto: amount,
          usdt: amount,
        };
      } else {
        let fiatAmount = 0;
        if (symbols.includes(assets[i] + fiat)) {
          fiatAmount = prices[assets[i] + fiat] * amount;
        } else if (symbols.includes(fiat + assets[i])) {
          fiatAmount = amount / prices[fiat + assets[i]];
        } else {
          const btcPair = "BTC" + assets[i];
          const assetFiatPair = assets[i] + fiat;
          if (prices[btcPair] && prices[btcPair] !== 0 && prices[assetFiatPair]) {
            let tempAmount = amount / prices[btcPair];
            fiatAmount = prices[assetFiatPair] * tempAmount;
          } else {
            fiatAmount = 0;
          }
        }
        currentBalances[assets[i]] = {
          crypto: amount,
          usdt: Number.isNaN(fiatAmount) ? 0 : fiatAmount,
        };
      }
    }
  } else if (isNonKYC(exchange)) {
    const balances = await exchange.getTradingBalance();
    const prices = await exchange.getMarkets();
    const symbols = prices.map((price) => price.symbol.split("/").join(""));
    if (balances.length > 0) {
      for (const balance of balances) {
        const amount = parseFloat(balance.available);
        if (balance.asset === "USDT") {
          currentBalances[balance.asset] = {
            crypto: amount,
            usdt: amount,
          };
        } else {
          let fiatAmount = 0;
          const price = prices.find((price) => price.symbol.split("/").join("") === balance.asset + fiat);
          if (symbols.includes(balance.asset + fiat)) {
            fiatAmount = parseFloat(price?.lastPrice!) * amount;
          } else if (symbols.includes(fiat + balance.asset)) {
            fiatAmount = amount / parseFloat(price?.lastPrice!);
          } else {
            const tempPrice = prices.find((price) => price.symbol.split("/").join("") === "BTC" + balance.asset);
            const assetFiatPrice = prices.find((price) => price.symbol.split("/").join("") === balance.asset + fiat);
            if (tempPrice && assetFiatPrice && parseFloat(tempPrice.lastPrice) !== 0) {
              let tempAmount = amount / parseFloat(tempPrice.lastPrice);
              fiatAmount = parseFloat(assetFiatPrice.lastPrice) * tempAmount;
            } else {
              fiatAmount = 0;
            }
          }
          currentBalances[balance.asset] = {
            crypto: amount,
            usdt: fiatAmount > 0 ? fiatAmount : 0,
          };
        }
      }
    } else {
      // Possibly build empty currentBalances.
    }
  }
  const balanceAssets = Object.keys(currentBalances);
  for (const balanceAsset of balanceAssets) {
    if (currentBalances[balanceAsset].crypto === undefined) {
      currentBalances[balanceAsset].crypto = 0;
    }
    if (currentBalances[balanceAsset].usdt === undefined) {
      currentBalances[balanceAsset].usdt = 0;
    }
  }
  return Object.fromEntries(Object.entries(currentBalances).sort((a, b) => b[1].usdt - a[1].usdt));
};

export const getCurrentBalance = async (exchange: Exchange, asset: string): Promise<Balance> => {
  const balances = await getCurrentBalances(exchange);
  return balances[asset];
};

export const storeBalances = async (exchange: Exchange, balances: Balances) => {
  const currentDate = new Date().toLocaleString();
  let ex = "binance";
  if (isNonKYC(exchange)) {
    ex = "nonkyc";
  }
  const logsDir = "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  const filePath = `./logs/balances-${ex}.json`;
  let balancesInFile: DatedBalances[] = [];
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, "utf8");
    if (fileContent != undefined) {
      balancesInFile = JSON.parse(fileContent);
    }
  } else {
    fs.writeFileSync(filePath, JSON.stringify([], null, 4));
  }
  if (balancesInFile.length === 0) {
    balancesInFile.push({ [currentDate]: balances });
    fs.writeFileSync(filePath, JSON.stringify(balancesInFile, null, 4));
  }
};
