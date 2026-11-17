/**
 * The couple sharing a plan. Shapes mirror GET /api/weddings/:weddingId/members.
 */

export interface CoupleMember {
  id: number;
  role: 'owner' | 'partner';
  firstName: string | null;
  isYou: boolean;
}

export interface Couple {
  members: CoupleMember[];
  canInvite: boolean;
  pendingInvite: { expiresAt: string } | null;
}

export interface Invite {
  code: string;
  expiresAt: string;
}

export interface DatePreview {
  moved: { id: number; title: string; from: string | null; to: string | null }[];
  fixedAfterWedding: { id: number; title: string; date: string }[];
  nowOverdue: { id: number; title: string }[];
}

/** "RS" for Ross and Sam; your own initials until your partner joins. */
export function coupleInitials(members: CoupleMember[], fallback: string): string {
  const letters = [...members]
    .sort((a, b) => Number(b.isYou) - Number(a.isYou))
    .map((member) => member.firstName?.trim()[0]?.toUpperCase())
    .filter((letter): letter is string => Boolean(letter));
  if (letters.length === 2) return `${letters[0]}${letters[1]}`;
  return fallback;
}

/** What the share sheet offers to send. The couple picks where it goes. */
export function inviteMessage(invite: Invite): string {
  return `Join our wedding plan on A Sam with a Plan. Sign up in the app, choose "Join my partner's plan" and enter ${invite.code}. The code works once and expires in 7 days.`;
}

export function partnerOf(members: CoupleMember[]): CoupleMember | null {
  return members.find((member) => !member.isYou) ?? null;
}
