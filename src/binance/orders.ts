/* =====================================================================
* Binance Trading Bot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited.
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

import Binance from "node-binance-api";
import { play } from "./playSound";
import { sendMessageToChannel } from "../discord/discord";
import { Client } from "discord.js";
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

export const cancelOrder = async (binance: Binance, symbol: string, orderId: number) => {
  try {
    play(soundFile);
    const response = await binance.cancel(symbol, orderId);
    return response;
  } catch (error) {
    console.error(`An error occurred while cancelling the order: ${error.message}`);
    throw error;
  }
};

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

// Function to handle open orders with a max age time in seconds
export const handleOpenOrders = async (
  discord: Client, 
  binance: Binance, 
  symbol: string,
  openOrders: any[], 
  orderBook: any, 
  maxAgeSeconds: number = 600,
  options: ConfigOptions
) => {
  const currentTime = Date.now();
  for (const order of openOrders) {
    const { orderId, oSymbol, time, side, status, price } = order;
    if (oSymbol !== symbol) {
      return;
    }
    if (orderId === null) {
      return;
    }
    const orderAgeSeconds = Math.floor((currentTime - time) / 1000);
    console.log(`Order ID: ${orderId}, Symbol: ${oSymbol}, Age: ${orderAgeSeconds} seconds`);
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
      await cancelOrder(binance, symbol, orderId);
      const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to exceeding max age ${maxAgeSeconds} seconds.`;
      sendMessageToChannel(discord, cryptoChannelID, orderMsg);
      console.log(`orderMsg`);
    } else {
      if (side === "BUY") {
        const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => a - b);
        const bid = orderBookBids[orderBookBids.length - 1];
        console.log("Open Order, bid: ", bid);
        const diff = Math.abs(calculatePercentageDifference(bid, price));
        console.log(`diff: ${diff}`);
        if (diff > options.riskPercentage) {
          await cancelOrder(binance, symbol, orderId);
          const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to price has changed over risk percentage ${options.riskPercentage.toFixed(4)}%, difference between ${bid} bid and current ${price} order price ${diff}.`;
          sendMessageToChannel(discord, cryptoChannelID, orderMsg);
          console.log(`orderMsg`);
        }
      } else {
        const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
        const ask = orderBookAsks[0];
        console.log("Open Order, ask: ", ask);
        const diff = Math.abs(calculatePercentageDifference(ask, price));
        console.log(`diff: ${diff}`);
        if (diff > options.riskPercentage) {
          await cancelOrder(binance, symbol, orderId);
          const orderMsg = `Order ID ${orderId} for symbol ${symbol} cancelled due to price has changed over risk percentage ${options.riskPercentage.toFixed(4)}%, difference between ${ask} ask and current ${price} order price ${diff}.`;
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
  tradeHistory.sort((a: { time: number; }, b: { time: number; }) => b.time - a.time);
  return tradeHistory.length > 0 ? tradeHistory[0] : "LOL";
}
