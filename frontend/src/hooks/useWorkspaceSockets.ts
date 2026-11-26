import { useEffect, useRef } from 'react';
import { api } from '../api';
import type { Boost, CallParticipant, CallSignal, Message, Room, User } from '../types';

interface UseWorkspaceSocketsOptions {
  currentUser: User | null;
  activeRoomId: number | null;
  activeRoomLocked: boolean;
  onOnlineUsers: (userIds: number[]) => void;
  onRoomActivity: (roomId: number) => void;
  onRoomsRefresh: (rooms: Room[]) => void;
  onMessageCreated: (msg: Message) => void;
  onMessageUpdated: (msg: Message) => void;
  onMessageDeleted: (messageId: number) => void;
  onMessageBoosts: (messageId: number, boosts: Boost[]) => void;
  onTasksChanged: () => void;
  onUserTyping: (userName: string) => void;
  onCallParticipants: (participants: CallParticipant[]) => void;
  onCallSignal: (signal: CallSignal) => void;
}

export function useWorkspaceSockets({
  currentUser,
  activeRoomId,
  activeRoomLocked,
  onOnlineUsers,
  onRoomActivity,
  onRoomsRefresh,
  onMessageCreated,
  onMessageUpdated,
  onMessageDeleted,
  onMessageBoosts,
  onTasksChanged,
  onUserTyping,
  onCallParticipants,
  onCallSignal,
}: UseWorkspaceSocketsOptions) {
  const roomWsRef = useRef<WebSocket | null>(null);
  const userWsRef = useRef<WebSocket | null>(null);

  const callbacksRef = useRef({
    onOnlineUsers,
    onRoomActivity,
    onRoomsRefresh,
    onMessageCreated,
    onMessageUpdated,
    onMessageDeleted,
    onMessageBoosts,
    onTasksChanged,
    onUserTyping,
    onCallParticipants,
    onCallSignal,
  });
  useEffect(() => {
    callbacksRef.current = {
      onOnlineUsers,
      onRoomActivity,
      onRoomsRefresh,
      onMessageCreated,
      onMessageUpdated,
      onMessageDeleted,
      onMessageBoosts,
      onTasksChanged,
      onUserTyping,
      onCallParticipants,
      onCallSignal,
    };
  });

  // User-level WebSocket with exponential backoff reconnect
  useEffect(() => {
    if (!currentUser) return;
    let closedByEffect = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByEffect) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/user`);
      userWsRef.current = ws;

      ws.onopen = () => {
        retryDelay = 1000;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            type: string;
            user_ids?: number[];
            room_id?: number;
          };
          if (data.type === 'presence.online') {
            callbacksRef.current.onOnlineUsers(data.user_ids || []);
          } else if (data.type === 'room.activity' && data.room_id) {
            callbacksRef.current.onRoomActivity(data.room_id);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!closedByEffect) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 15000);
            connect();
          }, retryDelay);
        }
      };
    };

    connect();
    return () => {
      closedByEffect = true;
      if (retryTimer) clearTimeout(retryTimer);
      userWsRef.current?.close();
      userWsRef.current = null;
    };
  }, [currentUser]);

  // Room-level WebSocket with exponential backoff reconnect
  useEffect(() => {
    if (!currentUser || !activeRoomId || activeRoomLocked) {
      roomWsRef.current?.close();
      roomWsRef.current = null;
      return;
    }

    let closedByEffect = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByEffect) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/rooms/${activeRoomId}`);
      roomWsRef.current = ws;

      ws.onopen = () => {
        retryDelay = 1000;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            type: string;
            message?: Message;
            message_id?: number;
            boosts?: Boost[];
            user_id?: number;
            user_name?: string;
            participants?: CallParticipant[];
            from_id?: number;
            from_name?: string;
            target_id?: number;
            sdp?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
          };
          if (data.type === 'message.created' && data.message) {
            callbacksRef.current.onMessageCreated(data.message);
            api.markRead(activeRoomId).catch(() => {});
          } else if (data.type === 'message.updated' && data.message) {
            callbacksRef.current.onMessageUpdated(data.message);
          } else if (data.type === 'message.deleted' && data.message_id) {
            callbacksRef.current.onMessageDeleted(data.message_id);
          } else if (data.type === 'message.boosts' && data.message_id && data.boosts) {
            callbacksRef.current.onMessageBoosts(
              data.message_id,
              data.boosts.map((b) => ({
                ...b,
                me: b.user_ids.includes(currentUser.id),
              }))
            );
          } else if (data.type === 'tasks.changed') {
            callbacksRef.current.onTasksChanged();
          } else if (data.type === 'typing' && data.user_id !== currentUser.id && data.user_name) {
            callbacksRef.current.onUserTyping(data.user_name);
          } else if (
            data.type === 'call.participants' ||
            data.type === 'call.user_joined' ||
            data.type === 'call.user_left'
          ) {
            callbacksRef.current.onCallParticipants(data.participants || []);
          } else if (
            (data.type === 'call.offer' || data.type === 'call.answer' || data.type === 'call.ice') &&
            data.from_id
          ) {
            callbacksRef.current.onCallSignal({
              uid: crypto.randomUUID(),
              type: data.type,
              from_id: data.from_id,
              from_name: data.from_name,
              target_id: data.target_id,
              sdp: data.sdp,
              candidate: data.candidate,
            });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!closedByEffect) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 15000);
            connect();
          }, retryDelay);
        }
      };
    };

    connect();
    return () => {
      closedByEffect = true;
      if (retryTimer) clearTimeout(retryTimer);
      roomWsRef.current?.close();
      roomWsRef.current = null;
    };
  }, [currentUser, activeRoomId, activeRoomLocked]);

  return { roomWsRef };
}
