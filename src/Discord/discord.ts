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

import { Client, GatewayIntentBits, Events, RESTPostAPIChatInputApplicationCommandsJSONBody, TextChannel, Interaction, CacheType } from 'discord.js'; 
import { deployCommands } from './Commands/deploy';

const deployable: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
interface command {
  name: string,
  execute: any,
}
const commands: command[] = [];
  
// Import your commands. 
// Push your command data as json to deployable commands.
// Push your command name and execute to commands.
import ping from './Commands/ping';
deployable.push(ping.builder.toJSON());
commands.push({name: ping.builder.name, execute: ping.execute});

import binanceBalance from './Commands/binanceBalance';
deployable.push(binanceBalance.builder.toJSON());
commands.push({name: binanceBalance.builder.name, execute: binanceBalance.execute});

import binancePossibleProfit from './Commands/binanceUPNL';
deployable.push(binancePossibleProfit.builder.toJSON());
commands.push({name: binancePossibleProfit.builder.name, execute: binancePossibleProfit.execute});

import binancePNL from './Commands/binancePNL';
deployable.push(binancePNL.builder.toJSON());
commands.push({name: binancePNL.builder.name, execute: binancePNL.execute});


import binanceROI from './Commands/binanceROI';
deployable.push(binanceROI.builder.toJSON());
commands.push({name: binanceROI.builder.name, execute: binanceROI.execute});

import binanceLastTrades from './Commands/binanceLastTrades';
deployable.push(binanceLastTrades.builder.toJSON());
commands.push({name: binanceLastTrades.builder.name, execute: binanceLastTrades.execute});

import avatar from './Commands/avatar';
deployable.push(avatar.builder.toJSON());
commands.push({name: avatar.builder.name, execute: avatar.execute});

import server from './Commands/server';
deployable.push(server.builder.toJSON());
commands.push({name: server.builder.name, execute: server.execute});

import fkick from './Commands/fkick';
import { ConfigOptions } from '../Hoobot/Utilities/args';
import Binance from 'node-binance-api';
import { Exchange } from 'src/Hoobot/Exchanges/Exchange';

deployable.push(fkick.builder.toJSON());
commands.push({name: fkick.builder.name, execute: fkick.execute});


/*

//home/tonto/hoobot-dev/build/hoobot.js:2:460265)
    at e.exports.handlePacket (file:///home/tonto/hoobot-dev/build/hoobot.js:2:455027)
    at Ae.<anonymous> (file:///home/tonto/hoobot-dev/build/hoobot.js:2:453394)
    at Ae.emit (file:///home/tonto/hoobot-dev/build/hoobot.js:2:152412)
    at ae.<anonymous> (file:///home/tonto/hoobot-dev/build/hoobot.js:2:92228)
    at ae.emit (file:///home/tonto/hoobot-dev/build/hoobot.js:2:152412)
    at ae.onMessage (file:///home/tonto/hoobot-dev/build/hoobot.js:2:87989)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)

//home/tonto/hoobot-dev/build/hoobot.js:2:460265)
    at e.exports.handlePacket (file:///home/tonto/hoobot-dev/build/hoobot.js:2:455027)
    at Ae.<anonymous> (file:///home/tonto/hoobot-dev/build/hoobot.js:2:453394)
    at Ae.emit (file:///home/tonto/hoobot-dev/build/hoobot.js:2:152412)
    at ae.<anonymous> (file:///home/tonto/hoobot-dev/build/hoobot.js:2:92228)
    at ae.emit (file:///home/tonto/hoobot-dev/build/hoobot.js:2:152412)
    at ae.onMessage (file:///home/tonto/hoobot-dev/build/hoobot.js:2:87989)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)

*/

export const loginDiscord = (exchange: Exchange, options: ConfigOptions): Client => {
  const token = options.discordBotToken;
  const client = new Client({ intents: [GatewayIntentBits.Guilds]});
  if(token === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot token has not been set.");
  } else {
    deployCommands(deployable, options);
    client.once(Events.ClientReady, (c) => {
      console.log(`Logged in as ${c.user.tag}`);
    });
    client.on(Events.InteractionCreate, (interaction: Interaction<CacheType>) => {
      const handleInteraction = async (interaction: Interaction<CacheType>) => {
        try {
          if(interaction.isChatInputCommand()) {
            commands.forEach(async (command) => {
              if(command.name == interaction.commandName) {
                return await command.execute(interaction, exchange, options);
              }
            });
          }
        } catch (error) {
          console.log(error);
        }
      }
      return handleInteraction(interaction);
    });
    client.on(Events.Error, (error: Error) => {
      console.log(JSON.stringify(error));
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
    } else {
      console.log(`Channel with ID ${channelId} not found or is not a text channel.`);
    }
  } catch (error) {
    console.error(`Error sending message to channel with ID ${channelId}: ${error}`);
  }
};