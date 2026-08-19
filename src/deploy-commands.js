import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data } from './commands/giveaway.js';

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
await rest.put(route, { body: [data.toJSON()] });
console.log(`Deployed /giveaway ${process.env.DISCORD_GUILD_ID ? 'to the development guild' : 'globally'}.`);
