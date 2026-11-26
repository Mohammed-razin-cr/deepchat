import { useEffect, useState } from 'react';
import { ChatText, PaperPlaneTilt, X } from '@phosphor-icons/react';
import { api } from '../../api';
import type { Message, User } from '../../types';
import { formatError } from '../../utils/errors';
import { Avatar } from '../Avatar';

interface ThreadDrawerProps {
  parentMessageId: number;
  currentUser: User;
  roomMessages: Message[];
  onClose: () => void;
  onSendReply: (parentId: number, body: string) => Promise<void>;
}

export function ThreadDrawer({
  parentMessageId,
  currentUser,
  roomMessages,
  onClose,
  onSendReply,
}: ThreadDrawerProps) {
  const [parent, setParent] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getThread(parentMessageId);
        if (!cancelled) {
          setParent(res.parent);
          setReplies(res.replies);
        }
      } catch (err) {
        if (!cancelled) setError(formatError(err, 'Failed to load thread'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentMessageId]);

  // Keep thread replies synced live from WebSocket updates present in roomMessages
  const liveReplies = roomMessages.filter((m) => m.reply_to_id === parentMessageId);
  const mergedReplies = [...replies];
  for (const r of liveReplies) {
    if (!mergedReplies.some((x) => x.id === r.id)) {
      mergedReplies.push(r);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    setError('');
    setSending(true);
    try {
      await onSendReply(parentMessageId, replyText.trim());
      setReplyText('');
    } catch (err) {
      setError(formatError(err, 'Failed to send reply'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label="Message thread"
        className="fixed right-0 top-0 bottom-0 z-50 lg:static lg:z-auto flex w-80 sm:w-88 shrink-0 flex-col h-full bg-[#F4F2FA] dark:bg-[#0D0A18] border-l border-violet-200/70 dark:border-white/[0.08] shadow-2xl lg:shadow-none"
      >
        <div className="px-4 py-3.5 border-b border-violet-200/60 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatText size={18} weight="duotone" className="text-violet-500" />
            <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Thread</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/10 cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div role="alert" className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-zinc-400">Loading thread...</p>
          ) : (
            parent && (
              <>
                {/* Parent Message */}
                <div className="p-3.5 rounded-2xl glass-panel space-y-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar user={parent.creator} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {parent.creator?.name || 'Unknown'}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {new Date(parent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">
                    {parent.body || 'Attachment'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-violet-200/60 dark:bg-white/[0.08]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {mergedReplies.length} {mergedReplies.length === 1 ? 'reply' : 'replies'}
                  </span>
                  <div className="h-px flex-1 bg-violet-200/60 dark:bg-white/[0.08]" />
                </div>

                {mergedReplies.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-4">No replies yet. Start the thread below.</p>
                ) : (
                  <div className="space-y-3">
                    {mergedReplies.map((r) => (
                      <div key={r.id} className="flex items-start gap-2.5">
                        <Avatar user={r.creator} size="xs" />
                        <div className="min-w-0 flex-1 p-2.5 rounded-2xl bg-white/75 dark:bg-white/[0.045] border border-violet-200/60 dark:border-white/[0.07]">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 truncate">
                              {r.creator?.name || currentUser.name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">
                            {r.body || 'Attachment'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-3 border-t border-violet-200/60 dark:border-white/[0.07]">
          <div className="flex items-center gap-1.5 glass-panel rounded-full px-3 py-1.5">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply in thread..."
              className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none py-1"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || sending}
              aria-label="Send thread reply"
              className="p-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 disabled:opacity-40 text-white cursor-pointer"
            >
              <PaperPlaneTilt size={13} weight="fill" />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
