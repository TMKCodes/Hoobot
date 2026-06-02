import {
  Client,
  GatewayIntentBits,
  Events,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  TextChannel,
  Interaction,
  CacheType,
  MessageFlags,
} from "discord.js";
import { deployCommands } from "./Commands/deploy";
import { ConfigOptions, DiscordOptions } from "../Hoobot/Utilities/Args";
import { Exchange } from "../Hoobot/Exchanges/Exchange";
import { logToFile } from "../Hoobot/Utilities/LogToFile";

const deployable: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
interface command {
  name: string;
  execute: any;
}
const commands: command[] = [];

// Import your commands.
// Push your command data as json to deployable commands.
// Push your command name and execute to commands.
import ping from "./Commands/ping";
deployable.push(ping.builder.toJSON());
commands.push({ name: ping.builder.name, execute: ping.execute });

import balance from "./Commands/Balance";
deployable.push(balance.builder.toJSON());
commands.push({ name: balance.builder.name, execute: balance.execute });

import upnl from "./Commands/UPNL";
deployable.push(upnl.builder.toJSON());
commands.push({ name: upnl.builder.name, execute: upnl.execute });

import pnl from "./Commands/PNL";
deployable.push(pnl.builder.toJSON());
commands.push({ name: pnl.builder.name, execute: pnl.execute });

import roi from "./Commands/ROI";
deployable.push(roi.builder.toJSON());
commands.push({ name: roi.builder.name, execute: roi.execute });

import lasttrades from "./Commands/LastTrades";
deployable.push(lasttrades.builder.toJSON());
commands.push({ name: lasttrades.builder.name, execute: lasttrades.execute });

import avatar from "./Commands/avatar";
deployable.push(avatar.builder.toJSON());
commands.push({ name: avatar.builder.name, execute: avatar.execute });

import server from "./Commands/server";
deployable.push(server.builder.toJSON());
commands.push({ name: server.builder.name, execute: server.execute });

import roll from "./Commands/Roll";
deployable.push(roll.builder.toJSON());
commands.push({ name: roll.builder.name, execute: roll.execute });

import fkick from "./Commands/fkick";
deployable.push(fkick.builder.toJSON());
commands.push({ name: fkick.builder.name, execute: fkick.execute });

const createDiscordClient = async (
  label: string,
  exchanges: Exchange[],
  options: ConfigOptions,
  discordConfig: DiscordOptions | undefined,
): Promise<Client | undefined> => {
  if (!discordConfig?.token) {
    console.log(`Discord (${label}): token not set, skipping login.`);
    return undefined;
  }
  if (!discordConfig.applicationId) {
    console.log(`Discord (${label}): applicationId not set, skipping login.`);
    return undefined;
  }
  if (!discordConfig.serverId) {
    console.log(`Discord (${label}): serverId not set, skipping login.`);
    return undefined;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    console.log(`Discord (${label}): logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction<CacheType>) => {
    try {
      if (interaction.isChatInputCommand()) {
        for (const command of commands) {
          if (command.name === interaction.commandName) {
            await command.execute(interaction, exchanges, options);
            break;
          }
        }
      }
    } catch (error) {
      logToFile("./logs/error.log", JSON.stringify(error, null, 4));
      console.error(`Discord (${label}) command error:`, error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Komennon suoritus epäonnistui.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });

  client.on(Events.Error, (error: Error) => {
    console.error(`Discord (${label}) client error:`, error);
  });

  await deployCommands(deployable, discordConfig);
  await client.login(discordConfig.token);
  return client;
};

export const loginDiscord = async (exchanges: Exchange[], options: ConfigOptions): Promise<Client | undefined> => {
  // Primary bot (uses options.discord)
  const primary = await createDiscordClient("primary", exchanges, options, options.discord);

  // Optional secondary bot (uses options.discordSecondary)
  if (options.discordSecondary?.enabled) {
    await createDiscordClient("secondary", exchanges, options, options.discordSecondary);
  }

  return primary;
};

// Function to send a message to a channel by its ID
export const sendMessageToChannel = async (
  client: Client | undefined,
  channelId: string | undefined,
  message: string,
) => {
  if (client === undefined) {
    console.error("Discord: client undefined, cannot send message.");
    return;
  }
  if (channelId === undefined || channelId === "") {
    console.error("Discord: channelId not set, cannot send message.");
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel instanceof TextChannel) {
      await channel.send(message);
    } else {
      console.log(`Discord: channel ${channelId} not found or is not a text channel.`);
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(`Discord: error sending message to channel ${channelId}:`, error);
  }
};
