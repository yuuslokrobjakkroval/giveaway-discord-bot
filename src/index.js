import 'dotenv/config';
import mongoose from 'mongoose';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { execute, handleComponent, handleModal } from './commands/giveaway.js';
import { MemberStats } from './models/MemberStats.js';
import { cacheGuildInvites, trackJoin, trackLeave, updateInviteCache } from './services/inviteTracker.js';
import { startScheduler } from './services/giveawayService.js';

for (const key of ['DISCORD_TOKEN', 'MONGODB_URI']) if (!process.env[key]) throw new Error(`${key} is required`);
await mongoose.connect(process.env.MONGODB_URI);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildInvites],
  partials: [Partials.GuildMember]
});

client.once(Events.ClientReady, async ready => {
  console.log(`Ready as ${ready.user.tag}`);
  await Promise.allSettled(ready.guilds.cache.map(cacheGuildInvites));
  startScheduler(client);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') await execute(interaction);
    else if (interaction.isButton() || interaction.isRoleSelectMenu()) await handleComponent(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (error) {
    console.error('Interaction failed', error);
    const response = { content: 'Something went wrong while processing that action.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => null);
    else await interaction.reply(response).catch(() => null);
  }
});

client.on(Events.MessageCreate, message => {
  if (!message.guild || message.author.bot) return;
  MemberStats.findOneAndUpdate(
    { guildId: message.guild.id, userId: message.author.id },
    { $inc: { messages: 1 }, $setOnInsert: { trackingStartedAt: new Date() } },
    { upsert: true }
  ).catch(console.error);
});
client.on(Events.GuildMemberAdd, member => trackJoin(member).catch(console.error));
client.on(Events.GuildMemberRemove, member => trackLeave(member).catch(console.error));
client.on(Events.InviteCreate, updateInviteCache);
client.on(Events.InviteDelete, invite => cacheGuildInvites(invite.guild).catch(console.error));
client.on(Events.GuildCreate, guild => cacheGuildInvites(guild).catch(console.error));

process.on('SIGINT', async () => { client.destroy(); await mongoose.disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { client.destroy(); await mongoose.disconnect(); process.exit(0); });
await client.login(process.env.DISCORD_TOKEN);
