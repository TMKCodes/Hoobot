import Binance from "node-binance-api";
import { play } from "./playSound";
import { sendMessageToChannel } from "../discord/discord";
import { Client } from "discord.js";
import { filter, filters } from "./filters";
import { ConfigOptions } from "./args";

const soundFile = './alarm.mp3'

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

const cryptoChannelID = "1133114701136547961"

export const cancelOrder = async (discord: Client, binance: Binance, symbol: string, orderId: number) => {
  try {
    play(soundFile);
    const response = await binance.cancel(symbol, orderId);
    return response;
  } catch (error) {
    console.error(`An error occurred while cancelling the order: ${error.message}`);
    throw error;
  }
};

function calculatePercentageDifference(oldNumber: number, newNumber: number): number {
  const difference = Math.abs(newNumber - oldNumber);
  const percentageDifference = (difference / Math.abs(oldNumber));
  return percentageDifference;
}

// Function to handle open orders with a max age time in seconds
export const handleOpenOrders = async (
  discord: Client, 
  binance: Binance, 
  openOrders: any[], 
  orderBook: any, 
  maxAgeSeconds: number = 600,
  options: ConfigOptions
) => {
  const currentTime = Date.now();
  for (const order of openOrders) {
    const { orderId, symbol, time, side, status, price } = order;
    console.log(order)
    if (orderId === null) {
      return;
    }
    const orderAgeSeconds = Math.floor((currentTime - time) / 1000);
    console.log(`Order ID: ${orderId}, Symbol: ${symbol}, Age: ${orderAgeSeconds} seconds`);
    // Get order status to determine if it's active, partially filled, or filled
    if (status === 'PARTIALLY_FILLED') {
      const statusMsg = `Order ID ${orderId} for symbol ${symbol} is already partially filled..`;
      sendMessageToChannel(discord, cryptoChannelID, statusMsg);
      console.log(statusMsg);
    } else if (status === 'FILLED') {
      const statusMsg = `Order ID ${orderId} for symbol ${symbol} is already filled.`;
      sendMessageToChannel(discord, cryptoChannelID, statusMsg);
      console.log(statusMsg);
    } else if (orderAgeSeconds > maxAgeSeconds) {
      // If the order age exceeds the max age time, cancel it
      await cancelOrder(discord, binance, symbol, orderId);
      const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to exceeding max age ${maxAgeSeconds} seconds.`;
      sendMessageToChannel(discord, cryptoChannelID, orderMsg);
      console.log(`orderMsg`);
    } else {
      if (side === "BUY") {
        const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
        const bid = orderBookBids[orderBookBids.length - 1];
        console.log("Open Order, bid: ", bid);
        const diff = calculatePercentageDifference(bid, price);
        console.log(`diff: ${diff}`);
        if (diff > options.riskPercentage) {
          await cancelOrder(discord, binance, symbol, orderId);
          const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to price has changed over risk percentage ${options.riskPercentage}, difference between ${bid} bid and current ${price} order price ${diff}.`;
          sendMessageToChannel(discord, cryptoChannelID, orderMsg);
          console.log(`orderMsg`);
        }
      } else {
        const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
        const ask = orderBookAsks[0];
        console.log("Open Order, ask: ", ask);
        const diff = calculatePercentageDifference(ask, price);
        console.log(`diff: ${diff}`);
        if (diff > options.riskPercentage) {
          await cancelOrder(discord, binance, symbol, orderId);
          const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to price has changed over risk percentage ${options.riskPercentage}, difference between ${ask} ask and current ${price} order price ${diff}.`;
          sendMessageToChannel(discord, cryptoChannelID, orderMsg);
          console.log(`orderMsg`);
        }
      }
    }
  }
};

// Function to get the last completed order for a given trading pair
export const getLastCompletedOrder = async (binance: Binance, pair: string): Promise<order> => {
  const tradeHistory = await binance.trades(pair.split("/").join(""));
  const completedOrders = tradeHistory.filter((trade: { isBuyer: boolean; orderStatus: string; }) => trade.orderStatus === 'FILLED');
  completedOrders.sort((a: { tradeId: number; }, b: { tradeId: number; }) => b.tradeId - a.tradeId);
  return completedOrders.length > 0 ? completedOrders[0] : undefined;
}
