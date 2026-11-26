import { Robot } from '@phosphor-icons/react';
import type { User } from '../types';

const PALETTE = [
  'bg-violet-600',
  'bg-purple-600',
  'bg-fuchsia-600',
  'bg-indigo-600',
  'bg-cyan-600',
  'bg-emerald-600',
  'bg-rose-600',
  'bg-amber-600',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({
  user,
  size = 'md',
  online = false,
}: {
  user: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  const dims = {
    xs: 'w-5 h-5 text-[10px] rounded-lg',
    sm: 'w-8 h-8 text-xs rounded-xl',
    md: 'w-9 h-9 text-sm rounded-xl',
    lg: 'w-14 h-14 text-lg rounded-2xl',
  }[size];

  if (!user) {
    return (
      <div className={`${dims} bg-violet-200 dark:bg-white/10 flex items-center justify-center font-semibold`}>
        ?
      </div>
    );
  }

  const color = PALETTE[user.id % PALETTE.length];

  return (
    <div className="relative inline-flex shrink-0">
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.name}
          className={`${dims} object-cover ring-1 ring-black/10 dark:ring-white/15`}
        />
      ) : (
        <div
          className={`${dims} ${color} text-white font-semibold flex items-center justify-center shadow-xs ring-1 ring-black/10 dark:ring-white/15`}
        >
          {getInitials(user.name)}
        </div>
      )}
      {user.role === 'bot' && (
        <span
          title="Bot"
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md bg-violet-500 text-white flex items-center justify-center shadow ring-2 ring-white dark:ring-[#100C1E]"
        >
          <Robot size={10} weight="fill" />
        </span>
      )}
      {online && user.role !== 'bot' && (
        <span
          title="Online"
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-[#100C1E]"
        />
      )}
    </div>
  );
}
