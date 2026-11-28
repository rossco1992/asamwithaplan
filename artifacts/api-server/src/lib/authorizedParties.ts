/**
 * Which browser origins Clerk accepts session tokens from.
 *
 * CLERK_AUTHORIZED_PARTIES lists them (comma-separated). On Netlify, the
 * deploy's own addresses are added too, so a deploy preview, which has its
 * own address, can sign in to its own API. Those are the same site as the API,
 * so this never lets in another site. With no list configured, nothing is
 * restricted, as before.
 */
export function resolveAuthorizedParties(
  configured: string | undefined,
  deployOrigins: readonly string[] = [],
): string[] | undefined {
  const listed = (configured ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (listed.length === 0) return undefined;

  const own = deployOrigins.flatMap((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? [url.origin] : [];
    } catch {
      return [];
    }
  });
  return [...new Set([...listed, ...own])];
}
