export function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl;
  }
}
