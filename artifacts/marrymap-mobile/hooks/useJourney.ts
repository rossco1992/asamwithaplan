import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApi } from '@/hooks/useApi';
import { localToday, type Journey, type MilestoneWhen } from '@/lib/journey';

type JourneyState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; status: number }
  | { kind: 'ready'; journey: Journey };

export interface JourneyActions {
  refresh: () => Promise<void>;
  setMilestoneStatus: (milestoneId: number, status: 'todo' | 'done' | 'skipped') => Promise<boolean>;
  addMilestone: (input: { title: string; notes?: string; when: MilestoneWhen }) => Promise<boolean>;
  deleteMilestone: (milestoneId: number) => Promise<boolean>;
  addTask: (milestoneId: number, title: string) => Promise<boolean>;
  setTaskDone: (milestoneId: number, taskId: number, done: boolean) => Promise<boolean>;
}

/**
 * Loads a wedding's journey and applies changes. Every change answers with
 * the whole journey, so the map never drifts from what the server holds.
 */
export function useJourney(weddingId: number): { state: JourneyState; actions: JourneyActions; error: string | null } {
  const { apiFetch } = useApi();
  const [state, setState] = useState<JourneyState>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Changes run one at a time, so a slow response can never land after a
  // newer one and undo it on screen.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const base = `/weddings/${weddingId}/milestones`;
  const withToday = (path: string) => `${path}?today=${localToday()}`;

  const refresh = useCallback(async () => {
    const result = await apiFetch<Journey>(withToday(base));
    if (!mounted.current) return;
    if (result.ok) {
      setState({ kind: 'ready', journey: result.data });
    } else {
      setState({ kind: 'error', message: result.error, status: result.status });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Coming back to the app picks up what the other partner changed, and on a
  // new day moves the countdown and overdue stops on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        queue.current = queue.current.then(refresh, refresh);
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const mutate = useCallback(
    (path: string, method: string, body?: unknown): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        setError(null);
        const result = await apiFetch<{ journey: Journey }>(withToday(path), {
          method,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!mounted.current) return false;
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        setState({ kind: 'ready', journey: result.data.journey });
        return true;
      };
      const next = queue.current.then(run, run);
      queue.current = next.catch(() => undefined);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );

  const actions: JourneyActions = {
    refresh,
    setMilestoneStatus: (milestoneId, status) =>
      mutate(`${base}/${milestoneId}`, 'PATCH', { status }),
    addMilestone: ({ title, notes, when }) =>
      mutate(base, 'POST', { title, ...(notes ? { notes } : {}), when }),
    deleteMilestone: (milestoneId) => mutate(`${base}/${milestoneId}`, 'DELETE'),
    addTask: (milestoneId, title) => mutate(`${base}/${milestoneId}/tasks`, 'POST', { title }),
    setTaskDone: (milestoneId, taskId, done) =>
      mutate(`${base}/${milestoneId}/tasks/${taskId}`, 'PATCH', { done }),
  };

  return { state, actions, error };
}
