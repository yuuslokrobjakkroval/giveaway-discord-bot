import { InviteJoin } from '../models/InviteJoin.js';
import { MemberStats } from '../models/MemberStats.js';

const inviteCache = new Map();

export async function cacheGuildInvites(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (invites) inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
}

export async function trackJoin(member) {
  const before = inviteCache.get(member.guild.id) || new Map();
  const invites = await member.guild.invites.fetch().catch(() => null);
  if (!invites) return;
  const used = invites.find(invite => (invite.uses || 0) > (before.get(invite.code) || 0));
  inviteCache.set(member.guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  if (!used?.inviterId || used.inviterId === member.id) return;
  const existing = await InviteJoin.findOne({ guildId: member.guild.id, joinedUserId: member.id });
  if (existing?.active) return;
  await InviteJoin.findOneAndUpdate(
    { guildId: member.guild.id, joinedUserId: member.id },
    { inviterId: used.inviterId, inviteCode: used.code, active: true },
    { upsert: true, new: true }
  );
  await MemberStats.findOneAndUpdate({ guildId: member.guild.id, userId: used.inviterId }, { $inc: { validInvites: 1 }, $setOnInsert: { trackingStartedAt: new Date() } }, { upsert: true });
}

export async function trackLeave(member) {
  const join = await InviteJoin.findOneAndUpdate({ guildId: member.guild.id, joinedUserId: member.id, active: true }, { active: false }, { new: true });
  if (join) await MemberStats.updateOne({ guildId: member.guild.id, userId: join.inviterId, validInvites: { $gt: 0 } }, { $inc: { validInvites: -1 } });
}

export function updateInviteCache(invite) {
  const cache = inviteCache.get(invite.guild.id) || new Map();
  cache.set(invite.code, invite.uses || 0);
  inviteCache.set(invite.guild.id, cache);
}
