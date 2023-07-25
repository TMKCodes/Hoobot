import Binance from "node-binance-api";
import { ConfigOptions } from "./args";

// Get current balance
export async function getCurrentBalance(binance: Binance, coin: string) {
  try {
    const balance = await binance.balance();
    return parseFloat(balance[coin].available || "0");
  } catch (error) {
    console.error('Error fetching balances:', error);
    throw error;
  }
}

export async function getCurrentBalances(binance: Binance, coins: string[]): Promise<{ [coin: string]: number }> {
  try {
    const balances = await binance.balance();
    const currentBalances: { [coin: string]: number } = {};
    for (const coin of coins) {
      currentBalances[coin] = parseFloat(balances[coin]?.available || "0");
    }
    return currentBalances;
  } catch (error) {
    console.error('Error fetching balances:', error);
    throw error;
  }
}