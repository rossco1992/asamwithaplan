import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReminderSync, type ReminderStore } from './reminderSync';
import type { PlannedReminder } from './reminders';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

/** A phone whose every call takes a moment, like the real one. */
function fakePhone() {
  const scheduled = new Map<string, PlannedReminder>();
  let signature: string | null = null;
  let enabled = true;
  let nextId = 1;
  const store: ReminderStore = {
    scheduledIds: async () => {
      await tick();
      return [...scheduled.keys()];
    },
    cancel: async (id) => {
      await tick();
      scheduled.delete(id);
    },
    schedule: async (reminder) => {
      await tick();
      scheduled.set(String(nextId++), reminder);
    },
    readSignature: async () => signature,
    writeSignature: async (value) => {
      signature = value;
    },
    isEnabled: async () => enabled,
    forgetEnabled: async () => {
      enabled = false;
    },
  };
  return {
    store,
    scheduled,
    get signature() {
      return signature;
    },
    get enabled() {
      return enabled;
    },
  };
}

function reminders(count: number, label = 'r'): PlannedReminder[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `${label}${i}`,
    kind: 'due-day' as const,
    day: '2027-05-01',
    fireAt: new Date(2027, 4, 1, 9, i),
    title: `${label} ${i}`,
    body: '',
    milestoneId: i + 1,
    milestoneIds: [i + 1],
  }));
}

test('schedules the plan once and leaves it alone when nothing changed', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  assert.equal(await sync.sync(reminders(3), 'sig-a'), 'scheduled');
  assert.equal(phone.scheduled.size, 3);
  assert.equal(phone.signature, 'sig-a');
  assert.equal(await sync.sync(reminders(3), 'sig-a'), 'unchanged');
  assert.equal(await sync.sync(reminders(2), 'sig-b'), 'scheduled');
  assert.equal(phone.scheduled.size, 2);
});

test('a cancel during scheduling leaves no reminders behind', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  const running = sync.sync(reminders(20), 'sig-a');
  // Let it get part of the way through, then switch reminders off.
  while (phone.scheduled.size < 3) await tick();
  const cancelled = sync.cancel();
  assert.equal(await running, 'stopped');
  await cancelled;
  assert.equal(phone.scheduled.size, 0);
  assert.equal(phone.signature, null);
});

test('schedules waiting their turn never run after a cancel', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  const first = sync.sync(reminders(5, 'a'), 'sig-a');
  const queued = sync.sync(reminders(5, 'b'), 'sig-b');
  const cancelled = sync.cancel();
  assert.equal(await first, 'stopped');
  assert.equal(await queued, 'stopped');
  await cancelled;
  assert.equal(phone.scheduled.size, 0);
});

test('sign-out forgets the choice, so a later reload schedules nothing', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  await sync.sync(reminders(4), 'sig-a');
  await sync.cancel({ forget: true });
  assert.equal(phone.enabled, false);
  // The journey reloads once more before the screen goes away.
  assert.equal(await sync.sync(reminders(4), 'sig-a'), 'stopped');
  assert.equal(phone.scheduled.size, 0);
});

test('a run the caller no longer wants stops, and the next one finishes the job', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  let live = true;
  const old = sync.sync(reminders(10, 'old'), 'sig-old', () => live);
  while (phone.scheduled.size < 2) await tick();
  live = false;
  const fresh = sync.sync(reminders(3, 'new'), 'sig-new');
  assert.equal(await old, 'stopped');
  assert.equal(await fresh, 'scheduled');
  assert.deepEqual([...phone.scheduled.values()].map((r) => r.key), ['new0', 'new1', 'new2']);
  assert.equal(phone.signature, 'sig-new');
});

test('turning reminders back on after a cancel works again', async () => {
  const phone = fakePhone();
  const sync = createReminderSync(phone.store);
  await sync.sync(reminders(2), 'sig-a');
  await sync.cancel();
  assert.equal(await sync.sync(reminders(2), 'sig-a'), 'scheduled');
  assert.equal(phone.scheduled.size, 2);
});
