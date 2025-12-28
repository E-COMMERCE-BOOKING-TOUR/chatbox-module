import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './schemas/message.schema';
import { Conversation } from './schemas/conversation.schema';
import { Subject } from 'rxjs';

import { ChatAiService } from './chat-ai.service';

@Injectable()
export class ChatService {
    public readonly messageSubject = new Subject<any>();

    constructor(
        @InjectModel(Message.name) private messageModel: Model<Message>,
        @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
        private readonly chatAiService: ChatAiService,
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

    async getAllConversations(page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.conversationModel.find()
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.conversationModel.estimatedDocumentCount()
        ]);
        return { data, total, page, limit, total_pages: Math.ceil(total / limit) };
    }

    async updateUserInfo(userId: string, name: string) {
        // Update name for this user in all conversations
        return this.conversationModel.updateMany(
            { "participants.userId": userId },
            { $set: { "participants.$.name": name } }
        );
    }

    async updateCategory(conversationId: string, category: string) {
        return this.conversationModel.findByIdAndUpdate(conversationId, { category }, { new: true }).exec();
    }

    async toggleHide(conversationId: string, isHidden: boolean) {
        return this.conversationModel.findByIdAndUpdate(conversationId, { isHidden }, { new: true }).exec();
    }

    async toggleAi(conversationId: string, isAiEnabled: boolean) {
        return this.conversationModel.findByIdAndUpdate(conversationId, { isAiEnabled }, { new: true }).exec();
    }

    async toggleHumanTakeover(conversationId: string, isHumanTakeover: boolean) {
        return this.conversationModel.findByIdAndUpdate(conversationId, { isHumanTakeover }, { new: true }).exec();
    }

    async markAsRead(conversationId: string) {
        return this.conversationModel.findByIdAndUpdate(conversationId, { unreadCount: 0 }, { new: true }).exec();
    }

    async createMessage(data: { conversationId: string; senderId: string; senderRole: string; senderName?: string; content: string }) {
        const message = new this.messageModel(data);
        const saved = await message.save();

        const isAdmin = data.senderRole === 'ADMIN' || data.senderRole === 'admin';
        const isAi = data.senderRole === 'AI';

        // Update conversation last message and unreadCount
        const update: any = {
            $set: {
                lastMessage: data.content,
                lastMessageAt: new Date(),
            }
        };

        if (isAdmin || isAi) {
            update.$set.unreadCount = 0;
        } else {
            update.$inc = { unreadCount: 1 };
        }

        const conversation = await this.conversationModel.findByIdAndUpdate(data.conversationId, update, { new: true });

        // AI Trigger Logic: If from user, and AI enabled, and NOT human takeover, and NOT from AI itself
        if (!isAdmin && !isAi && conversation?.isAiEnabled && !conversation?.isHumanTakeover) {
            // FIRE AND FORGET AI Response
            this.handleAiResponse(conversation, data.content).catch(err => console.error('AI trigger error:', err));
        }

        return saved;
    }

    private async handleAiResponse(conversation: any, userContent: string) {
        try {
            // Get last 10 messages for context
            const messages = await this.messageModel.find({ conversationId: conversation._id })
                .sort({ createdAt: -1 })
                .limit(10)
                .exec();

            const history = messages.reverse().map(m => ({
                role: (m.senderRole === 'ADMIN' || m.senderRole === 'admin' || m.senderRole === 'AI') ? 'assistant' : 'user',
                content: m.content
            }));

            const aiResponse = await this.chatAiService.getAiResponse(history, userContent);

            const aiMessage = {
                conversationId: conversation._id.toString(),
                senderId: 'AI_AGENT',
                senderRole: 'AI',
                senderName: 'Assistant',
                content: aiResponse,
            };

            // Recursively call createMessage so it saves and emits
            // Since senderRole is 'AI', it won't re-trigger handleAiResponse
            const savedAi = await this.createMessage(aiMessage);
            this.messageSubject.next(savedAi);
        } catch (error) {
            console.error('Failed to generate AI response:', error);
        }
    }

    async getMessages(conversationId: string) {
        return this.messageModel.find({ conversationId }).sort({ createdAt: 1 }).exec();
    }
}
