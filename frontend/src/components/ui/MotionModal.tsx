import { useEffect, useId, useRef } from 'react';
import { motion } from 'motion/react';
import { X } from '@phosphor-icons/react';

interface MotionModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function MotionModal({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = 'max-w-lg',
}: MotionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    let clickHandler: ((e: MouseEvent) => void) | null = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      clickHandler = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!inside) dialog.close();
      };
      dialog.addEventListener('click', clickHandler);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (clickHandler) dialog.removeEventListener('click', clickHandler);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${maxWidthClass} bg-transparent p-0 border-0 outline-none overflow-visible`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full bg-white/95 dark:bg-[#131022]/95 backdrop-blur-2xl border border-violet-200/70 dark:border-white/10 rounded-3xl shadow-2xl shadow-violet-950/30 overflow-hidden flex flex-col max-h-[86vh] text-zinc-900 dark:text-zinc-100"
      >
        <div className="px-6 py-4 border-b border-violet-200/50 dark:border-white/10 flex items-center justify-between gap-4">
          <div>
            <h3 id={titleId} className="font-bold text-base tracking-tight text-zinc-900 dark:text-white">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-zinc-500 dark:text-violet-200/60 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/10 transition cursor-pointer"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </motion.div>
    </dialog>
  );
}
