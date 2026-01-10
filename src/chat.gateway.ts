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
    id?: number;  // Optional - token may not contain id
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

    constructor(private readonly chatService: ChatService) {
        this.chatService.messageSubject.subscribe((message) => {
            if (this.server) {
                this.server.to(message.conversationId).emit('newMessage', message);
            }
        });
    }

    /**
     * Normalize role name to match chat schema: 'USER' | 'ADMIN' | 'SUPPLIER'
     * Maps customer, content_manager, moderator, etc. to 'USER'
     */
    private normalizeChatRole(roleName: string): 'USER' | 'ADMIN' | 'SUPPLIER' {
        const upperRole = roleName.toUpperCase();
        if (upperRole === 'ADMIN') return 'ADMIN';
        if (upperRole === 'SUPPLIER') return 'SUPPLIER';
        return 'USER'; // Default: customer, content_manager, moderator, etc. → USER
    }

    // Authenticate on connection
    async handleConnection(client: Socket) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                console.log(`[Socket] Client ${client.id} connection failed: No token provided`);
                client.emit('error', { message: 'Unauthorized: No token provided' });
                client.disconnect();
                return;
            }

            const secret = process.env.JWT_SECRET_PRIVATEKEY;
            if (!secret) {
                console.error('[Socket] JWT_SECRET_PRIVATEKEY is missing in env');
                client.emit('error', { message: 'Server configuration error' });
                client.disconnect();
                return;
            }

            let decoded: any;
            try {
                decoded = jwt.verify(token, secret);
            } catch (err) {
                console.log(`[Socket] Client ${client.id} context failure: Invalid JWT token`);
                client.emit('error', { message: 'Unauthorized: Invalid token' });
                client.disconnect();
                return;
            }

            // Robust role detection (could be string or object from different auth paths)
            let roleStr = 'USER';
            if (decoded.role) {
                if (typeof decoded.role === 'string') {
                    roleStr = decoded.role;
                } else if (typeof decoded.role === 'object' && decoded.role.name) {
                    roleStr = decoded.role.name;
                }
            }

            // Attach user info to socket
            client.data.user = {
                uuid: decoded.uuid,
                id: decoded.id, // Keep as optional for now
                full_name: decoded.full_name || 'User',
                role: this.normalizeChatRole(roleStr), // Normalize role to USER/ADMIN/SUPPLIER
                email: decoded.email,
            } as WsUser;

            if (!client.data.user.uuid) {
                console.error(`[Socket] Client ${client.id} token missing uuid`);
                client.emit('error', { message: 'Incomplete token data: uuid required' });
                client.disconnect();
                return;
            }

            // Auto-join admin_notifications room if user is admin
            const isAdmin = roleStr.toUpperCase() === 'ADMIN';
            if (isAdmin) {
                client.join('admin_notifications');
                console.log(`[Socket] Admin ${client.data.user.full_name} (${client.data.user.uuid}) joined admin_notifications`);
            }

            console.log(`[Socket] Client ${client.id} connected as ${client.data.user.full_name} (${client.data.user.uuid})`);
            client.emit('authenticated', { user: client.data.user });
        } catch (error) {
            console.error('[Socket] Unexpected connection error:', error);
            client.emit('error', { message: 'Internal server error during connection' });
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

    // Track users in each room for presence
    private roomUsers = new Map<string, Set<string>>();

    // Get tracking ID from user - use uuid only
    private getTrackingId(user: WsUser): string {
        return user.uuid || 'unknown';
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        if (!client.data.user) {
            return { event: 'error', message: 'Not authenticated' };
        }

        const user = client.data.user as WsUser;
        client.join(conversationId);

        // Use uuid for tracking (matches how userId is stored in newer conversations)
        const trackingId = this.getTrackingId(user);

        // Track user in room
        if (!this.roomUsers.has(conversationId)) {
            this.roomUsers.set(conversationId, new Set());
        }
        this.roomUsers.get(conversationId)!.add(trackingId);

        // Notify others in room that user joined
        client.to(conversationId).emit('userJoined', {
            conversationId,
            userId: trackingId,
            userName: user.full_name,
        });

        // Send current room users to the joining client
        const usersInRoom = Array.from(this.roomUsers.get(conversationId) || []);
        client.emit('roomUsers', {
            conversationId,
            users: usersInRoom,
        });

        console.log(`${user.full_name} (trackingId: ${trackingId}) joined conversation ${conversationId}`);
        return { event: 'joinedRoom', conversationId };
    }

    @SubscribeMessage('leaveRoom')
    handleLeaveRoom(@MessageBody('conversationId') conversationId: string, @ConnectedSocket() client: Socket) {
        const user = client.data.user as WsUser | undefined;
        client.leave(conversationId);

        // Remove user from room tracking
        if (user && this.roomUsers.has(conversationId)) {
            const trackingId = this.getTrackingId(user);
            this.roomUsers.get(conversationId)!.delete(trackingId);

            // Notify others in room that user left
            this.server.to(conversationId).emit('userLeft', {
                conversationId,
                userId: trackingId,
            });

            // Clean up empty rooms
            if (this.roomUsers.get(conversationId)!.size === 0) {
                this.roomUsers.delete(conversationId);
            }
        }

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
        const isAdmin = user.role?.toUpperCase() === 'ADMIN';

        console.log(`[Socket] Message from ${user.full_name} (Role: ${user.role}, isAdmin: ${isAdmin}) in room ${payload.conversationId}`);

        // Rate limiting: 2 seconds cooldown for non-admin users
        if (!isAdmin) {
            const now = Date.now();
            const lastSent = this.messageCooldowns.get(user.uuid) || 0;
            const COOLDOWN_MS = 2000;

            if (now - lastSent < COOLDOWN_MS) {
                const remaining = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
                console.log(`[Socket] Rate limit hit for ${user.full_name} (${user.uuid})`);
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

        // Broadcast to admin notification channel if message is from non-admin
        if (!isAdmin) {
            console.log(`[Socket] Broadcasting adminNewMessage for conversation ${payload.conversationId}`);
            this.server.to('admin_notifications').emit('adminNewMessage', savedMessage);
        }

        return savedMessage;
    }

    emitMessage(conversationId: string, message: any) {
        if (this.server) {
            this.server.to(conversationId).emit('newMessage', message);
        }
    }
}
