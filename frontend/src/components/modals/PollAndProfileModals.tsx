import { useState } from 'react';
import { BellRinging, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { api } from '../../api';
import type { PollData, User } from '../../types';
import { Avatar } from '../Avatar';
import { MotionModal } from '../ui/MotionModal';
import { ModalError } from './ModalAlerts';
import { formatError } from '../../utils/errors';

export function CreatePollModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (poll: PollData) => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || valid.length < 2) {
      setError('Enter a question and at least 2 options.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        question: question.trim(),
        options: valid.map((text, idx) => ({ id: idx + 1, text, votes: [] })),
      });
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to create poll'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal title="Create a Poll" subtitle="Ask your team and collect live votes" onClose={onClose}>
      <ModalError message={error} />
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Question
          </label>
          <input
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Where should we deploy next?"
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">Options</label>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                required={idx < 2}
                value={opt}
                onChange={(e) => setOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                placeholder={`Option ${idx + 1}`}
                className="flex-1 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove option ${idx + 1}`}
                  onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 cursor-pointer"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ''])}
              className="text-xs font-semibold text-violet-500 hover:underline cursor-pointer"
            >
              + Add option
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold cursor-pointer transition"
        >
          {loading ? 'Posting...' : 'Post Poll'}
        </button>
      </form>
    </MotionModal>
  );
}

const STATUS_PRESETS = [
  { emoji: '🟢', text: 'Available' },
  { emoji: '🎧', text: 'Deep Focus' },
  { emoji: '🔴', text: 'In a meeting' },
  { emoji: '🟡', text: 'Away' },
];

export function ProfileModal({
  user,
  onClose,
  onUpdated,
}: {
  user: User;
  onClose: () => void;
  onUpdated: (user: User) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email_address || '');
  const [bio, setBio] = useState(user.bio || '');
  const [statusEmoji, setStatusEmoji] = useState(user.status_emoji || '');
  const [statusText, setStatusText] = useState(user.status_text || '');
  const [password, setPassword] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        email_address: email.trim(),
        bio,
        status_emoji: statusEmoji,
        status_text: statusText,
        password: password || undefined,
      });
      onUpdated(res.user);
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to save profile'));
    } finally {
      setLoading(false);
    }
  };

  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('Push notifications are not supported in this browser.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushStatus('Notification permission denied.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const { public_key } = await api.getVapidKey();
      const pad = '='.repeat((4 - (public_key.length % 4)) % 4);
      const raw = atob((public_key + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const keyArray = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyArray });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Browser returned incomplete push subscription');
      }
      await api.savePushSub({
        endpoint: json.endpoint,
        p256dh_key: json.keys.p256dh,
        auth_key: json.keys.auth,
      });
      await api.testPush();
      setPushStatus('Push notifications enabled & test notification sent!');
    } catch (err) {
      setPushStatus(formatError(err, 'Failed to enable push'));
    }
  };

  return (
    <MotionModal title="Your Profile" onClose={onClose}>
      <ModalError message={error} />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Avatar user={user} size="lg" />
        <label className="px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-stone-200 dark:hover:bg-zinc-700 cursor-pointer flex items-center gap-2 transition">
          <UploadSimple size={15} weight="bold" />
          {avatarBusy ? 'Updating...' : 'Upload Avatar'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={avatarBusy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError('');
              setAvatarBusy(true);
              try {
                const res = await api.uploadAvatar(f);
                onUpdated(res.user);
              } catch (err) {
                setError(formatError(err, 'Failed to upload avatar'));
              } finally {
                setAvatarBusy(false);
                e.target.value = '';
              }
            }}
          />
        </label>
        {user.avatar_url && (
          <button
            type="button"
            disabled={avatarBusy}
            onClick={async () => {
              setError('');
              setAvatarBusy(true);
              try {
                const res = await api.deleteAvatar();
                onUpdated(res.user);
              } catch (err) {
                setError(formatError(err, 'Failed to remove avatar'));
              } finally {
                setAvatarBusy(false);
              }
            }}
            className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Trash size={14} weight="duotone" />
            Remove
          </button>
        )}
      </div>

      <form onSubmit={save} className="space-y-3.5">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Short bio..."
          rows={2}
          className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Custom Status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_PRESETS.map((p) => (
              <button
                key={p.text}
                type="button"
                onClick={() => {
                  setStatusEmoji(p.emoji);
                  setStatusText(p.text);
                }}
                className="px-2.5 py-1 rounded-full bg-stone-100 dark:bg-zinc-800 hover:bg-violet-500/15 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer transition"
              >
                {p.emoji} {p.text}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={statusEmoji}
              onChange={(e) => setStatusEmoji(e.target.value)}
              placeholder="🟢"
              className="w-16 px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-center"
            />
            <input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What's your status?"
              className="flex-1 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (leave blank to keep)"
          className="w-full px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold cursor-pointer"
        >
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-stone-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={enablePush}
          className="w-full py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <BellRinging size={16} weight="duotone" className="text-violet-500" />
          Enable & Test Web Push Notifications
        </button>
        {pushStatus && <p className="text-xs text-zinc-500 mt-2 text-center">{pushStatus}</p>}
      </div>
    </MotionModal>
  );
}
