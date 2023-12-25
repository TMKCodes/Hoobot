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
import fs from 'fs';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { getBalancesWith } from '../../Hoobot/Binance/Balances';

export default {
  builder: new SlashCommandBuilder()
    .setName("roi")
    .setDescription("Calculates ROI since first recorded balance."),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const currentBalances = await getBalancesWith(binance, "USDT");
    if (!fs.existsSync('balances.json')) {
      await interaction.reply("There are no stored balances in balances.json file yet. Investigate!");
    }
    const storedBalances = JSON.parse(fs.readFileSync("balances.json", 'utf-8') || "[]");
    const totalCurrentFiat = Object.values(currentBalances)
                            .reduce((acc, cur) => acc + cur.fiat, 0);
    const totalFirstFiat = Object.values(storedBalances[0][Object.keys(storedBalances[0])[0]] as Record<string, { crypto: number, fiat: number }>)
                            .reduce((acc, cur) => acc + cur.fiat, 0);
    const diff = totalCurrentFiat - totalFirstFiat;
    const roi = ((totalCurrentFiat - totalFirstFiat) / totalFirstFiat) * 100;

    await interaction.reply(`Initial balance: ${totalFirstFiat.toFixed(2)} USDT\r\nCurrent balance. ${totalCurrentFiat.toFixed(2)} USDT\r\nDifference: ${diff.toFixed(2)} USDT\r\nROI: ${roi.toFixed(2)} %`);
  }
}