import { useState } from 'react';
import { ChatsCircle, Robot, ShieldCheck } from '@phosphor-icons/react';
import type { User } from '../../types';
import { formatError } from '../../utils/errors';
import { Avatar } from '../Avatar';
import { MotionModal } from '../ui/MotionModal';
import { ModalError } from './ModalAlerts';

export function UserProfileModal({
  user,
  currentUserId,
  online,
  onClose,
  onStartDM,
}: {
  user: User;
  currentUserId: number;
  online: boolean;
  onClose: () => void;
  onStartDM: (userId: number) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <MotionModal title={user.name} subtitle="Teammate Profile" onClose={onClose} maxWidthClass="max-w-sm">
      <ModalError message={error} />
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={user} size="lg" online={online} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-zinc-900 dark:text-white truncate">{user.name}</h4>
              {user.role === 'administrator' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-semibold">
                  <ShieldCheck size={11} weight="fill" />
                  Admin
                </span>
              )}
              {user.role === 'bot' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-semibold">
                  <Robot size={11} weight="fill" />
                  Bot
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {user.status_emoji || user.status_text
                ? `${user.status_emoji || ''} ${user.status_text || ''}`.trim()
                : online
                ? 'Active now'
                : 'Offline'}
            </p>
          </div>
        </div>

        {user.bio ? (
          <div className="p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">
            {user.bio}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic">No bio added yet.</p>
        )}

        {user.id !== currentUserId && user.role !== 'bot' && (
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setError('');
              setLoading(true);
              try {
                await onStartDM(user.id);
                onClose();
              } catch (err) {
                setError(formatError(err, 'Unable to start direct message'));
              } finally {
                setLoading(false);
              }
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <ChatsCircle size={17} weight="duotone" />
            {loading ? 'Opening...' : 'Send Direct Message'}
          </button>
        )}
      </div>
    </MotionModal>
  );
}
