import mongoose from 'mongoose';

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  embed: {
    title: { type: String, default: '🎉 {prize}' },
    description: { type: String, default: 'Click the button below to enter!\n\nWinners: **{winners}**\nEnds: {end_relative}\nHosted by: {host}\nRequirements: {requirements}' },
    footer: { type: String, default: '{entries} entries • Good luck!' },
    author: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    image: { type: String, default: '' },
    color: { type: String, default: '#5865F2' }
  },
  button: {
    label: { type: String, default: 'Enter Giveaway' },
    emoji: { type: String, default: '🎉' },
    style: { type: String, enum: ['Primary', 'Secondary', 'Success', 'Danger'], default: 'Primary' }
  },
  notifications: {
    dmWinners: { type: Boolean, default: true }
  },
  managerRoleIds: { type: [String], default: [] },
  bonusRoles: { type: [{ roleId: String, multiplier: { type: Number, min: 1, max: 100 } }], default: [] }
}, { timestamps: true });

export const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);
export async function getGuildConfig(guildId) {
  return GuildConfig.findOneAndUpdate({ guildId }, { $setOnInsert: { guildId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
