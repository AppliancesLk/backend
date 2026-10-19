import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../../auth/services/auth.service';
import { readSessionCookie } from '../../auth/session.config';
import type {
  ChatDelivery,
  ChatNamespace,
  ChatSessionView,
  ChatSocket,
} from '../types/chat.types';

@Injectable()
export class ChatEventsService {
  private server?: ChatNamespace;
  private readonly logger = new Logger(ChatEventsService.name);
  constructor(private readonly auth: AuthService) {}
  bind(server: ChatNamespace) {
    this.server = server;
  }
  private async deliver(
    rooms: string[],
    customerId: string,
    emit: (socket: ChatSocket) => void,
  ) {
    if (!this.server) return;
    await Promise.all(
      [...this.server.sockets.values()]
        .filter((socket) => rooms.some((room) => socket.rooms.has(room)))
        .map(async (socket) => {
          try {
            // Recheck recipients as well as senders: logout/expiry/role changes revoke delivery.
            const user = await this.auth.authenticate(
              readSessionCookie(socket.handshake.headers.cookie),
            );
            if (
              user.role === 'ADMIN' ||
              (user.role === 'CUSTOMER' && user.id === customerId)
            )
              emit(socket);
            else socket.disconnect(true);
          } catch {
            socket.disconnect(true);
            this.logger.warn({
              operation: 'chat.delivery.unauthorized',
              socketId: socket.id,
            });
          }
        }),
    );
  }
  async changed(session: ChatSessionView, created = false) {
    await this.deliver(
      ['support:admins', `support:user:${session.customerId}`],
      session.customerId,
      (socket) => {
        socket.emit(created ? 'chat:session:created' : 'chat:session:updated', {
          sessionId: session.id,
        });
      },
    );
  }
  async message(data: ChatDelivery) {
    await this.deliver(
      [`chat:${data.session.id}`],
      data.session.customerId,
      (socket) => {
        socket.emit('chat:message:new', data);
        if (data.session.messageCount === 100)
          socket.emit('chat:limit:reached', data.session);
      },
    );
    await this.changed(data.session);
  }
  async closed(session: ChatSessionView) {
    await this.deliver([`chat:${session.id}`], session.customerId, (socket) =>
      socket.emit('chat:session:closed', session),
    );
    await this.changed(session);
  }
  async removed(sessionId: string, customerId: string) {
    await this.deliver(
      [`chat:${sessionId}`, 'support:admins', `support:user:${customerId}`],
      customerId,
      (socket) => socket.emit('chat:session:removed', { sessionId }),
    );
    this.server?.in(`chat:${sessionId}`).socketsLeave(`chat:${sessionId}`);
  }
}
