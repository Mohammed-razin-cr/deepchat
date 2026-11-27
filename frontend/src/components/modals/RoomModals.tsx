import { useMemo, useState } from 'react';
import { Check, Copy, Hash, LockKey, PaperPlaneTilt, SignOut } from '@phosphor-icons/react';
import { api } from '../../api';
import type { Account, Message, Room, User } from '../../types';
import { Avatar } from '../Avatar';
import { MotionModal } from '../ui/MotionModal';
import { ModalError } from './ModalAlerts';
import { formatError } from '../../utils/errors';

export function NewRoomModal({
  users,
  onClose,
  onCreated,
}: {
  users: User[];
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<'open' | 'closed'>('open');
  const [selected, setSelected] = useState<number[]>([]);
  const [passcode, setPasscode] = useState('');
  const [disappearSeconds, setDisappearSeconds] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Room name is required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.createRoom({
        name: name.trim(),
        topic: topic.trim() || undefined,
        type,
        member_ids: selected,
        passcode: type === 'closed' && passcode.trim() ? passcode.trim() : undefined,
        disappear_seconds: disappearSeconds > 0 ? disappearSeconds : null,
      });
      onCreated(res.room);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to create room'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal title="Create a Room" subtitle="Start a new space for your team" onClose={onClose}>
      <ModalError message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Room Name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="engineering"
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Topic (Optional)
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={280}
            placeholder="Sprint planning, architecture & deployment notes"
            className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Access
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {(['open', 'closed'] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                  type === t
                    ? 'border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'border-stone-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {t === 'open' ? (
                  <Hash size={18} weight="bold" className="mt-0.5" />
                ) : (
                  <LockKey size={18} weight="duotone" className="mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-sm">{t === 'open' ? 'Open' : 'Private'}</div>
                  <div className="text-[11px] opacity-75">
                    {t === 'open' ? 'Everyone can join' : 'Only invited members'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        {type === 'closed' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                Members
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 border border-stone-200 dark:border-zinc-800 rounded-xl p-2">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                    <Avatar user={u} size="xs" />
                    <span className="text-sm text-zinc-800 dark:text-zinc-200">{u.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Passcode Lock (Optional)
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="PIN / Passcode"
                  className="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Disappearing Messages
                </label>
                <select
                  value={disappearSeconds}
                  onChange={(e) => setDisappearSeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  <option value={0}>Off</option>
                  <option value={60}>1 minute</option>
                  <option value={3600}>1 hour</option>
                  <option value={86400}>24 hours</option>
                </select>
              </div>
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold cursor-pointer transition"
        >
          {loading ? 'Creating...' : 'Create Room'}
        </button>
      </form>
    </MotionModal>
  );
}

export function NewDMModal({
  users,
  currentUserId,
  joinCode,
  onClose,
  onCreated,
}: {
  users: User[];
  currentUserId: number;
  joinCode?: string;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const others = users.filter((u) => u.id !== currentUserId && u.role !== 'bot');

  const startDM = async (ids: number[]) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.createRoom({ type: 'direct', member_ids: ids });
      onCreated(res.room);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to start conversation'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal title="New Direct Message" subtitle="Click a teammate or select multiple for a group chat" onClose={onClose}>
      <ModalError message={error} />
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {others.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-zinc-800/70 transition"
          >
            <button
              type="button"
              disabled={loading}
              onClick={() => startDM([u.id])}
              className="flex items-center gap-3 flex-1 text-left cursor-pointer disabled:opacity-60"
            >
              <Avatar user={u} size="sm" />
              <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{u.name}</span>
            </button>
            <input
              type="checkbox"
              aria-label={`Select ${u.name}`}
              checked={selected.includes(u.id)}
              onChange={() =>
                setSelected((prev) => (prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]))
              }
            />
          </div>
        ))}
        {others.length === 0 && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No other teammates have joined yet. Share your invite link so they can join and chat!
            </p>
            {joinCode && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/?join=${joinCode}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold cursor-pointer"
              >
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="duotone" />}
                {copied ? 'Invite Link Copied!' : 'Copy Invite Link'}
              </button>
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          disabled={loading}
          onClick={() => startDM(selected)}
          className="mt-4 w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold cursor-pointer transition"
        >
          {loading ? 'Starting...' : `Start Group Chat (${selected.length})`}
        </button>
      )}
    </MotionModal>
  );
}

export function ShareRoomModal({
  room,
  account,
  onClose,
}: {
  room: Room;
  account: Account;
  onClose: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const roomUrl = `${window.location.origin}/?room=${room.id}`;
  const inviteRoomUrl = `${window.location.origin}/?join=${account.join_code}&room=${room.id}`;
  const callUrl = `${window.location.origin}/?room=${room.id}&call=1`;

  const copy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  return (
    <MotionModal
      title={`Share ${room.display_name}`}
      subtitle="Copy a shareable link for members or new teammates"
      onClose={onClose}
    >
      <div className="space-y-4">
        {[
          { key: 'room', label: 'Direct Room Link (for existing members)', url: roomUrl },
          { key: 'invite', label: 'Invite & Join Room Link (for new teammates)', url: inviteRoomUrl },
          { key: 'call', label: 'Group Call Link (joins call directly)', url: callUrl },
        ].map((item) => (
          <div
            key={item.key}
            className="p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">{item.label}</div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={item.url}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300"
              />
              <button
                type="button"
                onClick={() => copy(item.key, item.url)}
                className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === item.key ? <Check size={14} weight="bold" /> : <Copy size={14} weight="duotone" />}
                {copiedKey === item.key ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </MotionModal>
  );
}

export function RoomMembersModal({
  room,
  currentUserId,
  onlineUserIds,
  onClose,
  onStartDM,
}: {
  room: Room;
  currentUserId: number;
  onlineUserIds: number[];
  onClose: () => void;
  onStartDM: (userId: number) => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  return (
    <MotionModal
      title={`${room.display_name} Members`}
      subtitle={`${room.members.length} members in this room`}
      onClose={onClose}
    >
      <ModalError message={error} />
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {room.members.map((m) => {
          const isOnline = onlineUserIds.includes(m.id);
          return (
            <div
              key={m.id}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200/70 dark:border-zinc-800"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={m} size="sm" online={isOnline} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {m.name} {m.id === currentUserId ? '(You)' : ''}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {m.status_emoji || m.status_text
                      ? `${m.status_emoji || ''} ${m.status_text || ''}`.trim()
                      : isOnline
                      ? 'Online'
                      : 'Offline'}
                  </div>
                </div>
              </div>
              {m.id !== currentUserId && m.role !== 'bot' && (
                <button
                  type="button"
                  disabled={busyId === m.id}
                  onClick={async () => {
                    setError('');
                    setBusyId(m.id);
                    try {
                      await onStartDM(m.id);
                      onClose();
                    } catch (err) {
                      setError(formatError(err, 'Could not start DM'));
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-60 text-violet-600 dark:text-violet-300 text-xs font-semibold cursor-pointer"
                >
                  {busyId === m.id ? 'Opening...' : 'Message'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </MotionModal>
  );
}

export function RoomSettingsModal({
  room,
  users,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
  onLeft,
}: {
  room: Room;
  users: User[];
  currentUserId: number;
  onClose: () => void;
  onUpdated: (room: Room) => void;
  onDeleted: (roomId: number) => void;
  onLeft: (roomId: number) => void;
}) {
  const [name, setName] = useState(room.name || '');
  const [topic, setTopic] = useState(room.topic || '');
  const [type, setType] = useState<'open' | 'closed'>(room.type === 'closed' ? 'closed' : 'open');
  const [memberIds, setMemberIds] = useState<number[]>(room.members.map((m) => m.id));
  const [newPasscode, setNewPasscode] = useState('');
  const [clearPasscode, setClearPasscode] = useState(false);
  const [disappearSeconds, setDisappearSeconds] = useState<number>(room.disappear_seconds || 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canLeaveRoom = room.type === 'closed' && room.creator_id !== currentUserId;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: {
        name?: string;
        topic?: string;
        type?: 'open' | 'closed';
        member_ids?: number[];
        passcode?: string;
        disappear_seconds?: number | null;
      } = {
        name: name.trim(),
        topic: topic.trim(),
        type,
        member_ids: memberIds,
        disappear_seconds: disappearSeconds,
      };
      if (clearPasscode) {
        payload.passcode = '';
      } else if (newPasscode.trim()) {
        payload.passcode = newPasscode.trim();
      }
      const res = await api.updateRoom(room.id, payload);
      onUpdated(res.room);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to update room settings'));
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    setError('');
    setLoading(true);
    try {
      await api.deleteRoom(room.id);
      onDeleted(room.id);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to delete room'));
    } finally {
      setLoading(false);
    }
  };

  const leave = async () => {
    setError('');
    setLoading(true);
    try {
      await api.leaveRoom(room.id);
      onLeft(room.id);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to leave room'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal title="Room Settings" onClose={onClose}>
      <ModalError message={error} />
      <form onSubmit={save} className="space-y-4">
        {room.type !== 'direct' && (
          <>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Topic</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={280}
                placeholder="Describe this room's purpose..."
                className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Access</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'open' | 'closed')}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="open">Open (All members)</option>
                <option value="closed">Private (Selected members)</option>
              </select>
            </div>
            {type === 'closed' && (
              <div className="max-h-36 overflow-y-auto space-y-1 border border-stone-200 dark:border-zinc-800 rounded-xl p-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 p-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.id)}
                      onChange={() =>
                        setMemberIds((prev) =>
                          prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                        )
                      }
                    />
                    <span className="text-sm text-zinc-800 dark:text-zinc-200">{u.name}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
              Passcode Lock {room.is_locked ? '(Active)' : '(Optional)'}
            </label>
            <input
              type="password"
              disabled={clearPasscode}
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              placeholder={room.is_locked ? 'New passcode to change' : 'Set a passcode'}
              className="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 disabled:opacity-50"
            />
            {room.is_locked && (
              <label className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearPasscode}
                  onChange={(e) => setClearPasscode(e.target.checked)}
                />
                Remove passcode lock
              </label>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
              Disappearing Messages
            </label>
            <select
              value={disappearSeconds}
              onChange={(e) => setDisappearSeconds(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
            >
              <option value={0}>Off</option>
              <option value={60}>1 minute</option>
              <option value={3600}>1 hour</option>
              <option value={86400}>24 hours</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold cursor-pointer"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          {canLeaveRoom && !confirmDelete && (
            !confirmLeave ? (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
              >
                <SignOut className="w-4 h-4" />
                Leave
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={leave}
                  className="px-3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Leave
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="px-3 py-2.5 rounded-xl bg-stone-200 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )
          )}
          {!confirmDelete && !confirmLeave ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 font-semibold cursor-pointer"
            >
              Delete
            </button>
          ) : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={loading}
                onClick={remove}
                className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2.5 rounded-xl bg-stone-200 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </form>
    </MotionModal>
  );
}

export function ForwardModal({
  message,
  rooms,
  sourceRoomName,
  onClose,
  onForwarded,
}: {
  message: Message;
  rooms: Room[];
  sourceRoomName: string;
  onClose: () => void;
  onForwarded: (targetRoomId: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const [targetRoomId, setTargetRoomId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableRooms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rooms.filter((r) => {
      if (r.is_locked && !r.unlocked) return false;
      if (!q) return true;
      return r.display_name.toLowerCase().includes(q);
    });
  }, [rooms, filter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRoomId) {
      setError('Select a destination room or DM.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const author = message.creator?.name || 'Someone';
      const quotedLines = (message.body || '')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const header = `> Forwarded from **${author}** in **#${sourceRoomName}**`;
      const forwardedBlock = quotedLines ? `${header}\n${quotedLines}` : header;
      const body = note.trim() ? `${note.trim()}\n\n${forwardedBlock}` : forwardedBlock;

      await api.createMessage(targetRoomId, {
        body,
        client_message_id: crypto.randomUUID(),
        attachments: message.attachments,
      });
      onForwarded(targetRoomId);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to forward message'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal title="Forward Message" onClose={onClose}>
      <ModalError message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 rounded-xl bg-stone-100/80 dark:bg-zinc-900/80 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
          <div className="font-semibold text-zinc-800 dark:text-zinc-100">
            From {message.creator?.name || 'Unknown'} in #{sourceRoomName}
          </div>
          {message.body && <p className="line-clamp-3 whitespace-pre-wrap">{message.body}</p>}
          {message.attachments.length > 0 && (
            <div className="text-[11px] text-violet-500 font-medium">
              Includes {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Optional Note
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context before forwarding..."
            className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Destination Room or DM
          </label>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rooms or teammates..."
            className="w-full px-3 py-1.5 mb-2 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
          />
          <div className="max-h-44 overflow-y-auto space-y-1 border border-stone-200 dark:border-zinc-800 rounded-xl p-1.5">
            {availableRooms.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">No matching unlocked rooms.</p>
            ) : (
              availableRooms.map((r) => {
                const selected = targetRoomId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setTargetRoomId(r.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      selected
                        ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30 font-semibold'
                        : 'hover:bg-stone-100 dark:hover:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <span className="truncate">
                      {r.type === 'direct' ? `@ ${r.display_name}` : `# ${r.display_name}`}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                      {r.id === message.room_id ? 'current' : r.type}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !targetRoomId}
          className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <PaperPlaneTilt className="w-4 h-4" />
          {loading ? 'Forwarding...' : 'Forward Message'}
        </button>
      </form>
    </MotionModal>
  );
}
