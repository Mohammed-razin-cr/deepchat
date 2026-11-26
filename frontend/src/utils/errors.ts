export function formatError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
