import Binance from "node-binance-api";
import { ConfigOptions } from "./args";

// Get current balance
export async function getCurrentBalance(binance: Binance, coin: string) {
  const balance = await binance.balance();
  return parseFloat(balance[coin].available || "0");
}