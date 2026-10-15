import type { Namespace, Socket } from 'socket.io';
export type ChatRole = 'CUSTOMER' | 'ADMIN';
export type ChatStatus = 'OPEN' | 'CLOSED';
export interface ChatActor {
  id: string;
  role: ChatRole;
}
export interface ChatSessionView {
  id: string;
  customerId: string;
  status: ChatStatus;
  messageCount: number;
  customerUnreadCount: number;
  adminUnreadCount: number;
  lastMessagePreview: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
  customer?: { id: string; username: string; email: string };
}
export interface ChatMessageView {
  id: string;
  chatSessionId: string;
  senderUserId: string;
  senderRole: ChatRole;
  clientMessageId: string;
  sequence: number;
  content: string;
  createdAt: Date;
}
export interface ChatDelivery {
  session: ChatSessionView;
  message: ChatMessageView;
}
export type ChatAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { statusCode: number; message: string } };
export interface ChatServerEvents {
  'chat:message:new': (data: ChatDelivery) => void;
  'chat:session:created': (data: { sessionId: string }) => void;
  'chat:session:updated': (data: { sessionId: string }) => void;
  'chat:session:closed': (data: ChatSessionView) => void;
  'chat:session:removed': (data: { sessionId: string }) => void;
  'chat:limit:reached': (data: ChatSessionView) => void;
  'chat:error': (data: { statusCode: number; message: string }) => void;
}
export interface ChatClientEvents {
  'chat:join': (
    payload: unknown,
    ack: (result: ChatAck<ChatSessionView>) => void,
  ) => void;
  'chat:leave': (
    payload: unknown,
    ack: (result: ChatAck<null>) => void,
  ) => void;
  'chat:read': (
    payload: unknown,
    ack: (result: ChatAck<ChatSessionView>) => void,
  ) => void;
  'chat:message': (
    payload: unknown,
    ack: (result: ChatAck<ChatDelivery>) => void,
  ) => void;
}
export interface ChatSocketData {
  actor: ChatActor;
}
export type ChatSocket = Socket<
  ChatClientEvents,
  ChatServerEvents,
  Record<string, never>,
  ChatSocketData
>;
export type ChatNamespace = Namespace<
  ChatClientEvents,
  ChatServerEvents,
  Record<string, never>,
  ChatSocketData
>;
