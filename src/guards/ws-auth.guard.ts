import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';

export interface WsUser {
    uuid: string;
    id: number;
    full_name: string;
    role: string;
    email?: string;
}

@Injectable()
export class WsAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient();
        const token = this.extractToken(client);

        if (!token) {
            throw new WsException('Unauthorized: No token provided');
        }

        try {
            const secret = process.env.JWT_SECRET_PRIVATEKEY;
            if (!secret) {
                throw new WsException('Server configuration error');
            }

            const decoded = jwt.verify(token, secret) as any;

            // Attach user info to socket for later use
            client.data.user = {
                uuid: decoded.uuid,
                id: decoded.id,
                full_name: decoded.full_name,
                role: decoded.role?.name || decoded.role || 'USER',
                email: decoded.email,
            } as WsUser;

            return true;
        } catch (error) {
            throw new WsException('Unauthorized: Invalid token');
        }
    }

    private extractToken(client: Socket): string | null {
        // Try auth object first (recommended way)
        if (client.handshake.auth?.token) {
            return client.handshake.auth.token;
        }
        // Fallback to query parameter
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
}
