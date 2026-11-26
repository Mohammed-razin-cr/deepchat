export interface User {
  id: number;
  name: string;
  email_address?: string;
  bio?: string | null;
  status_emoji?: string | null;
  status_text?: string | null;
  role: 'member' | 'administrator' | 'bot';
  status: 'active' | 'deactivated' | 'banned';
  avatar_url?: string | null;
  bot_token?: string | null;
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  join_code: string;
  logo_url?: string | null;
  custom_styles?: string | null;
  created_at: string;
}

export interface Room {
  id: number;
  name: string | null;
  topic?: string | null;
  display_name: string;
  type: 'open' | 'closed' | 'direct';
  creator_id: number | null;
  messages_count: number;
  is_locked?: boolean;
  unlocked?: boolean;
  disappear_seconds?: number | null;
  involvement: 'everything' | 'mentions' | 'nothing';
  is_starred?: boolean;
  unread: boolean;
  unread_at: string | null;
  members: User[];
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  url: string;
}

export interface Unfurl {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
}

export interface Boost {
  content: string;
  count: number;
  user_ids: number[];
  user_names: string[];
  me: boolean;
}

export interface ReplyPreview {
  id: number;
  body: string;
  creator_name: string;
}

export interface PollOption {
  id: number;
  text: string;
  votes: number[];
}

export interface PollData {
  question: string;
  options: PollOption[];
}

export interface Message {
  id: number;
  room_id: number;
  client_message_id: string;
  body: string;
  reply_to_id?: number | null;
  reply_to?: ReplyPreview | null;
  replies_count?: number;
  is_pinned?: boolean;
  is_bookmarked?: boolean;
  expires_at?: string | null;
  poll?: PollData | null;
  attachments: Attachment[];
  unfurl?: Unfurl | null;
  creator: User | null;
  boosts: Boost[];
  created_at: string;
  updated_at: string;
  room_name?: string;
  mention_kind?: 'mention' | 'reply';
}

export interface CallParticipant {
  user_id: number;
  user_name: string;
  video: boolean;
  audio: boolean;
}

export interface CallSignal {
  uid: string;
  type: 'call.offer' | 'call.answer' | 'call.ice';
  from_id: number;
  from_name?: string;
  target_id?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface SearchHistoryItem {
  id: number;
  query: string;
}

export interface RoomTask {
  id: number;
  room_id: number;
  title: string;
  completed: boolean;
  creator_id: number | null;
  creator_name: string;
  completed_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledMessage {
  id: number;
  room_id: number;
  body: string;
  reply_to_id?: number | null;
  attachments: Attachment[];
  send_at: string;
  created_at: string;
}
