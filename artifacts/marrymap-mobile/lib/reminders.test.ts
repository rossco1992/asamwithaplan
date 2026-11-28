import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, planSignature, remindableCount } from './reminders';
import type { Journey, JourneyNode } from './journey';

function node(id: number, title: string, dueDate: string | null, extra: Partial<JourneyNode> = {}): JourneyNode {
  return {
    id,
    templateKey: null,
    title,
    notes: null,
    isCustom: false,
    schedule: dueDate ? 'relative' : 'relative',
    offsetWeeks: null,
    dueDate,
    phase: 'six-to-nine',
    status: 'todo',
    state: 'upcoming',
    isCurrent: false,
    tasks: [],
    tasksDone: 0,
    ...extra,
  };
}

function journey(nodes: JourneyNode[], weddingDate: string | null = '2027-09-18'): Journey {
  return {
    weddingDate,
    today: '2027-03-01',
    daysToGo: 200,
    progress: { done: 0, total: nodes.length, percent: 0 },
    currentMilestoneId: null,
    nodes,
    phases: [],
  };
}

// 8 AM on 1 March 2027, phone time.
const now = new Date(2027, 2, 1, 8, 0, 0);

test('plans a reminder a week before and on the day, at 9 AM local time', () => {
  const planned = planReminders(journey([node(1, 'Book the venue', '2027-03-20')]), { now });
  assert.equal(planned.length, 2);
  const [weekBefore, dueDay] = planned;
  assert.equal(weekBefore.kind, 'week-before');
  assert.equal(weekBefore.day, '2027-03-13');
  assert.equal(weekBefore.fireAt.getHours(), 9);
  assert.equal(weekBefore.fireAt.getDate(), 13);
  assert.equal(weekBefore.title, 'Coming up: Book the venue');
  assert.equal(weekBefore.body, 'Due Saturday, Mar 20.');
  assert.equal(weekBefore.milestoneId, 1);
  assert.equal(dueDay.kind, 'due-day');
  assert.equal(dueDay.day, '2027-03-20');
  assert.equal(dueDay.title, 'Due today: Book the venue');
});

test('skips done, skipped and undated milestones', () => {
  const planned = planReminders(
    journey([
      node(1, 'Done one', '2027-04-01', { status: 'done', state: 'done' }),
      node(2, 'Skipped one', '2027-04-01', { status: 'skipped', state: 'skipped' }),
      node(3, 'No date yet', null),
    ]),
    { now },
  );
  assert.deepEqual(planned, []);
});

test('drops reminders that would already have fired', () => {
  // Due in 3 days: the week-before reminder is in the past, the due-day one is not.
  const planned = planReminders(journey([node(1, 'Taste cakes', '2027-03-04')]), { now });
  assert.deepEqual(planned.map((reminder) => reminder.kind), ['due-day']);

  // Due today, after 9 AM: nothing left to send.
  const late = new Date(2027, 2, 4, 10, 0, 0);
  assert.deepEqual(planReminders(journey([node(1, 'Taste cakes', '2027-03-04')]), { now: late }), []);

  // Due today, before 9 AM: today's reminder still goes.
  const early = new Date(2027, 2, 4, 7, 0, 0);
  assert.equal(planReminders(journey([node(1, 'Taste cakes', '2027-03-04')]), { now: early }).length, 1);
});

test('milestones due the same day share one reminder', () => {
  const planned = planReminders(
    journey([
      node(5, 'Send save-the-dates', '2027-05-01'),
      node(2, 'Book the photographer', '2027-05-01'),
      node(9, 'Order the cake', '2027-05-01'),
    ]),
    { now },
  );
  assert.equal(planned.length, 2);
  assert.equal(planned[1].title, '3 milestones due today');
  assert.equal(planned[1].body, 'Book the photographer and 2 more.');
  assert.equal(planned[1].milestoneId, null);
  assert.deepEqual(planned[1].milestoneIds, [2, 5, 9]);

  const two = planReminders(journey([node(1, 'A', '2027-05-01'), node(2, 'B', '2027-05-01')]), { now });
  assert.equal(two[0].title, '2 milestones due next week');
  assert.equal(two[0].body, 'A and B, all due Saturday, May 1.');
});

test('mentions open tasks on a single milestone', () => {
  const planned = planReminders(
    journey([
      node(1, 'Book the venue', '2027-03-20', {
        tasks: [
          { id: 1, title: 'Tour', done: true },
          { id: 2, title: 'Sign', done: false },
          { id: 3, title: 'Pay deposit', done: false },
        ],
      }),
    ]),
    { now },
  );
  assert.equal(planned[0].body, 'Due Saturday, Mar 20. 2 tasks left.');
  assert.equal(planned[1].body, "It's on your journey for today. 2 tasks left.");
});

test('keeps only the soonest reminders, in order', () => {
  const nodes = Array.from({ length: 40 }, (_, i) => {
    const day = new Date(2027, 3, 1 + i * 2, 12);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return node(i + 1, `Milestone ${i + 1}`, iso);
  });
  const planned = planReminders(journey(nodes), { now, limit: 10 });
  assert.equal(planned.length, 10);
  for (let i = 1; i < planned.length; i += 1) {
    assert.ok(planned[i].fireAt.getTime() >= planned[i - 1].fireAt.getTime());
  }
  assert.equal(planned[0].milestoneId, 1);
});

test('the signature changes only when the plan does', () => {
  const base = journey([node(1, 'Book the venue', '2027-03-20')]);
  const a = planSignature(planReminders(base, { now }));
  const b = planSignature(planReminders(base, { now: new Date(2027, 2, 1, 8, 30) }));
  assert.equal(a, b);

  const moved = journey([node(1, 'Book the venue', '2027-03-27')]);
  assert.notEqual(a, planSignature(planReminders(moved, { now })));

  const renamed = journey([node(1, 'Book the barn', '2027-03-20')]);
  assert.notEqual(a, planSignature(planReminders(renamed, { now })));
});

test('a couple with no date still gets reminders for milestones with their own date', () => {
  const j = journey([node(1, 'Engagement party', '2027-04-10', { schedule: 'fixed', isCustom: true }), node(2, 'Book venue', null)], null);
  assert.equal(remindableCount(j), 1);
  assert.equal(planReminders(j, { now }).length, 2);
});

test('the signature changes when a time zone change moves the fire times', () => {
  const saved = process.env.TZ;
  try {
    const plan = journey([node(1, 'Book the venue', '2027-03-20')]);
    process.env.TZ = 'America/New_York';
    const inNewYork = planReminders(plan, { now: new Date(Date.UTC(2027, 2, 1, 12)) });
    process.env.TZ = 'America/Los_Angeles';
    const inLosAngeles = planReminders(plan, { now: new Date(Date.UTC(2027, 2, 1, 12)) });

    // Same reminders on the same days, but 9 AM is a different instant.
    assert.deepEqual(inLosAngeles.map((r) => r.key), inNewYork.map((r) => r.key));
    assert.notEqual(inLosAngeles[0].fireAt.getTime(), inNewYork[0].fireAt.getTime());
    assert.notEqual(planSignature(inLosAngeles), planSignature(inNewYork));
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});
