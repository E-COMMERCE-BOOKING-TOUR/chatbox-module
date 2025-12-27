import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Controller()
export class ChatController {
    constructor(
        private readonly chatService: ChatService,
        private readonly chatGateway: ChatGateway,
    ) { }

    @MessagePattern({ cmd: 'create_conversation' })
    async createConversation(@Payload() participants: { userId: string; role: string; name?: string }[]) {
        return this.chatService.createConversation(participants);
    }

    @MessagePattern({ cmd: 'get_user_conversations' })
    async getUserConversations(@Payload() userId: string) {
        return this.chatService.getUserConversations(userId);
    }

    @MessagePattern({ cmd: 'update_user_info' })
    async updateUserInfo(@Payload() data: { userId: string, name: string }) {
        return this.chatService.updateUserInfo(data.userId, data.name);
    }

    @MessagePattern({ cmd: 'get_all_conversations' })
    async getAllConversations(@Payload() query: { page: number, limit: number }) {
        return this.chatService.getAllConversations(query.page, query.limit);
    }

    @MessagePattern({ cmd: 'send_message' })
    async sendMessage(@Payload() payload: { conversationId: string; senderId: string; senderRole: string; content: string }) {
        const saved = await this.chatService.createMessage(payload);
        // We also need to emit to socket room so users see it in real-time
        if (this.chatGateway.server) {
            this.chatGateway.server.to(payload.conversationId).emit('newMessage', saved);
        }
        return saved;
    }

    @MessagePattern({ cmd: 'get_messages' })
    async getMessages(@Payload() conversationId: string) {
        return this.chatService.getMessages(conversationId);
    }

    @MessagePattern({ cmd: 'update_category' })
    async updateCategory(@Payload() data: { conversationId: string; category: string }) {
        return this.chatService.updateCategory(data.conversationId, data.category);
    }

    @MessagePattern({ cmd: 'toggle_hide' })
    async toggleHide(@Payload() data: { conversationId: string; isHidden: boolean }) {
        return this.chatService.toggleHide(data.conversationId, data.isHidden);
    }

    @MessagePattern({ cmd: 'mark_as_read' })
    async markAsRead(@Payload() conversationId: string) {
        return this.chatService.markAsRead(conversationId);
    }
}
