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

    @MessagePattern({ cmd: 'get_messages_by_room' })
    async getMessagesByRoom(@Payload() roomId: string) {
        return this.chatService.getMessagesForRoom(roomId);
    }

    @MessagePattern({ cmd: 'send_system_message' })
    async sendSystemMessage(@Payload() data: { roomId: string; content: string }) {
        const message = {
            senderId: 'SYSTEM',
            roomId: data.roomId,
            content: data.content,
            receiverId: undefined
        };
        const saved = await this.chatService.createMessage(message);

        // Emit via WebSocket
        if (this.chatGateway.server) {
            this.chatGateway.server.to(data.roomId).emit('newMessage', saved);
        }

        return saved;
    }
}
