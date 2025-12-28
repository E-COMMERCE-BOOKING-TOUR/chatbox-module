import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

export class Participant {
    @Prop({ required: true })
    userId: string;

    @Prop({ required: true, enum: ['USER', 'ADMIN', 'SUPPLIER'] })
    role: string;

    @Prop()
    name: string;
}

@Schema({ timestamps: true })
export class Conversation {
    @Prop({ type: [Participant], required: true })
    participants: Participant[];

    @Prop()
    lastMessage: string;

    @Prop()
    lastMessageAt: Date;

    @Prop({ default: 0 })
    unreadCount: number;

    @Prop({ default: 'general' })
    category: string;

    @Prop({ default: false })
    isHidden: boolean;

    @Prop({ default: true })
    isAiEnabled: boolean;

    @Prop({ default: false })
    isHumanTakeover: boolean;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ updatedAt: -1 });
