import { useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowsLeftRight,
  ChatsTeardrop,
  Eye,
  EyeSlash,
  LockKey,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  UserPlus,
} from '@phosphor-icons/react';
import { api } from '../api';
import type { Account, User } from '../types';
import { AuroraBackground } from './ui/AuroraBackground';

interface AuthScreensProps {
  mode: 'setup' | 'login' | 'join';
  joinCode?: string;
  accountName?: string;
  onAuthenticated: (user: User, account?: Account) => void;
  onSwitchToLogin?: () => void;
}

export function AuthScreens({ mode, joinCode, accountName, onAuthenticated, onSwitchToLogin }: AuthScreensProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'join' | 'setup'>(mode);
  const [workspaceName, setWorkspaceName] = useState(accountName || 'DeepChat');
  const [inviteInput, setInviteInput] = useState(joinCode || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const workspaceId = `${idPrefix}-workspace`;
  const nameId = `${idPrefix}-name`;
  const emailId = `${idPrefix}-email`;
  const inviteId = `${idPrefix}-invite`;
  const passwordId = `${idPrefix}-password`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (activeTab === 'setup') {
        const res = await api.firstRun({
          account_name: workspaceName.trim(),
          name: name.trim(),
          email_address: email.trim(),
          password,
        });
        onAuthenticated(res.user, res.account);
      } else if (activeTab === 'join') {
        const code = inviteInput.trim() || joinCode || '';
        if (!code) {
          throw new Error('Please enter an invite code');
        }
        const res = await api.joinAccount(code, {
          name: name.trim(),
          email_address: email.trim(),
          password,
        });
        onAuthenticated(res.user);
      } else {
        const res = await api.login({ email_address: email.trim(), password });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuroraBackground>
      <header className="w-full max-w-7xl mx-auto px-5 sm:px-8 pt-5 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/35 flex items-center justify-center text-blue-300 shadow-sm shadow-blue-500/25">
              <ChatsTeardrop size={19} weight="duotone" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">
              {accountName || 'DeepChat'}
            </span>
          </div>

          <nav
            aria-label="Authentication mode"
            className="hidden sm:flex items-center p-1 rounded-full bg-[#091226]/85 border border-blue-300/18 backdrop-blur-xl text-xs font-medium shadow-lg shadow-black/25"
          >
            <button
              type="button"
              onClick={() => {
                setError('');
                setActiveTab(mode === 'setup' ? 'setup' : 'login');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition cursor-pointer ${
                activeTab === 'login' || activeTab === 'setup'
                  ? 'bg-[#142547] text-white border border-blue-300/25 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ArrowsLeftRight size={13} weight="bold" />
              {mode === 'setup' ? 'Setup' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError('');
                setActiveTab('join');
              }}
              className={`px-3.5 py-1.5 rounded-full transition cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-[#142547] text-white border border-blue-300/25 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Join Invite
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-2 pl-3.5 pr-1.5 py-1 rounded-full bg-[#091226]/85 border border-blue-300/18 text-xs text-slate-300">
            <MagnifyingGlass size={13} className="text-slate-400" />
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => {
                setInviteInput(e.target.value);
                if (e.target.value.trim()) setActiveTab('join');
              }}
              placeholder="Paste invite code..."
              aria-label="Quick invite code lookup"
              className="bg-transparent w-40 text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow shadow-blue-500/40">
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setError('');
              if (activeTab === 'join' && onSwitchToLogin) onSwitchToLogin();
              setActiveTab(mode === 'setup' ? 'setup' : 'login');
              emailInputRef.current?.focus();
            }}
            className="px-5 py-2 rounded-full bg-white hover:bg-blue-50 text-[#050A18] text-xs font-bold shadow-lg shadow-white/15 transition cursor-pointer"
          >
            Connect
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[440px]"
        >
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative rounded-[30px] bg-[#0B1730]/78 backdrop-blur-2xl border border-blue-200/20 shadow-[0_28px_80px_-16px_rgba(3,7,20,0.9),inset_0_1px_0_rgba(191,219,254,0.14)] p-4 pb-10 overflow-visible">
              {/* Subtle center cosmic seam aura behind stacked panels */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 w-[82%] h-24 rounded-full blur-2xl"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.28) 0%, transparent 72%)',
                }}
              />

              {/* Top Card Pill Tabs */}
              <div className="relative z-10 flex items-center justify-between gap-2 mb-3.5 px-1">
                <div className="flex items-center p-1 rounded-full bg-[#070E1F]/90 border border-blue-300/15 text-xs font-medium">
                  {mode === 'setup' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setActiveTab('setup');
                      }}
                      className={`px-3.5 py-1 rounded-full transition cursor-pointer ${
                        activeTab === 'setup'
                          ? 'bg-[#172B52] text-white border border-blue-300/20 shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Setup
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setActiveTab('login');
                    }}
                    className={`px-3.5 py-1 rounded-full transition cursor-pointer ${
                      activeTab === 'login'
                        ? 'bg-[#172B52] text-white border border-blue-300/20 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setActiveTab('join');
                    }}
                    className={`px-3.5 py-1 rounded-full transition cursor-pointer ${
                      activeTab === 'join'
                        ? 'bg-[#172B52] text-white border border-blue-300/20 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Join
                  </button>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-blue-400/10 border border-blue-300/15 text-[11px] font-medium text-blue-200/85">
                  {activeTab === 'setup' ? 'First Run' : activeTab === 'join' ? 'Invite Access' : 'Workspace Auth'}
                </span>
              </div>

              {error && (
                <div
                  role="alert"
                  className="relative z-10 mb-3 px-3.5 py-2.5 rounded-2xl bg-rose-500/15 border border-rose-400/35 text-rose-200 text-xs flex items-center gap-2"
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Dual Stacked Glass Sub-Panels */}
              <div className="relative z-10 space-y-2">
                {/* Top Sub-Panel: Identity / Workspace */}
                <div className="auth-subpanel rounded-[22px] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor={emailId} className="text-xs font-medium text-slate-300">
                      {activeTab === 'setup' ? 'Workspace & Admin' : activeTab === 'join' ? 'New Member' : 'Account'}
                    </label>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-400/12 border border-blue-300/20 text-[11px] font-semibold text-blue-300">
                      {accountName || 'DeepChat'}
                    </span>
                  </div>

                  {activeTab === 'setup' && (
                    <div>
                      <label htmlFor={workspaceId} className="sr-only">
                        Workspace Name
                      </label>
                      <input
                        id={workspaceId}
                        name="organization"
                        type="text"
                        required
                        autoComplete="organization"
                        enterKeyHint="next"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder="Workspace Name"
                        className="w-full bg-transparent text-lg font-semibold text-white placeholder-slate-400/70 focus:outline-none border-b border-blue-300/15 pb-1.5"
                      />
                    </div>
                  )}

                  {(activeTab === 'setup' || activeTab === 'join') && (
                    <div>
                      <label htmlFor={nameId} className="sr-only">
                        Full Name
                      </label>
                      <input
                        id={nameId}
                        name="fullname"
                        type="text"
                        required
                        autoComplete="name"
                        enterKeyHint="next"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your Name (e.g. Alex Rivera)"
                        className="w-full bg-transparent text-base font-medium text-white placeholder-slate-400/70 focus:outline-none border-b border-blue-300/15 pb-1.5"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <input
                      ref={emailInputRef}
                      id={emailId}
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@deepchat.local"
                      className="flex-1 min-w-0 bg-transparent text-lg sm:text-xl font-semibold text-white placeholder-slate-400/70 focus:outline-none"
                    />
                    <span className="px-2.5 py-1 rounded-full bg-[#15294F] border border-blue-300/20 text-[11px] font-semibold text-blue-100 shrink-0 tracking-wide">
                      EMAIL
                    </span>
                  </div>
                </div>

                {/* Center Orb Divider */}
                <div className="relative z-20 flex justify-center -my-4 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-4 border-[#0B1730] flex items-center justify-center text-white shadow-[0_0_24px_rgba(59,130,246,0.6)]">
                    {activeTab === 'join' ? (
                      <UserPlus size={16} weight="bold" />
                    ) : activeTab === 'setup' ? (
                      <Sparkle size={16} weight="fill" />
                    ) : (
                      <LockKey size={16} weight="fill" />
                    )}
                  </div>
                </div>

                {/* Bottom Sub-Panel: Security / Password */}
                <div className="auth-subpanel-dark rounded-[22px] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={passwordId} className="text-xs font-medium text-slate-300">
                      {activeTab === 'join' ? 'Invite Code & Password' : 'Password'}
                    </label>
                    <span className="text-[11px] text-slate-300/90 flex items-center gap-1">
                      <ShieldCheck size={13} weight="duotone" className="text-blue-400" />
                      Encrypted session
                    </span>
                  </div>

                  {activeTab === 'join' && (
                    <div>
                      <label htmlFor={inviteId} className="sr-only">
                        Invite Code
                      </label>
                      <input
                        id={inviteId}
                        name="invite_code"
                        type="text"
                        required
                        autoComplete="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        value={inviteInput}
                        onChange={(e) => setInviteInput(e.target.value)}
                        placeholder="Enter invite code"
                        className="w-full bg-transparent text-sm font-mono text-blue-200 placeholder-slate-400/70 focus:outline-none border-b border-blue-300/15 pb-1.5"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <input
                      id={passwordId}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                      enterKeyHint="done"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="flex-1 min-w-0 bg-transparent text-lg sm:text-xl font-semibold text-white placeholder-slate-400/70 focus:outline-none tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="w-8 h-8 rounded-full bg-[#15294F] border border-blue-300/20 flex items-center justify-center text-blue-200 hover:text-white hover:border-blue-300/40 shrink-0 cursor-pointer transition"
                    >
                      {showPassword ? <EyeSlash size={15} weight="duotone" /> : <Eye size={15} weight="duotone" />}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 pt-0.5">
                    {activeTab === 'setup'
                      ? 'Creates your admin account & default #General room'
                      : activeTab === 'join'
                      ? 'Join workspace instantly via invite code'
                      : 'Access all your rooms, DMs, private vaults & calls'}
                  </p>
                </div>
              </div>

              {/* Overlapping Cosmic Blue CTA Pill */}
              <div className="absolute left-1/2 -bottom-5 -translate-x-1/2 w-[58%] min-w-[205px] z-20">
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 px-6 rounded-full bg-gradient-to-r from-[#66A8FF] via-[#4D92FA] to-[#3B82F6] hover:from-[#79B4FF] hover:to-[#5393FA] disabled:opacity-50 text-white text-sm font-bold border-t border-white/35 shadow-[0_10px_32px_rgba(59,130,246,0.55)] transition cursor-pointer"
                >
                  {loading
                    ? 'Connecting...'
                    : activeTab === 'setup'
                    ? 'Launch DeepChat'
                    : activeTab === 'join'
                    ? 'Join Workspace'
                    : 'Sign In'}
                </motion.button>
              </div>
            </div>
          </form>

          <p className="mt-10 text-center text-xs text-slate-400">
            DeepChat powered by{' '}
            <span className="text-blue-400 font-medium">Private Rooms · WebRTC Calls · FastAPI</span>
          </p>
        </motion.div>
      </main>
    </AuroraBackground>
  );
}
