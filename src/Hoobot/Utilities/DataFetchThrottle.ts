/** Minimum interval between data fetches (e.g. trade history, balances) to avoid API rate limits. */
export const DATA_FETCH_INTERVAL_MS = 30 * 1000; // 30 seconds

const lastFetchByKey = new Map<string, number>();

export function shouldFetchData(key: string): boolean {
  const last = lastFetchByKey.get(key);
  if (last != null && Date.now() - last < DATA_FETCH_INTERVAL_MS) {
    return false;
  }
  return true;
}

export function markDataFetched(key: string): void {
  lastFetchByKey.set(key, Date.now());
}

export function throttleKeyTradeHistory(exchangeName: string, symbolKey: string): string {
  return `${exchangeName}:${symbolKey}:tradeHistory`;
}

export function throttleKeyBalances(exchangeName: string): string {
  return `${exchangeName}:balances`;
}
