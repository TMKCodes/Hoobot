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

import { SlashCommandBuilder } from 'discord.js';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { Trade, getTradeHistory } from '../../Hoobot/Exchanges/Trades';

export default {
  builder: new SlashCommandBuilder()
    .setName("trades")
    .setDescription("Replis with last 10 trades on symbol.")
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const symbol: string = interaction.options.getString('symbol').toUpperCase(); 
    if (!symbol) {
      await interaction.reply("Please provide a valid symbol to check.");
      return;
    }
    const tradeHistory: Trade[] = await getTradeHistory(binance, symbol, options);
    const trades = tradeHistory.map((trade) => {
      return {
        orderId: trade.orderId,
        price: trade.price,
        qty: trade.qty,
        quoteQty: trade.quoteQty,
        commission: trade.commission,
        commissionAsset: trade.commissionAsset,
        isBuyer: trade.isBuyer,
        isMaker: trade.isMaker,
        isBestMatch: trade.isBestMatch,
        time: (new Date(trade.time).toLocaleString("fi-FI")),
      }
    })
    await interaction.reply(`${symbol}: ${JSON.stringify(trades, null, 4)}`);
  }
}
