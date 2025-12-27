import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
    cors: {
        origin: '*', // Allow all origins for now
    },
})
export class ChatGateway {
    @WebSocketServer()
    server: Server;

    constructor(private readonly chatService: ChatService) { }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        client.join(conversationId);
        console.log(`Client ${client.id} joined conversation ${conversationId}`);
        return { event: 'joinedRoom', conversationId };
    }

    @SubscribeMessage('leaveRoom')
    handleLeaveRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        client.leave(conversationId);
        console.log(`Client ${client.id} left conversation ${conversationId}`);
        return { event: 'leftRoom', conversationId };
    }

    @SubscribeMessage('sendMessage')
    async handleMessage(
        @MessageBody() payload: { senderId: string; senderRole: string; conversationId: string; content: string },
        @ConnectedSocket() client: Socket,
    ) {
        const savedMessage = await this.chatService.createMessage(payload);
        // Broadcast to the room (conversation)
        this.server.to(payload.conversationId).emit('newMessage', savedMessage);
        return savedMessage;
    }
}
