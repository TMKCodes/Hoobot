import Binance from "node-binance-api";
import { ConfigOptions } from "./args";

// Get current balance
export async function getCurrentBalance(binance: Binance, options: ConfigOptions) {
  const balance = await binance.balance();
  console.log(options.pair.split("/")[0] + " " + balance[options.pair.split("/")[0]].available);
  console.log(options.pair.split("/")[1] + " "  + balance[options.pair.split("/")[1]].available);
  const pairBalance = [
    parseFloat(balance[options.pair.split("/")[0]].available || "0"),
    parseFloat(balance[options.pair.split("/")[1]].available || "0")
  ];
  return { pair: options.pair, balances: pairBalance } || { pair: options.pair, balances: [0, 0] }; // Return [0, 0] if there is an error fetching the balance
}