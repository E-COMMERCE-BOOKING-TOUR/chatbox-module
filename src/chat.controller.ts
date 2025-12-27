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

    @MessagePattern({ cmd: 'get_messages' })
    async getMessages(@Payload() conversationId: string) {
        return this.chatService.getMessages(conversationId);
    }
}
