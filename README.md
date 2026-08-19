# Advanced Discord Giveaway Bot

A Discord.js v14 giveaway bot with MongoDB persistence, interactive configuration, eligibility rules, weighted bonus entries, invite tracking, rerolls, DMs, and a 15-second end scheduler.

## Setup

1. Install Node.js 20+ and MongoDB.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the values.
4. In the Discord Developer Portal, enable **Server Members Intent** and **Message Content Intent**.
5. Invite the bot with the `bot` and `applications.commands` scopes. Recommended permissions: View Channels, Send Messages, Embed Links, Read Message History, Manage Messages, and Manage Server (invite tracking requires access to server invites).
6. Run `npm run deploy`, then `npm start`.

Set `DISCORD_GUILD_ID` while developing for instant command updates. Remove it to deploy globally (global command propagation can take time).

## Commands

- `/giveaway config` — embed text, images, button, manager roles, and bonus multipliers.
- `/giveaway start` — define the prize, duration, winners, channel, and any combination of requirements; preview before posting.
- `/giveaway end message_id:<id>` — end immediately.
- `/giveaway reroll message_id:<id>` — select fresh winners from an ended giveaway.

The giveaway message ID is shown after posting and can also be copied using Discord Developer Mode.

## Placeholders

`{prize}`, `{winners}`, `{entries}`, `{host}`, `{end_timestamp}`, `{end_relative}`, `{requirements}`, `{server}`, and `{channel}` are supported in configured embed text.

## Tracking notes

Message totals and daily averages begin when a member sends their first message after the bot is installed. Invite attribution is based on the invite-use count changing at join time. Discord does not expose reliable attribution for vanity URLs, and invite attribution can be ambiguous if multiple uses change at nearly the same moment.
