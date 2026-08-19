import mongoose from 'mongoose';

const giveawaySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true, index: true },
  hostId: { type: String, required: true },
  prize: { type: String, required: true },
  winnerCount: { type: Number, required: true, min: 1, max: 20 },
  endAt: { type: Date, required: true, index: true },
  ended: { type: Boolean, default: false, index: true },
  entries: { type: [String], default: [] },
  winners: { type: [String], default: [] },
  requirements: {
    roleId: String,
    minMessages: { type: Number, default: 0 },
    minDailyAverage: { type: Number, default: 0 },
    minInvites: { type: Number, default: 0 },
    minAccountAgeDays: { type: Number, default: 0 },
    minServerAgeDays: { type: Number, default: 0 }
  },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

export const Giveaway = mongoose.model('Giveaway', giveawaySchema);
