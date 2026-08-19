import mongoose from 'mongoose';

const inviteJoinSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  joinedUserId: { type: String, required: true },
  inviterId: { type: String, required: true },
  inviteCode: { type: String, required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });
inviteJoinSchema.index({ guildId: 1, joinedUserId: 1 }, { unique: true });

export const InviteJoin = mongoose.model('InviteJoin', inviteJoinSchema);
