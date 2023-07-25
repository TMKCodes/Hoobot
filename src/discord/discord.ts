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