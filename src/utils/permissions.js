import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../models/GuildConfig.js';

export async function canManage(member) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const config = await getGuildConfig(member.guild.id);
  return config.managerRoleIds.some(id => member.roles.cache.has(id));
}
