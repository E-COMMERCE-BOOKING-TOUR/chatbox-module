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
    handleJoinRoom(@MessageBody('roomId') roomId: string, @ConnectedSocket() client: Socket) {
        client.join(roomId);
        console.log(`Client ${client.id} joined room ${roomId}`);
        return { event: 'joinedRoom', roomId };
    }

    @SubscribeMessage('leaveRoom')
    handleLeaveRoom(@MessageBody('roomId') roomId: string, @ConnectedSocket() client: Socket) {
        client.leave(roomId);
        console.log(`Client ${client.id} left room ${roomId}`);
        return { event: 'leftRoom', roomId };
    }

    @SubscribeMessage('sendMessage')
    async handleMessage(
        @MessageBody() payload: { senderId: string; roomId: string; content: string },
        @ConnectedSocket() client: Socket,
    ) {
        const savedMessage = await this.chatService.createMessage(payload);
        // Broadcast to the room
        this.server.to(payload.roomId).emit('newMessage', savedMessage);
        return savedMessage;
    }
}
