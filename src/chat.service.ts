import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';

@Injectable()
export class ChatService {
    constructor(@InjectModel(Message.name) private messageModel: Model<Message>) { }

    async createMessage(data: { senderId: string; receiverId?: string; roomId?: string; content: string }) {
        const message = new this.messageModel(data);
        return message.save();
    }

    async getMessagesForRoom(roomId: string) {
        return this.messageModel.find({ roomId }).sort({ createdAt: 1 }).exec();
    }

    async getMessagesForDirectChat(user1: string, user2: string) {
        return this.messageModel.find({
            $or: [
                { senderId: user1, receiverId: user2 },
                { senderId: user2, receiverId: user1 }
            ]
        }).sort({ createdAt: 1 }).exec();
    }
}
