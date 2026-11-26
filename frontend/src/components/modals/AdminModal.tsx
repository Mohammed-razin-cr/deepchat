import { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  Check,
  Copy,
  Key,
  Robot,
  ShieldCheck,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import { api } from '../../api';
import type { Account, User } from '../../types';
import { Avatar } from '../Avatar';
import { MotionModal } from '../ui/MotionModal';
import { ModalError } from './ModalAlerts';
import { formatError } from '../../utils/errors';

export function AdminModal({
  account,
  currentUserId,
  onClose,
  onAccountUpdated,
}: {
  account: Account;
  currentUserId: number;
  onClose: () => void;
  onAccountUpdated: (acc: Account) => void;
}) {
  const [tab, setTab] = useState<'general' | 'users' | 'bots'>('general');
  const [name, setName] = useState(account.name);
  const [users, setUsers] = useState<User[]>([]);
  const [bots, setBots] = useState<User[]>([]);
  const [botName, setBotName] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState('');

  const inviteUrl = `${window.location.origin}/?join=${account.join_code}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [uRes, bRes] = await Promise.all([api.listAccountUsers(), api.listBots()]);
        if (!cancelled) {
          setUsers(uRes.users);
          setBots(bRes.bots);
        }
      } catch (err) {
        if (!cancelled) setError(formatError(err, 'Failed to load workspace administration data'));
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MotionModal title="Workspace Administration" onClose={onClose}>
      <ModalError message={error} />
      <div className="flex gap-2 mb-4 border-b border-stone-200 dark:border-zinc-800 pb-3">
        {(['general', 'users', 'bots'] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => {
              setTab(t);
              setConfirmAction(null);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize cursor-pointer transition ${
              tab === t
                ? 'bg-violet-500 text-white'
                : 'bg-stone-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError('');
                setBusy(true);
                try {
                  const res = await api.updateAccount({ name: name.trim() });
                  onAccountUpdated(res.account);
                } catch (err) {
                  setError(formatError(err, 'Failed to rename workspace'));
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              Save
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Workspace Accent Theme
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'violet', label: 'Violet', swatch: 'bg-violet-500' },
                { id: 'indigo', label: 'Indigo', swatch: 'bg-indigo-500' },
                { id: 'blue', label: 'Blue', swatch: 'bg-blue-500' },
                { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
                { id: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
              ].map((theme) => {
                const active = (account.custom_styles || 'violet') === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={async () => {
                      setError('');
                      try {
                        const res = await api.updateAccount({ custom_styles: theme.id });
                        onAccountUpdated(res.account);
                      } catch (err) {
                        setError(formatError(err, 'Failed to update accent theme'));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition ${
                      active
                        ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-200'
                        : 'border-stone-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${theme.swatch}`} />
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Workspace Logo</div>
            <div className="flex items-center gap-3">
              {account.logo_url ? (
                <img src={account.logo_url} alt={account.name} className="w-10 h-10 rounded-xl object-cover border border-stone-200 dark:border-zinc-700" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center font-bold text-sm">
                  {account.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <label className="px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-stone-300 dark:hover:bg-zinc-700 cursor-pointer flex items-center gap-1.5">
                <UploadSimple size={14} weight="bold" />
                Upload Logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setError('');
                    try {
                      const res = await api.uploadLogo(f);
                      onAccountUpdated(res.account);
                    } catch (err) {
                      setError(formatError(err, 'Failed to upload logo'));
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              {account.logo_url && (
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    try {
                      await api.deleteLogo();
                      onAccountUpdated({ ...account, logo_url: null });
                    } catch (err) {
                      setError(formatError(err, 'Failed to remove logo'));
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 text-xs font-semibold cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Invite Link</div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                aria-label="Copy invite link"
                className="p-2 rounded-lg bg-violet-500 text-white cursor-pointer"
              >
                {copied ? <Check size={15} weight="bold" /> : <Copy size={15} weight="duotone" />}
              </button>
              {confirmAction === 'regen_invite' ? (
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    try {
                      const res = await api.regenerateJoinCode();
                      onAccountUpdated(res.account);
                      setConfirmAction(null);
                    } catch (err) {
                      setError(formatError(err, 'Failed to regenerate invite code'));
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmAction('regen_invite')}
                  title="Regenerate invite code"
                  aria-label="Regenerate invite code"
                  className="p-2 rounded-lg bg-stone-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
                >
                  <ArrowsClockwise size={15} weight="bold" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-2">
          {loadingLists && <p className="text-xs text-zinc-400">Loading users...</p>}
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <div key={u.id} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 dark:bg-zinc-900/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {u.name} {isSelf ? '(You)' : ''}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{u.email_address}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isSelf}
                    title={isSelf ? 'Cannot demote yourself' : 'Toggle administrator role'}
                    onClick={async () => {
                      setError('');
                      try {
                        const nextRole = u.role === 'administrator' ? 'member' : 'administrator';
                        const res = await api.updateAccountUser(u.id, { role: nextRole });
                        setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
                      } catch (err) {
                        setError(formatError(err, 'Failed to update user role'));
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs bg-violet-500/10 text-violet-600 dark:text-violet-300 font-medium cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ShieldCheck size={13} weight="duotone" />
                    {u.role}
                  </button>
                  {!isSelf && (
                    confirmAction === `ban_${u.id}` ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setError('');
                          try {
                            const nextStatus = u.status === 'banned' ? 'active' : 'banned';
                            const res = await api.updateAccountUser(u.id, { status: nextStatus });
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
                            setConfirmAction(null);
                          } catch (err) {
                            setError(formatError(err, 'Failed to update user status'));
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 text-white cursor-pointer"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (u.status === 'banned') {
                            api
                              .updateAccountUser(u.id, { status: 'active' })
                              .then((res) => setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x))))
                              .catch((err) => setError(formatError(err, 'Failed to unban user')));
                          } else {
                            setConfirmAction(`ban_${u.id}`);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                          u.status === 'banned'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-rose-500/10 text-rose-600'
                        }`}
                      >
                        {u.status === 'banned' ? 'Unban' : 'Ban'}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'bots' && (
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!botName.trim()) return;
              setError('');
              try {
                const res = await api.createBot(botName.trim());
                setBots((prev) => [res.bot, ...prev]);
                setBotName('');
              } catch (err) {
                setError(formatError(err, 'Failed to create bot'));
              }
            }}
            className="flex gap-2"
          >
            <input
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              placeholder="New bot name (e.g. DeployBot)"
              className="flex-1 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold cursor-pointer">
              Create Bot
            </button>
          </form>

          {loadingLists && <p className="text-xs text-zinc-400">Loading bots...</p>}
          <div className="space-y-2">
            {bots.map((b) => (
              <div
                key={b.id}
                className="p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                    <Robot size={17} weight="duotone" className="text-violet-500" />
                    {b.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Regenerate webhook key"
                      onClick={async () => {
                        setError('');
                        try {
                          const res = await api.regenerateBotKey(b.id);
                          setBots((prev) => prev.map((x) => (x.id === b.id ? res.bot : x)));
                        } catch (err) {
                          setError(formatError(err, 'Failed to regenerate key'));
                        }
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 cursor-pointer"
                    >
                      <Key size={15} weight="duotone" />
                    </button>
                    {confirmAction === `bot_${b.id}` ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setError('');
                          try {
                            await api.deleteBot(b.id);
                            setBots((prev) => prev.filter((x) => x.id !== b.id));
                            setConfirmAction(null);
                          } catch (err) {
                            setError(formatError(err, 'Failed to delete bot'));
                          }
                        }}
                        className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${b.name}`}
                        onClick={() => setConfirmAction(`bot_${b.id}`)}
                        className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg cursor-pointer"
                      >
                        <Trash size={15} weight="duotone" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[11px] font-mono bg-white dark:bg-zinc-950 p-2 rounded-lg border border-stone-200 dark:border-zinc-800 break-all text-zinc-600 dark:text-zinc-300">
                  POST /api/rooms/&lt;room_id&gt;/{b.bot_token}/messages
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MotionModal>
  );
}
