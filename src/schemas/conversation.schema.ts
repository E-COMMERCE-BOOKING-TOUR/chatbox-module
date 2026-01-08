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

// Context for smart routing
export class ConversationContext {
    @Prop()
    tourId?: number;

    @Prop()
    tourSlug?: string;

    @Prop()
    tourTitle?: string;

    @Prop()
    bookingId?: number;

    @Prop()
    supplierId?: number;

    @Prop()
    supplierName?: string;

    @Prop({ enum: ['tour_page', 'booking', 'general'], default: 'general' })
    source?: string;
}

// Assignment tracking
export class AssignedTo {
    @Prop({ required: true })
    userId: number;

    @Prop({ required: true, enum: ['ADMIN', 'SUPPLIER'] })
    role: string;

    @Prop()
    name?: string;

    @Prop({ default: () => new Date() })
    assignedAt: Date;
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

    // Smart routing fields
    @Prop({ type: ConversationContext })
    context?: ConversationContext;

    @Prop({ type: AssignedTo })
    assignedTo?: AssignedTo;

    @Prop({ type: [String], default: [] })
    tags: string[];

    @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
    priority: string;

    @Prop({ enum: ['pending', 'assigned', 'in_progress', 'resolved'], default: 'pending' })
    status: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ updatedAt: -1 });
ConversationSchema.index({ status: 1, priority: -1 });
ConversationSchema.index({ 'context.supplierId': 1 });
ConversationSchema.index({ 'assignedTo.userId': 1 });
