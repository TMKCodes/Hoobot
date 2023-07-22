import Binance from "node-binance-api";


export interface order {
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
  orderStatus: string;
  tradeId: number;
}

// Function to handle open orders with a max age time in seconds
export const handleOpenOrders = async  (binance: Binance, openOrders: any[], maxAgeSeconds: number = 60) => {
  const currentTime = Date.now();
  for (const order of openOrders) {
    const { orderId, symbol, time } = order;
    const orderAgeSeconds = Math.floor((currentTime - time) / 1000);
    console.log(`Order ID: ${orderId}, Symbol: ${symbol}, Age: ${orderAgeSeconds} seconds`);

    if (orderAgeSeconds > maxAgeSeconds) {
      // If the order age exceeds the max age time, cancel it
      await binance.cancel(symbol, orderId);
      console.log(`Order ID ${orderId} for symbol ${symbol} cancelled due to exceeding max age.`);
    } else {
      // Get order status to determine if it's active or filled
      const orderStatus = await binance.orderStatus(symbol, orderId);
      console.log(`Order ID: ${orderId}, Symbol: ${symbol}, Status: ${orderStatus.status}`);
      if (orderStatus.status === 'NEW' || orderStatus.status === 'PARTIALLY_FILLED') {
        // If the order is active or partially filled, cancel it
        await binance.cancel(symbol, orderId);
        console.log(`Order ID ${orderId} for symbol ${symbol} cancelled.`);
      } else if (orderStatus.status === 'FILLED') {
        // If the order is filled, continue with the next order (no action needed)
        console.log(`Order ID ${orderId} for symbol ${symbol} is already filled.`);
      } else {
        // Handle other order statuses if necessary (e.g., REJECTED, EXPIRED, etc.)
        console.log(`Order ID ${orderId} for symbol ${symbol} has status ${orderStatus.status}.`);
      }
    }
  }
}

// Function to get the last completed order for a given trading pair
export const getLastCompletedOrder = async (binance: Binance, pair: string): Promise<order> => {
  const tradeHistory = await binance.trades(pair);
  const completedOrders = tradeHistory.filter((trade: { isBuyer: boolean; orderStatus: string; }) => trade.isBuyer === (trade.orderStatus === 'FILLED'));
  completedOrders.sort((a: { tradeId: number; }, b: { tradeId: number; }) => b.tradeId - a.tradeId);
  return completedOrders.length > 0 ? completedOrders[0] : undefined;
}
