import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import * as jwt from 'jsonwebtoken';

interface WsUser {
    uuid: string;
    id: number;
    full_name: string;
    role: string;
    email?: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(private readonly chatService: ChatService) { }

    // Authenticate on connection
    async handleConnection(client: Socket) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                console.log(`Client ${client.id} disconnected: No token`);
                client.emit('error', { message: 'Unauthorized: No token provided' });
                client.disconnect();
                return;
            }

            const secret = process.env.JWT_SECRET_PRIVATEKEY;
            if (!secret) {
                console.error('JWT_SECRET_PRIVATEKEY not configured');
                client.emit('error', { message: 'Server configuration error' });
                client.disconnect();
                return;
            }

            const decoded = jwt.verify(token, secret) as any;

            // Attach user info to socket
            client.data.user = {
                uuid: decoded.uuid,
                id: decoded.id,
                full_name: decoded.full_name,
                role: decoded.role?.name || decoded.role || 'USER',
                email: decoded.email,
            } as WsUser;

            console.log(`Client ${client.id} connected as ${client.data.user.full_name} (${client.data.user.uuid})`);
            client.emit('authenticated', { user: client.data.user });
        } catch (error) {
            console.log(`Client ${client.id} disconnected: Invalid token`);
            client.emit('error', { message: 'Unauthorized: Invalid token' });
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client ${client.id} disconnected`);
    }

    private extractToken(client: Socket): string | null {
        // Try auth object first (recommended)
        if (client.handshake.auth?.token) {
            return client.handshake.auth.token;
        }
        // Fallback to query
        if (client.handshake.query?.token) {
            return client.handshake.query.token as string;
        }
        // Try Authorization header
        const authHeader = client.handshake.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        if (!client.data.user) {
            return { event: 'error', message: 'Not authenticated' };
        }
        client.join(conversationId);
        console.log(`${client.data.user.full_name} joined conversation ${conversationId}`);
        return { event: 'joinedRoom', conversationId };
    }

    @SubscribeMessage('leaveRoom')
    handleLeaveRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        client.leave(conversationId);
        console.log(`Client ${client.id} left conversation ${conversationId}`);
        return { event: 'leftRoom', conversationId };
    }

    private messageCooldowns = new Map<string, number>();

    @SubscribeMessage('sendMessage')
    async handleMessage(
        @MessageBody() payload: { conversationId: string; content: string },
        @ConnectedSocket() client: Socket,
    ) {
        if (!client.data.user) {
            return { event: 'error', message: 'Not authenticated' };
        }

        const user = client.data.user as WsUser;
        const isAdmin = user.role === 'ADMIN' || user.role === 'admin';

        // Rate limiting: 2 seconds cooldown for non-admin users
        if (!isAdmin) {
            const now = Date.now();
            const lastSent = this.messageCooldowns.get(user.uuid) || 0;
            const COOLDOWN_MS = 2000;

            if (now - lastSent < COOLDOWN_MS) {
                const remaining = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
                client.emit('error', { message: `Click too fast! Please wait ${remaining}s.` });
                return { event: 'error', message: 'Rate limit exceeded' };
            }
            this.messageCooldowns.set(user.uuid, now);
        }

        // Build message with user info from token (no DB query needed)
        const messageData = {
            conversationId: payload.conversationId,
            senderId: user.uuid,
            senderRole: user.role,
            senderName: user.full_name, // Include name in message
            content: payload.content,
        };

        const savedMessage = await this.chatService.createMessage(messageData);

        // Broadcast to the room
        this.server.to(payload.conversationId).emit('newMessage', savedMessage);
        return savedMessage;
    }
}
