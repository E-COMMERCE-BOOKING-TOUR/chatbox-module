import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
    @Prop({ required: true })
    senderId: string; // The user ID sending the message

    @Prop()
    receiverId: string; // Optional for 1:1

    @Prop()
    roomId: string; // For group chats (e.g. Tour ID)

    @Prop({ required: true })
    content: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
