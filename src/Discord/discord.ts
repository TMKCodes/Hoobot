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
import { ConfigOptions } from '../Hoobot/Utilities/args';
import { Exchange } from '../Hoobot/Exchanges/Exchange';
import { logToFile } from '../Hoobot/Utilities/logToFile';

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

import balance from './Commands/Balance';
deployable.push(balance.builder.toJSON());
commands.push({name: balance.builder.name, execute: balance.execute});

import upnl from './Commands/UPNL';
deployable.push(upnl.builder.toJSON());
commands.push({name: upnl.builder.name, execute: upnl.execute});

import pnl from './Commands/PNL';
deployable.push(pnl.builder.toJSON());
commands.push({name: pnl.builder.name, execute: pnl.execute});

import roi from './Commands/ROI';
deployable.push(roi.builder.toJSON());
commands.push({name: roi.builder.name, execute: roi.execute});

import lasttrades from './Commands/LastTrades';
deployable.push(lasttrades.builder.toJSON());
commands.push({name: lasttrades.builder.name, execute: lasttrades.execute});

import avatar from './Commands/avatar';
deployable.push(avatar.builder.toJSON());
commands.push({name: avatar.builder.name, execute: avatar.execute});

import server from './Commands/server';
deployable.push(server.builder.toJSON());
commands.push({name: server.builder.name, execute: server.execute});

import roll from './Commands/Roll';
deployable.push(roll.builder.toJSON());
commands.push({name: roll.builder.name, execute: roll.execute});

import fkick from './Commands/fkick';
deployable.push(fkick.builder.toJSON());
commands.push({name: fkick.builder.name, execute: fkick.execute});

export const loginDiscord = async (exchanges: Exchange[], options: ConfigOptions): Promise<Client> => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds]});
  if(options.discord.token === undefined) {
    console.log("Discord bot token has not been set.");
  } else {
    await deployCommands(deployable, options);
    client.once(Events.ClientReady, (c) => {
      console.log(`Logged in as ${c.user.tag}`);
    });
    client.on(Events.InteractionCreate, (interaction: Interaction<CacheType>) => {
      const handleInteraction = async (interaction: Interaction<CacheType>) => {
        try {
          if(interaction.isChatInputCommand()) {
            commands.forEach(async (command) => {
              if(command.name == interaction.commandName) {
                return await command.execute(interaction, exchanges, options);
              }
            });
          }
        } catch (error) {
          logToFile("./logs/error.log", JSON.stringify(error, null, 4));
          console.error(error);
        }
      }
      return handleInteraction(interaction);
    });
    client.on(Events.Error, (error: Error) => {
      console.log(JSON.stringify(error, null, 4));
    });
    client.login(options.discord.token);
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
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(`Error sending message to channel with ID ${channelId}: ${error}`);
  }
};