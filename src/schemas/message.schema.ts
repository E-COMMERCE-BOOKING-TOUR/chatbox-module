import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
    @Prop({ required: true })
    conversationId: string; // Links to Conversation

    @Prop({ required: true })
    senderId: string;

    @Prop()
    senderRole: string; // 'USER', 'ADMIN', 'SUPPLIER'

    @Prop({ required: true })
    content: string;

    @Prop()
    readAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
