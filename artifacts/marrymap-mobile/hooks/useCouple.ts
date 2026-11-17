import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { localToday } from '@/lib/journey';
import type { Couple, DatePreview, Invite } from '@/lib/couple';

/**
 * Who shares the plan, the invite code for the other partner, and the
 * wedding date. The date lives on the wedding, so either partner can change it.
 */
export function useCouple(weddingId: number) {
  const { apiFetch } = useApi();
  const [couple, setCouple] = useState<Couple | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const base = `/weddings/${weddingId}`;

  const refresh = useCallback(async () => {
    const result = await apiFetch<Couple>(`${base}/members`);
    if (mounted.current && result.ok) setCouple(result.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createInvite = useCallback(async () => {
    const result = await apiFetch<Invite>(`${base}/invites`, { method: 'POST' });
    if (result.ok) await refresh();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, refresh]);

  const cancelInvite = useCallback(async () => {
    const result = await apiFetch<{ ok: true }>(`${base}/invites`, { method: 'DELETE' });
    if (result.ok) await refresh();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, refresh]);

  const removeMember = useCallback(async (memberId: number) => {
    const result = await apiFetch<{ ok: true }>(`${base}/members/${memberId}`, { method: 'DELETE' });
    if (result.ok) await refresh();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, refresh]);

  const previewDate = useCallback(
    (weddingDate: string | null) =>
      apiFetch<DatePreview>(`${base}/milestones/date-preview?today=${localToday()}`, {
        method: 'POST',
        body: JSON.stringify({ weddingDate }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );

  const setWeddingDate = useCallback(
    (weddingDate: string | null) =>
      apiFetch<{ wedding: { weddingDate: string | null } }>(base, {
        method: 'PATCH',
        body: JSON.stringify({ weddingDate }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );

  return { couple, refresh, createInvite, cancelInvite, removeMember, previewDate, setWeddingDate };
}

export type CoupleActions = ReturnType<typeof useCouple>;
