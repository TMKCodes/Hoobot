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

import { Client, GatewayIntentBits, Events, RESTPostAPIChatInputApplicationCommandsJSONBody, TextChannel } from 'discord.js'; 
import { deployCommands } from './commands/deploy';

const deployable: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
interface command {
  name: string,
  execute: any,
}
const commands: command[] = [];
  
// Import your commands. 
// Push your command data as json to deployable commands.
// Push your command name and execute to commands.
import ping from './commands/ping';
deployable.push(ping.builder.toJSON());
commands.push({name: ping.builder.name, execute: ping.execute});

import binanceBalance from './commands/binanceBalance';
deployable.push(binanceBalance.builder.toJSON());
commands.push({name: binanceBalance.builder.name, execute: binanceBalance.execute});

import binanceProfit from './commands/binanceProfit';
deployable.push(binanceProfit.builder.toJSON());
commands.push({name: binanceProfit.builder.name, execute: binanceProfit.execute});

import binancePossibleProfit from './commands/binancePossibleProfit';
deployable.push(binancePossibleProfit.builder.toJSON());
commands.push({name: binancePossibleProfit.builder.name, execute: binancePossibleProfit.execute});

import binanceLastTrades from './commands/binanceLastTrades';
deployable.push(binanceLastTrades.builder.toJSON());
commands.push({name: binanceLastTrades.builder.name, execute: binanceLastTrades.execute});

import avatar from './commands/avatar';
deployable.push(avatar.builder.toJSON());
commands.push({name: avatar.builder.name, execute: avatar.execute});

import server from './commands/server';
deployable.push(server.builder.toJSON());
commands.push({name: server.builder.name, execute: server.execute});

import fkick from './commands/fkick';
import { ConfigOptions } from '../binance/args';
import Binance from 'node-binance-api';
deployable.push(fkick.builder.toJSON());
commands.push({name: fkick.builder.name, execute: fkick.execute});


export const loginDiscord = (binance: Binance, options: ConfigOptions): Client => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const client = new Client({ intents: [GatewayIntentBits.Guilds]});
  if(token === undefined) {
    console.log("Discord bot token has not been set.");
  } else {
    deployCommands(deployable);
    client.once(Events.ClientReady, (c) => {
      console.log(`Logged in as ${c.user.tag}`);
    });
    client.on(Events.InteractionCreate, async (interaction) => {
      if(!interaction.isChatInputCommand()) return;
      commands.forEach(async (command) => {
        if(command.name == interaction.commandName) {
          try {
            await command.execute(interaction, binance, options);
          } catch (error) {
            console.log(error);
            if(interaction.replied || interaction.deferred) {
              await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
              await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
          }
        }
      });
    });
    client.login(token);
    return client;
  }
  return client;
}

// Function to send a message to a channel by its ID
export const sendMessageToChannel = async (client: Client, channelId: string, message: string) => {
  if(client == undefined) {
    console.error(`Error sending message to channel with ID ${channelId}, discord client was undefined.`);
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel instanceof TextChannel) {
      channel.send(message);
      console.log(`Message sent to channel ${channelId}`);
    } else {
      console.log(`Channel with ID ${channelId} not found or is not a text channel.`);
    }
  } catch (error) {
    console.error(`Error sending message to channel with ID ${channelId}: ${error}`);
  }
};