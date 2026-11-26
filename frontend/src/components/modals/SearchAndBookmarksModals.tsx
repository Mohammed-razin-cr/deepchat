import { useEffect, useState } from 'react';
import { At, BookmarkSimple, ChatText, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { api } from '../../api';
import type { Message, SearchHistoryItem } from '../../types';
import { formatError } from '../../utils/errors';
import { MotionModal } from '../ui/MotionModal';
import { ModalError } from './ModalAlerts';

export function SearchModal({
  onClose,
  onJumpToRoom,
}: {
  onClose: () => void;
  onJumpToRoom: (roomId: number, messageId?: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runSearch = async (q: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.search(q);
      setResults(res.results);
      setHistory(res.history);
    } catch (err) {
      setError(formatError(err, 'Search failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.search('');
        if (!cancelled) {
          setResults(res.results);
          setHistory(res.history);
        }
      } catch (err) {
        if (!cancelled) setError(formatError(err, 'Failed to load search history'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MotionModal title="Search Messages" subtitle="Full-text search across all unlocked rooms you belong to" onClose={onClose}>
      <ModalError message={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="flex gap-2 mb-4"
      >
        <div className="relative flex-1">
          <MagnifyingGlass size={17} weight="duotone" className="text-violet-500 absolute left-3.5 top-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
        >
          {loading ? '...' : 'Search'}
        </button>
      </form>

      {history.length > 0 && results.length === 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Recent Searches</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.clearSearchHistory();
                  setHistory([]);
                } catch (err) {
                  setError(formatError(err, 'Failed to clear history'));
                }
              }}
              className="text-xs text-zinc-400 hover:text-rose-500 cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h) => (
              <button
                type="button"
                key={h.id}
                onClick={() => {
                  setQuery(h.query);
                  runSearch(h.query);
                }}
                className="px-3 py-1 rounded-full bg-stone-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-violet-500/15 cursor-pointer"
              >
                {h.query}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && query.trim() && results.length === 0 && (
        <p className="text-xs text-zinc-400 py-4 text-center">No matching messages found for “{query}”.</p>
      )}

      <div className="space-y-2">
        {results.map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => {
              onJumpToRoom(m.room_id, m.id);
              onClose();
            }}
            className="w-full text-left p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 hover:bg-violet-500/10 border border-stone-200 dark:border-zinc-800 transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="font-semibold text-violet-500">#{m.room_name}</span>
              <span className="font-mono">{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <div className="text-sm text-zinc-800 dark:text-zinc-100">
              <span className="font-semibold">{m.creator?.name}: </span>
              {m.body}
            </div>
          </button>
        ))}
      </div>
    </MotionModal>
  );
}

export function BookmarksModal({
  onClose,
  onJumpToRoom,
  onBookmarkRemoved,
}: {
  onClose: () => void;
  onJumpToRoom: (roomId: number, messageId?: number) => void;
  onBookmarkRemoved?: (messageId: number) => void;
}) {
  const [bookmarks, setBookmarks] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listBookmarks();
        if (!cancelled) setBookmarks(res.bookmarks);
      } catch (err) {
        if (!cancelled) setError(formatError(err, 'Failed to load bookmarks'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MotionModal title="Saved Bookmarks" subtitle="Messages you bookmarked for quick reference" onClose={onClose}>
      <ModalError message={error} />
      {loading ? (
        <p className="text-sm text-zinc-400">Loading bookmarks...</p>
      ) : bookmarks.length === 0 ? (
        <div className="text-center py-8 text-zinc-400">
          <BookmarkSimple size={32} weight="duotone" className="mx-auto mb-2 text-violet-500/70" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No bookmarks yet</p>
          <p className="text-xs mt-1">Hover any message and click the bookmark icon to save it here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {bookmarks.map((m) => (
            <div
              key={m.id}
              onClick={() => {
                onJumpToRoom(m.room_id, m.id);
                onClose();
              }}
              className="p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 hover:bg-violet-500/10 border border-stone-200 dark:border-zinc-800 transition cursor-pointer flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                  <span className="font-semibold text-violet-500">#{m.room_name}</span>
                  <span>·</span>
                  <span>{m.creator?.name}</span>
                </div>
                <p className="text-sm text-zinc-800 dark:text-zinc-100 break-words">{m.body || 'Attachment'}</p>
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  setError('');
                  try {
                    await api.toggleBookmark(m.id);
                    setBookmarks((prev) => prev.filter((x) => x.id !== m.id));
                    onBookmarkRemoved?.(m.id);
                  } catch (err) {
                    setError(formatError(err, 'Failed to remove bookmark'));
                  }
                }}
                title="Remove bookmark"
                aria-label="Remove bookmark"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer shrink-0"
              >
                <Trash size={14} weight="duotone" />
              </button>
            </div>
          ))}
        </div>
      )}
    </MotionModal>
  );
}

export function MentionsModal({
  onClose,
  onJumpToRoom,
}: {
  onClose: () => void;
  onJumpToRoom: (roomId: number, messageId?: number) => void;
}) {
  const [mentions, setMentions] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listMentions();
        if (!cancelled) setMentions(res.mentions);
      } catch (err) {
        if (!cancelled) setError(formatError(err, 'Failed to load mentions & replies'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MotionModal title="Mentions & Replies" subtitle="Direct @mentions and replies to your messages" onClose={onClose}>
      <ModalError message={error} />
      {loading ? (
        <p className="text-sm text-zinc-400">Loading activity...</p>
      ) : mentions.length === 0 ? (
        <div className="text-center py-8 text-zinc-400">
          <At size={32} weight="duotone" className="mx-auto mb-2 text-violet-500/70" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">All caught up</p>
          <p className="text-xs mt-1">When teammates @mention you or reply to your messages, they appear here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {mentions.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => {
                onJumpToRoom(m.room_id, m.id);
                onClose();
              }}
              className="w-full text-left p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 hover:bg-violet-500/10 border border-stone-200 dark:border-zinc-800 transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-violet-500">
                  {m.mention_kind === 'reply' ? <ChatText size={13} weight="duotone" /> : <At size={13} weight="bold" />}
                  #{m.room_name}
                </span>
                <span className="font-mono">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm text-zinc-800 dark:text-zinc-100 break-words">
                <span className="font-semibold">{m.creator?.name}: </span>
                {m.body || 'Attachment'}
              </div>
            </button>
          ))}
        </div>
      )}
    </MotionModal>
  );
}
