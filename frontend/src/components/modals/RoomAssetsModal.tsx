import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowSquareOut, DownloadSimple, FileText, Image, LinkSimple, Play, X } from '@phosphor-icons/react';
import type { Attachment } from '../../types';
import { MotionModal } from '../ui/MotionModal';

export function ImageLightbox({
  image,
  onClose,
}: {
  image: { url: string; filename: string };
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.filename}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl flex items-center justify-between text-white mb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold truncate">{image.filename}</span>
        <div className="flex items-center gap-2">
          <a
            href={image.url}
            download={image.filename}
            className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center gap-1.5"
          >
            <DownloadSimple size={14} weight="bold" />
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>
      <motion.img
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        src={image.url}
        alt={image.filename}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/15"
      />
    </div>
  );
}

export function RoomAssetsModal({
  initialTab = 'media',
  media,
  files,
  links,
  onClose,
  onPreviewImage,
}: {
  initialTab?: 'media' | 'files' | 'links';
  media: Attachment[];
  files: Attachment[];
  links: { url: string; title: string }[];
  onClose: () => void;
  onPreviewImage: (att: Attachment) => void;
}) {
  const [tab, setTab] = useState<'media' | 'files' | 'links'>(initialTab);

  return (
    <MotionModal title="Shared Room Assets" subtitle="All photos, videos, files, and links in this room" onClose={onClose}>
      <div className="flex gap-2 mb-4 border-b border-stone-200 dark:border-zinc-800 pb-3">
        {[
          { id: 'media' as const, label: `Media (${media.length})`, icon: <Image size={14} weight="duotone" /> },
          { id: 'files' as const, label: `Files (${files.length})`, icon: <FileText size={14} weight="duotone" /> },
          { id: 'links' as const, label: `Links (${links.length})`, icon: <LinkSimple size={14} weight="bold" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              tab === t.id
                ? 'bg-violet-500 text-white'
                : 'bg-stone-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'media' && (
        media.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">No photos or videos shared yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {media.map((att) =>
              att.content_type.startsWith('image/') ? (
                <button
                  type="button"
                  key={att.id}
                  onClick={() => onPreviewImage(att)}
                  className="aspect-square rounded-2xl overflow-hidden border border-stone-200 dark:border-zinc-800 cursor-pointer"
                >
                  <img src={att.url} alt={att.filename} className="w-full h-full object-cover hover:scale-105 transition" />
                </button>
              ) : (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-2xl overflow-hidden border border-stone-200 dark:border-zinc-800 bg-black/30"
                >
                  <video src={att.url} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <Play size={22} weight="fill" />
                  </span>
                </a>
              )
            )}
          </div>
        )
      )}

      {tab === 'files' && (
        files.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">No files shared yet.</p>
        ) : (
          <div className="space-y-2">
            {files.map((att) => (
              <a
                key={att.id}
                href={att.url}
                download={att.filename}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 hover:border-violet-400 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={18} weight="duotone" className="text-violet-500 shrink-0" />
                  <span className="text-xs font-semibold truncate">{att.filename}</span>
                </div>
                <DownloadSimple size={15} weight="bold" className="text-zinc-400 shrink-0" />
              </a>
            ))}
          </div>
        )
      )}

      {tab === 'links' && (
        links.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">No links shared yet.</p>
        ) : (
          <div className="space-y-2">
            {links.map((lnk, i) => (
              <a
                key={i}
                href={lnk.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-2xl bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 hover:border-violet-400 transition"
              >
                <ArrowSquareOut size={16} weight="bold" className="text-violet-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{lnk.title}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{lnk.url}</div>
                </div>
              </a>
            ))}
          </div>
        )
      )}
    </MotionModal>
  );
}
