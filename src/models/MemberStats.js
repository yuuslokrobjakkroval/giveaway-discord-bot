import mongoose from 'mongoose';

const memberStatsSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  messages: { type: Number, default: 0 },
  trackingStartedAt: { type: Date, default: Date.now },
  validInvites: { type: Number, default: 0 }
}, { timestamps: true });
memberStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const MemberStats = mongoose.model('MemberStats', memberStatsSchema);
