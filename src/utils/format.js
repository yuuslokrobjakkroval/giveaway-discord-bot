export function discordTimestamp(date, style = 'R') {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

export function requirementsText(req = {}) {
  const items = [];
  if (req.roleId) items.push(`<@&${req.roleId}>`);
  if (req.minMessages) items.push(`${req.minMessages} messages`);
  if (req.minDailyAverage) items.push(`${req.minDailyAverage}/day average`);
  if (req.minInvites) items.push(`${req.minInvites} invites`);
  if (req.minAccountAgeDays) items.push(`${req.minAccountAgeDays}d account age`);
  if (req.minServerAgeDays) items.push(`${req.minServerAgeDays}d server age`);
  return items.length ? items.join(' • ') : 'None';
}

export function fillTemplate(text = '', giveaway, guild) {
  const values = {
    prize: giveaway.prize,
    winners: giveaway.winnerCount,
    entries: giveaway.entries?.length ?? 0,
    host: `<@${giveaway.hostId}>`,
    end_timestamp: discordTimestamp(giveaway.endAt, 'F'),
    end_relative: discordTimestamp(giveaway.endAt, 'R'),
    requirements: requirementsText(giveaway.requirements),
    server: guild.name,
    channel: `<#${giveaway.channelId}>`
  };
  return text.replace(/\{([a-z_]+)\}/gi, (match, key) => values[key] ?? match);
}
