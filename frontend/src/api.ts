import type {
  Account,
  Attachment,
  Boost,
  Message,
  PollData,
  Room,
  RoomTask,
  ScheduledMessage,
  SearchHistoryItem,
  Unfurl,
  User,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { detail?: string };
      msg = err.detail || msg;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: () =>
    request<{ needs_setup: boolean; account: Account | null; user: User | null }>('/api/bootstrap'),
  firstRun: (data: { account_name: string; name: string; email_address: string; password: string }) =>
    request<{ account: Account; user: User }>('/api/first_run', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email_address: string; password: string }) =>
    request<{ user: User }>('/api/session', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<{ ok: boolean }>('/api/session', { method: 'DELETE' }),

  checkJoinCode: (code: string) =>
    request<{ account: { name: string; logo_url: string | null } }>(`/api/join/${encodeURIComponent(code)}`),
  joinAccount: (code: string, data: { name: string; email_address: string; password: string }) =>
    request<{ user: User }>(`/api/join/${encodeURIComponent(code)}`, { method: 'POST', body: JSON.stringify(data) }),

  listUsers: () => request<{ users: User[] }>('/api/users'),
  autocompleteUsers: (q: string) =>
    request<{ users: User[] }>(`/api/users/autocomplete?q=${encodeURIComponent(q)}`),
  updateProfile: (data: {
    name?: string;
    email_address?: string;
    bio?: string;
    status_emoji?: string;
    status_text?: string;
    password?: string;
  }) => request<{ user: User }>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ user: User }>('/api/users/me/avatar', { method: 'POST', body: fd });
  },
  deleteAvatar: () => request<{ user: User }>('/api/users/me/avatar', { method: 'DELETE' }),

  getAccount: () => request<{ account: Account }>('/api/account'),
  updateAccount: (data: { name?: string; custom_styles?: string }) =>
    request<{ account: Account }>('/api/account', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ account: Account }>('/api/account/logo', { method: 'POST', body: fd });
  },
  deleteLogo: () => request<{ ok: boolean }>('/api/account/logo', { method: 'DELETE' }),
  regenerateJoinCode: () => request<{ account: Account }>('/api/account/join_code', { method: 'POST' }),
  listAccountUsers: () => request<{ users: User[] }>('/api/account/users'),
  updateAccountUser: (id: number, data: { role?: 'member' | 'administrator'; status?: 'active' | 'deactivated' | 'banned' }) =>
    request<{ user: User }>(`/api/account/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  listBots: () => request<{ bots: User[] }>('/api/account/bots'),
  createBot: (name: string) =>
    request<{ bot: User }>('/api/account/bots', { method: 'POST', body: JSON.stringify({ name }) }),
  regenerateBotKey: (id: number) =>
    request<{ bot: User }>(`/api/account/bots/${id}/regenerate_key`, { method: 'POST' }),
  deleteBot: (id: number) => request<{ ok: boolean }>(`/api/account/bots/${id}`, { method: 'DELETE' }),

  listRooms: () => request<{ rooms: Room[] }>('/api/rooms'),
  createRoom: (data: {
    name?: string;
    topic?: string;
    type: 'open' | 'closed' | 'direct';
    member_ids?: number[];
    passcode?: string;
    disappear_seconds?: number | null;
  }) => request<{ room: Room }>('/api/rooms', { method: 'POST', body: JSON.stringify(data) }),
  updateRoom: (
    id: number,
    data: {
      name?: string;
      topic?: string;
      type?: 'open' | 'closed';
      member_ids?: number[];
      passcode?: string;
      disappear_seconds?: number | null;
    }
  ) => request<{ room: Room }>(`/api/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  toggleRoomStar: (id: number) => request<{ starred: boolean }>(`/api/rooms/${id}/star`, { method: 'POST' }),
  unlockRoom: (id: number, passcode: string) =>
    request<{ unlocked: boolean }>(`/api/rooms/${id}/unlock`, { method: 'POST', body: JSON.stringify({ passcode }) }),
  deleteRoom: (id: number) => request<{ ok: boolean }>(`/api/rooms/${id}`, { method: 'DELETE' }),
  updateInvolvement: (id: number, involvement: Room['involvement']) =>
    request<{ involvement: Room['involvement'] }>(`/api/rooms/${id}/involvement`, {
      method: 'PATCH',
      body: JSON.stringify({ involvement }),
    }),
  markRead: (id: number) => request<{ ok: boolean }>(`/api/rooms/${id}/read`, { method: 'POST' }),

  listMessages: (roomId: number, before?: number) =>
    request<{ messages: Message[]; has_more: boolean }>(
      `/api/rooms/${roomId}/messages${before ? `?before=${before}` : ''}`
    ),
  createMessage: (
    roomId: number,
    data: {
      body: string;
      client_message_id: string;
      reply_to_id?: number | null;
      poll?: PollData;
      attachments?: Attachment[];
      unfurl?: Unfurl | null;
    }
  ) => request<{ message: Message }>(`/api/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  votePoll: (messageId: number, optionId: number) =>
    request<{ message: Message }>(`/api/messages/${messageId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId }),
    }),
  updateMessage: (messageId: number, body: string) =>
    request<{ message: Message }>(`/api/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteMessage: (messageId: number) => request<{ ok: boolean }>(`/api/messages/${messageId}`, { method: 'DELETE' }),
  toggleBoost: (messageId: number, content: string) =>
    request<{ boosts: Boost[] }>(`/api/messages/${messageId}/boosts`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  togglePin: (messageId: number) =>
    request<{ message: Message }>(`/api/messages/${messageId}/pin`, { method: 'POST' }),
  toggleBookmark: (messageId: number) =>
    request<{ bookmarked: boolean }>(`/api/messages/${messageId}/bookmark`, { method: 'POST' }),
  getThread: (messageId: number) =>
    request<{ parent: Message; replies: Message[] }>(`/api/messages/${messageId}/thread`),
  listBookmarks: () => request<{ bookmarks: Message[] }>('/api/bookmarks'),

  listTasks: (roomId: number) => request<{ tasks: RoomTask[] }>(`/api/rooms/${roomId}/tasks`),
  createTask: (roomId: number, title: string) =>
    request<{ task: RoomTask }>(`/api/rooms/${roomId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateTask: (taskId: number, data: { title?: string; completed?: boolean }) =>
    request<{ task: RoomTask }>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (taskId: number) => request<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE' }),

  listScheduled: (roomId: number) => request<{ scheduled: ScheduledMessage[] }>(`/api/rooms/${roomId}/scheduled`),
  createScheduled: (
    roomId: number,
    data: { body: string; send_at: string; reply_to_id?: number | null; attachments?: Attachment[] }
  ) => request<{ scheduled: ScheduledMessage }>(`/api/rooms/${roomId}/scheduled`, { method: 'POST', body: JSON.stringify(data) }),
  sendScheduledNow: (itemId: number) =>
    request<{ message: Message }>(`/api/scheduled/${itemId}/send_now`, { method: 'POST' }),
  deleteScheduled: (itemId: number) => request<{ ok: boolean }>(`/api/scheduled/${itemId}`, { method: 'DELETE' }),

  listMentions: () => request<{ mentions: Message[] }>('/api/mentions'),

  uploadFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ attachment: Attachment }>('/api/uploads', { method: 'POST', body: fd });
  },
  unfurl: (url: string) =>
    request<{ unfurl: Unfurl | null }>('/api/unfurl', { method: 'POST', body: JSON.stringify({ url }) }),

  search: (q: string) =>
    request<{ results: Message[]; history: SearchHistoryItem[] }>(`/api/searches?q=${encodeURIComponent(q)}`),
  clearSearchHistory: () => request<{ ok: boolean }>('/api/searches', { method: 'DELETE' }),

  getVapidKey: () => request<{ public_key: string }>('/api/push/vapid-public-key'),
  savePushSub: (sub: { endpoint: string; p256dh_key: string; auth_key: string }) =>
    request<{ ok: boolean }>('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(sub) }),
  testPush: () => request<{ ok: boolean }>('/api/push/test', { method: 'POST' }),
};
