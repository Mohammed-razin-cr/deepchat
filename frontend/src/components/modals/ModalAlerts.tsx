export function ModalError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-3 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-medium"
    >
      {message}
    </div>
  );
}
