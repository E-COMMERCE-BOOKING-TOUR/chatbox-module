import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './schemas/message.schema';
import { Conversation } from './schemas/conversation.schema';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel(Message.name) private messageModel: Model<Message>,
        @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    ) { }

    async createConversation(participants: { userId: string; role: string; name?: string }[]) {
        // Check if same participants already exist (ignoring order)
        // This is a basic check. In production, might need more robust query if > 2 participants.
        // For 1:1, we want unique pair.

        // Normalize to ensure consistent searching if needed, but for now we look for exact match of participants set is complex in mongo.
        // Simplified: Just create new or find exact match.

        // Finding existing:
        // We want a conversation where exact participants exist.
        // Logic: Find conversation where size is X and all elements match.

        // For simplicity in this demo, let's trust the caller or just create if not exists
        // A better approach for 1:1 is to search.

        // Sort participants by userId to create a deterministic key if we wanted, 
        // but here let's query.

        // Simplest query for 2 people:
        if (participants.length === 2) {
            const [p1, p2] = participants;
            const existing = await this.conversationModel.findOne({
                $and: [
                    { participants: { $elemMatch: { userId: p1.userId, role: p1.role } } },
                    { participants: { $elemMatch: { userId: p2.userId, role: p2.role } } },
                    { participants: { $size: 2 } }
                ]
            });
            if (existing) return existing;
        }

        const conversation = new this.conversationModel({ participants });
        return conversation.save();
    }

    async getUserConversations(userId: string) {
        return this.conversationModel.find({
            participants: { $elemMatch: { userId } }
        }).sort({ updatedAt: -1 }).exec();
    }

    async updateUserInfo(userId: string, name: string) {
        // Update name for this user in all conversations
        return this.conversationModel.updateMany(
            { "participants.userId": userId },
            { $set: { "participants.$.name": name } }
        );
    }

    async createMessage(data: { conversationId: string; senderId: string; senderRole: string; content: string }) {
        const message = new this.messageModel(data);
        const saved = await message.save();

        // Update conversation last message
        await this.conversationModel.findByIdAndUpdate(data.conversationId, {
            lastMessage: data.content,
            lastMessageAt: new Date(),
        });

        return saved;
    }

    async getMessages(conversationId: string) {
        return this.messageModel.find({ conversationId }).sort({ createdAt: 1 }).exec();
    }
}
