import Binance from "node-binance-api";
import { play } from "./playSound";
import { sendMessageToChannel } from "../discord/discord";
import { Client } from "discord.js";

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

// Function to handle open orders with a max age time in seconds
export const handleOpenOrders = async (discord: Client, binance: Binance, openOrders: any[], maxAgeSeconds: number = 600) => {
  const currentTime = Date.now();
  for (const order of openOrders) {
    const { orderId, symbol, time } = order;
    const orderAgeSeconds = Math.floor((currentTime - time) / 1000);
    console.log(`Order ID: ${orderId}, Symbol: ${symbol}, Age: ${orderAgeSeconds} seconds`);
    // Get order status to determine if it's active, partially filled, or filled
    const orderStatus = await binance.orderStatus(symbol, orderId);
    if (orderStatus.status === 'PARTIALLY_FILLED') {
      const statusMsg = `Order ID ${orderId} for symbol ${symbol} is already partially filled..`;
      sendMessageToChannel(discord, cryptoChannelID, statusMsg);
      console.log(statusMsg);
    } else if (orderStatus.status === 'FILLED') {
      const statusMsg = `Order ID ${orderId} for symbol ${symbol} is already filled.`;
      sendMessageToChannel(discord, cryptoChannelID, statusMsg);
      console.log(statusMsg);
    } else if (orderAgeSeconds > maxAgeSeconds) {
      // If the order age exceeds the max age time, cancel it
      await cancelOrder(discord, binance, symbol, orderId);
      const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to exceeding max age ${maxAgeSeconds} seconds.`;
      sendMessageToChannel(discord, cryptoChannelID, orderMsg);
      console.log(`orderMsg`);
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
