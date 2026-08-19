import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits, RoleSelectMenuBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import ms from 'ms';
import { Giveaway } from '../models/Giveaway.js';
import { getGuildConfig } from '../models/GuildConfig.js';
import { canManage } from '../utils/permissions.js';
import { buildGiveawayMessage, eligibility, finishGiveaway } from '../services/giveawayService.js';

const pendingStarts = new Map();
const pendingBonusRoles = new Map();

export const data = new SlashCommandBuilder()
  .setName('giveaway').setDescription('Create and manage giveaways').setDMPermission(false)
  .addSubcommand(s => s.setName('start').setDescription('Preview and start a giveaway')
    .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true).setMaxLength(200))
    .addStringOption(o => o.setName('duration').setDescription('Examples: 30m, 2h, 3d').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Giveaway channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption(o => o.setName('role').setDescription('Required role'))
    .addIntegerOption(o => o.setName('messages').setDescription('Minimum tracked messages').setMinValue(0))
    .addNumberOption(o => o.setName('daily_average').setDescription('Minimum daily message average').setMinValue(0))
    .addIntegerOption(o => o.setName('invites').setDescription('Minimum valid invites').setMinValue(0))
    .addIntegerOption(o => o.setName('account_age').setDescription('Minimum account age in days').setMinValue(0))
    .addIntegerOption(o => o.setName('server_age').setDescription('Minimum server membership in days').setMinValue(0)))
  .addSubcommand(s => s.setName('end').setDescription('End an active giveaway').addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
  .addSubcommand(s => s.setName('reroll').setDescription('Draw new winners').addStringOption(o => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
  .addSubcommand(s => s.setName('config').setDescription('Open the server configuration panel'));

function configPanel(config) {
  const bonuses = config.bonusRoles.map(x => `<@&${x.roleId}> ×${x.multiplier}`).join('\n') || 'None';
  const managers = config.managerRoleIds.map(id => `<@&${id}>`).join(', ') || 'Manage Server only';
  const embed = new EmbedBuilder().setColor(config.embed.color).setTitle('⚙️ Giveaway Configuration')
    .setDescription('Use the controls below. Changes are saved immediately to MongoDB.')
    .addFields(
      { name: 'Embed', value: `Title: ${config.embed.title}\nButton: ${config.button.emoji} ${config.button.label} (${config.button.style})\nWinner DMs: **${config.notifications.dmWinners ? 'Enabled' : 'Disabled'}**` },
      { name: 'Manager roles', value: managers }, { name: 'Bonus roles', value: bonuses }
    );
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config:appearance').setLabel('Text & Color').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:media').setLabel('Media').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:button').setLabel('Entry Button').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:dm-toggle').setLabel(config.notifications.dmWinners ? 'Disable Winner DMs' : 'Enable Winner DMs').setStyle(config.notifications.dmWinners ? ButtonStyle.Danger : ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('config:managers').setPlaceholder('Replace manager roles').setMinValues(0).setMaxValues(10)),
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('config:bonus').setPlaceholder('Choose a bonus role to set').setMinValues(1).setMaxValues(1))
  ] };
}

function input(id, label, value, style = TextInputStyle.Short, required = false) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setValue(value || '').setMaxLength(style === TextInputStyle.Paragraph ? 4000 : 200);
}

