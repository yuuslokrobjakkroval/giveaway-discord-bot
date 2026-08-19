import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Giveaway } from '../models/Giveaway.js';
import { MemberStats } from '../models/MemberStats.js';
import { fillTemplate } from '../utils/format.js';

const buttonStyles = { Primary: ButtonStyle.Primary, Secondary: ButtonStyle.Secondary, Success: ButtonStyle.Success, Danger: ButtonStyle.Danger };

export function buildGiveawayMessage(giveaway, guild, disabled = false) {
  const design = giveaway.snapshot.embed;
  const embed = new EmbedBuilder()
    .setColor(design.color || '#5865F2')
    .setTitle(fillTemplate(design.title, giveaway, guild))
    .setDescription(fillTemplate(design.description, giveaway, guild));
  if (design.footer) embed.setFooter({ text: fillTemplate(design.footer, giveaway, guild) });
  if (design.author) embed.setAuthor({ name: fillTemplate(design.author, giveaway, guild) });
  if (design.thumbnail) embed.setThumbnail(design.thumbnail);
  if (design.image) embed.setImage(design.image);
  const button = new ButtonBuilder()
    .setCustomId(`giveaway:enter:${giveaway.messageId}`)
    .setLabel(giveaway.snapshot.button.label)
    .setStyle(buttonStyles[giveaway.snapshot.button.style] || ButtonStyle.Primary)
    .setDisabled(disabled);
  if (giveaway.snapshot.button.emoji) button.setEmoji(giveaway.snapshot.button.emoji);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export async function eligibility(member, giveaway) {
  const req = giveaway.requirements || {};
  if (req.roleId && !member.roles.cache.has(req.roleId)) return [false, 'You do not have the required role.'];
  const stats = await MemberStats.findOne({ guildId: member.guild.id, userId: member.id });
  const messages = stats?.messages || 0;
  const daysTracked = Math.max(1, (Date.now() - (stats?.trackingStartedAt?.getTime() || Date.now())) / 86400000);
  if (messages < (req.minMessages || 0)) return [false, `You need ${req.minMessages} tracked messages.`];
  if (messages / daysTracked < (req.minDailyAverage || 0)) return [false, `You need a ${req.minDailyAverage} daily message average.`];
  if ((stats?.validInvites || 0) < (req.minInvites || 0)) return [false, `You need ${req.minInvites} valid invites.`];
  const accountDays = (Date.now() - member.user.createdTimestamp) / 86400000;
  if (accountDays < (req.minAccountAgeDays || 0)) return [false, `Your account must be ${req.minAccountAgeDays} days old.`];
  const serverDays = (Date.now() - member.joinedTimestamp) / 86400000;
  if (serverDays < (req.minServerAgeDays || 0)) return [false, `You must be in this server for ${req.minServerAgeDays} days.`];
  return [true, null];
}

async function weightedWinners(giveaway, guild, count, excluded = []) {
  const candidates = [];
  const excludedIds = new Set(excluded);
  for (const userId of giveaway.entries) {
    if (excludedIds.has(userId)) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) continue;
    const [eligible] = await eligibility(member, giveaway);
    if (!eligible) continue;
    const multiplier = Math.max(1, ...giveaway.snapshot.bonusRoles.filter(x => member.roles.cache.has(x.roleId)).map(x => x.multiplier));
    candidates.push({ userId, weight: multiplier });
  }
  const winners = [];
  while (candidates.length && winners.length < count) {
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    let index = 0;
    for (; index < candidates.length; index++) {
      roll -= candidates[index].weight;
      if (roll < 0) break;
    }
    winners.push(candidates[index].userId);
    candidates.splice(index, 1);
  }
  return winners;
}

export async function finishGiveaway(client, giveaway, reroll = false) {
  const guild = await client.guilds.fetch(giveaway.guildId);
  const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('Giveaway channel is unavailable');
  const previousWinners = reroll ? [...giveaway.winners] : [];
  let winners = await weightedWinners(giveaway, guild, giveaway.winnerCount, previousWinners);
  // If too few other eligible entrants remain, fill the draw from the complete pool.
  if (reroll && winners.length < giveaway.winnerCount) {
    const fallback = await weightedWinners(giveaway, guild, giveaway.winnerCount, winners);
    winners = [...winners, ...fallback].slice(0, giveaway.winnerCount);
  }
  giveaway.winners = winners;
  giveaway.ended = true;
  await giveaway.save();
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (message) await message.edit(buildGiveawayMessage(giveaway, guild, true));
  const mentions = winners.length ? winners.map(id => `<@${id}>`).join(', ') : 'No eligible entries';
  await channel.send({ content: `${reroll ? '🔄 New winner(s)' : '🎉 Congratulations'} ${mentions}! You won **${giveaway.prize}**.` });
  // Older giveaways have no stored toggle, so undefined preserves the original enabled behavior.
  if (giveaway.snapshot.dmWinners !== false) {
    for (const id of winners) {
      const user = await client.users.fetch(id).catch(() => null);
      await user?.send(`🎉 You won **${giveaway.prize}** in **${guild.name}**!`).catch(() => null);
    }
  }
  return winners;
}

export function startScheduler(client) {
  const run = async () => {
    const due = await Giveaway.find({ ended: false, endAt: { $lte: new Date() } }).limit(25);
    for (const giveaway of due) await finishGiveaway(client, giveaway).catch(error => console.error('Failed to finish giveaway', giveaway.id, error));
  };
  run().catch(console.error);
  return setInterval(() => run().catch(console.error), 15000);
}
