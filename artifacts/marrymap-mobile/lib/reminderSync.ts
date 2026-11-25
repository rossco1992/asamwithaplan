/**
 * Puts a planned set of reminders onto the phone, and takes them off again.
 *
 * Every schedule and every cancel runs through one queue, one at a time. A
 * cancel also stops any schedule that is still running or waiting its turn,
 * so turning reminders off, signing out or leaving the plan never leaves
 * reminders behind: whatever a half-finished schedule managed to add is
 * removed by the cancel that runs right after it.
 *
 * Kept free of React Native imports so it runs under the plain Node test
 * runner; hooks/useReminders.ts supplies the phone's side.
 */
import type { PlannedReminder } from './reminders';

/** What the sync needs from the phone. */
export interface ReminderStore {
  /** Ids of the reminders this app scheduled, and only those. */
  scheduledIds(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  schedule(reminder: PlannedReminder): Promise<void>;
  readSignature(): Promise<string | null>;
  writeSignature(signature: string | null): Promise<void>;
  /** Whether reminders are switched on for this phone. */
  isEnabled(): Promise<boolean>;
  /** Forgets the on/off choice, for when someone signs out. */
  forgetEnabled(): Promise<void>;
  /** Runs once before scheduling, such as setting up an Android channel. */
  prepare?(): Promise<void>;
}

/**
 * scheduled: the phone now has exactly this plan.
 * unchanged: it already had this plan, so nothing was touched.
 * stopped: a cancel, or the caller, called it off before it finished.
 */
export type SyncOutcome = 'scheduled' | 'unchanged' | 'stopped';

export function createReminderSync(store: ReminderStore) {
  /** Goes up with every cancel; a schedule started before it must stop. */
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  async function removeAll(): Promise<void> {
    const ids = await store.scheduledIds();
    await Promise.all(ids.map((id) => store.cancel(id)));
  }

  /**
   * Replaces this phone's reminders with the planned ones, unless the phone
   * already has exactly this plan. `stillWanted` lets the caller drop a
   * schedule it no longer needs, such as when the screen goes away or a newer
   * plan arrives.
   */
  function sync(planned: PlannedReminder[], signature: string, stillWanted: () => boolean = () => true): Promise<SyncOutcome> {
    const startedIn = generation;
    const current = () => startedIn === generation && stillWanted();
    return enqueue(async (): Promise<SyncOutcome> => {
      if (!current() || !(await store.isEnabled())) return 'stopped';
      const [saved, ids] = await Promise.all([store.readSignature(), store.scheduledIds()]);
      if (!current()) return 'stopped';
      if (saved === signature && ids.length === planned.length) return 'unchanged';

      // Until the whole plan is on the phone, no saved signature can claim it is.
      await store.writeSignature(null);
      await store.prepare?.();
      await Promise.all(ids.map((id) => store.cancel(id)));
      for (const reminder of planned) {
        if (!current()) return 'stopped';
        await store.schedule(reminder);
      }
      if (!current()) return 'stopped';
      await store.writeSignature(signature);
      return 'scheduled';
    });
  }

  /**
   * Removes every reminder this app scheduled. Any schedule still running
   * stops at its next step, and this runs straight after it, so nothing it
   * added survives. Schedules that were waiting their turn don't run at all.
   */
  function cancel(options: { forget?: boolean } = {}): Promise<void> {
    generation += 1;
    return enqueue(async () => {
      try {
        await removeAll();
        await store.writeSignature(null);
      } finally {
        if (options.forget) await store.forgetEnabled();
      }
    });
  }

  return { sync, cancel };
}

export type ReminderSync = ReturnType<typeof createReminderSync>;