export async function execute(interaction) {
  if (!await canManage(interaction.member)) return interaction.reply({ content: 'You need Manage Server or a configured manager role.', ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === 'config') {
    const config = await getGuildConfig(interaction.guildId);
    return interaction.reply({ ...configPanel(config), ephemeral: true });
  }
  if (sub === 'start') {
    const duration = ms(interaction.options.getString('duration'));
    if (!duration || duration < 15000 || duration > ms('365d')) return interaction.reply({ content: 'Duration must be between 15 seconds and 365 days (for example `2h`).', ephemeral: true });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel?.isTextBased()) return interaction.reply({ content: 'Choose a text channel.', ephemeral: true });
    const config = await getGuildConfig(interaction.guildId);
    const draft = {
      guildId: interaction.guildId, channelId: channel.id, messageId: 'preview', hostId: interaction.user.id,
      prize: interaction.options.getString('prize'), winnerCount: interaction.options.getInteger('winners'),
      endAt: new Date(Date.now() + duration), entries: [], requirements: {
        roleId: interaction.options.getRole('role')?.id,
        minMessages: interaction.options.getInteger('messages') || 0,
        minDailyAverage: interaction.options.getNumber('daily_average') || 0,
        minInvites: interaction.options.getInteger('invites') || 0,
        minAccountAgeDays: interaction.options.getInteger('account_age') || 0,
        minServerAgeDays: interaction.options.getInteger('server_age') || 0
      }, snapshot: {
        embed: config.embed.toObject?.() || config.embed,
        button: config.button.toObject?.() || config.button,
        bonusRoles: config.bonusRoles.map(x => ({ roleId: x.roleId, multiplier: x.multiplier })),
        dmWinners: config.notifications.dmWinners
      }
    };
    const key = interaction.id;
    pendingStarts.set(key, { draft, expires: Date.now() + 10 * 60000 });
    const preview = buildGiveawayMessage(draft, interaction.guild, true);
    preview.components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`start:confirm:${key}`).setLabel('Confirm & Post').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`start:cancel:${key}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
    )];
    return interaction.reply({ content: `Preview for <#${channel.id}>:`, ...preview, ephemeral: true });
  }
  const messageId = interaction.options.getString('message_id');
  const giveaway = await Giveaway.findOne({ guildId: interaction.guildId, messageId });
  if (!giveaway) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
  if (sub === 'end' && giveaway.ended) return interaction.reply({ content: 'That giveaway has already ended.', ephemeral: true });
  if (sub === 'reroll' && !giveaway.ended) return interaction.reply({ content: 'End the giveaway before rerolling it.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  await finishGiveaway(interaction.client, giveaway, sub === 'reroll');
  return interaction.editReply(sub === 'reroll' ? 'Winners rerolled.' : 'Giveaway ended.');
}

export async function handleComponent(interaction) {
  const [area, action, key] = interaction.customId.split(':');
  if (area === 'giveaway' && action === 'enter') {
    const giveaway = await Giveaway.findOne({ messageId: key, ended: false });
    if (!giveaway) return interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
    const [ok, reason] = await eligibility(interaction.member, giveaway);
    if (!ok) return interaction.reply({ content: reason, ephemeral: true });
    const entered = giveaway.entries.includes(interaction.user.id);
    await Giveaway.updateOne({ _id: giveaway.id }, entered ? { $pull: { entries: interaction.user.id } } : { $addToSet: { entries: interaction.user.id } });
    const updated = await Giveaway.findById(giveaway.id);
    await interaction.update(buildGiveawayMessage(updated, interaction.guild));
    return interaction.followUp({ content: entered ? 'Your entry was removed.' : 'You are entered!', ephemeral: true });
  }
  if (!await canManage(interaction.member)) return interaction.reply({ content: 'You cannot manage giveaways.', ephemeral: true });
  if (area === 'start') {
    const pending = pendingStarts.get(key);
    if (!pending || pending.expires < Date.now()) return interaction.update({ content: 'This preview expired. Run `/giveaway start` again.', embeds: [], components: [] });
    pendingStarts.delete(key);
    if (action === 'cancel') return interaction.update({ content: 'Giveaway cancelled.', embeds: [], components: [] });
    await interaction.deferUpdate();
    const channel = await interaction.guild.channels.fetch(pending.draft.channelId);
    const placeholder = await channel.send({ content: 'Preparing giveaway…' });
    pending.draft.messageId = placeholder.id;
    const giveaway = await Giveaway.create(pending.draft);
    await placeholder.edit({ content: null, ...buildGiveawayMessage(giveaway, interaction.guild) });
    return interaction.editReply({ content: `Posted in <#${channel.id}> (message ID: ${placeholder.id}).`, embeds: [], components: [] });
  }
  if (area !== 'config') return;
  const config = await getGuildConfig(interaction.guildId);
  if (action === 'dm-toggle' && interaction.isButton()) {
    config.notifications.dmWinners = !config.notifications.dmWinners;
    await config.save();
    return interaction.update(configPanel(config));
  }
  if (interaction.isRoleSelectMenu()) {
    if (action === 'managers') {
      config.managerRoleIds = interaction.values;
      await config.save();
      return interaction.update(configPanel(config));
    }
    pendingBonusRoles.set(interaction.user.id, interaction.values[0]);
    const current = config.bonusRoles.find(x => x.roleId === interaction.values[0])?.multiplier || 2;
    const modal = new ModalBuilder().setCustomId('configmodal:bonus').setTitle('Bonus Role Multiplier')
      .addComponents(new ActionRowBuilder().addComponents(input('multiplier', 'Multiplier (1 removes the bonus)', String(current), TextInputStyle.Short, true)));
    return interaction.showModal(modal);
  }
  let modal;
  if (action === 'appearance') modal = new ModalBuilder().setCustomId('configmodal:appearance').setTitle('Giveaway Embed Text').addComponents(
    new ActionRowBuilder().addComponents(input('title', 'Title', config.embed.title, TextInputStyle.Short, true)),
    new ActionRowBuilder().addComponents(input('description', 'Description', config.embed.description, TextInputStyle.Paragraph, true)),
    new ActionRowBuilder().addComponents(input('footer', 'Footer', config.embed.footer)),
    new ActionRowBuilder().addComponents(input('author', 'Author name', config.embed.author)),
    new ActionRowBuilder().addComponents(input('color', 'Hex color', config.embed.color, TextInputStyle.Short, true)));
  if (action === 'media') modal = new ModalBuilder().setCustomId('configmodal:media').setTitle('Giveaway Images').addComponents(
    new ActionRowBuilder().addComponents(input('thumbnail', 'Thumbnail URL (blank removes)', config.embed.thumbnail)),
    new ActionRowBuilder().addComponents(input('image', 'Banner image URL (blank removes)', config.embed.image)));
  if (action === 'button') modal = new ModalBuilder().setCustomId('configmodal:button').setTitle('Entry Button').addComponents(
    new ActionRowBuilder().addComponents(input('label', 'Button label', config.button.label, TextInputStyle.Short, true)),
    new ActionRowBuilder().addComponents(input('emoji', 'Emoji (blank for none)', config.button.emoji)),
    new ActionRowBuilder().addComponents(input('style', 'Primary, Secondary, Success, or Danger', config.button.style, TextInputStyle.Short, true)));
  if (modal) return interaction.showModal(modal);
}

export async function handleModal(interaction) {
  if (!interaction.customId.startsWith('configmodal:') || !await canManage(interaction.member)) return;
  const action = interaction.customId.split(':')[1];
  const config = await getGuildConfig(interaction.guildId);
  const value = id => interaction.fields.getTextInputValue(id).trim();
  if (action === 'appearance') {
    const color = value('color');
    if (!/^#[0-9a-f]{6}$/i.test(color)) return interaction.reply({ content: 'Color must be a six-digit hex value such as `#5865F2`.', ephemeral: true });
    Object.assign(config.embed, { title: value('title'), description: value('description'), footer: value('footer'), author: value('author'), color });
  } else if (action === 'media') {
    for (const id of ['thumbnail', 'image']) if (value(id) && !/^https?:\/\//i.test(value(id))) return interaction.reply({ content: 'Image values must be valid HTTP(S) URLs.', ephemeral: true });
    Object.assign(config.embed, { thumbnail: value('thumbnail'), image: value('image') });
  } else if (action === 'button') {
    const style = value('style')[0]?.toUpperCase() + value('style').slice(1).toLowerCase();
    if (!['Primary', 'Secondary', 'Success', 'Danger'].includes(style)) return interaction.reply({ content: 'Invalid button style.', ephemeral: true });
    Object.assign(config.button, { label: value('label'), emoji: value('emoji'), style });
  } else if (action === 'bonus') {
    const roleId = pendingBonusRoles.get(interaction.user.id);
    pendingBonusRoles.delete(interaction.user.id);
    const multiplier = Number(value('multiplier'));
    if (!roleId || !Number.isInteger(multiplier) || multiplier < 1 || multiplier > 100) return interaction.reply({ content: 'Multiplier must be a whole number from 1 to 100.', ephemeral: true });
    config.bonusRoles = config.bonusRoles.filter(x => x.roleId !== roleId);
    if (multiplier > 1) config.bonusRoles.push({ roleId, multiplier });
  }
  await config.save();
  return interaction.reply({ content: 'Configuration saved.', ephemeral: true });
}
