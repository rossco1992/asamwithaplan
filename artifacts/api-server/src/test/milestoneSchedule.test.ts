import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildJourney,
  daysBetween,
  dueDateFor,
  isIsoDate,
  phaseForWeeksBefore,
  previewDateChange,
  type MilestoneInput,
} from "../lib/milestoneSchedule";
import { MILESTONE_TEMPLATES } from "../lib/milestoneTemplates";

function relative(
  id: number,
  offsetWeeks: number,
  overrides: Partial<MilestoneInput> = {},
): MilestoneInput {
  return {
    id,
    templateKey: `template-${id}`,
    title: `Milestone ${id}`,
    notes: null,
    isCustom: false,
    schedule: "relative",
    offsetWeeks,
    fixedDate: null,
    status: "todo",
    tasks: [],
    ...overrides,
  };
}

function fixed(
  id: number,
  fixedDate: string,
  overrides: Partial<MilestoneInput> = {},
): MilestoneInput {
  return {
    ...relative(id, 0),
    templateKey: null,
    isCustom: true,
    schedule: "fixed",
    offsetWeeks: null,
    fixedDate,
    ...overrides,
  };
}

describe("milestone scheduling", () => {
  test("validates real calendar dates only", () => {
    assert.equal(isIsoDate("2027-06-12"), true);
    assert.equal(isIsoDate("2028-02-29"), true);
    assert.equal(isIsoDate("2027-02-29"), false);
    assert.equal(isIsoDate("2027-6-12"), false);
    assert.equal(isIsoDate("not a date"), false);
  });

  test("counts back from the wedding date in whole weeks", () => {
    assert.equal(dueDateFor("2027-06-12", 1), "2027-06-05");
    assert.equal(dueDateFor("2027-06-12", 0), "2027-06-12");
    assert.equal(dueDateFor("2027-06-12", -2), "2027-06-26");
    assert.equal(dueDateFor(null, 12), null);
    // Crossing a daylight-saving change does not shift the day.
    assert.equal(dueDateFor("2027-03-20", 2), "2027-03-06");
    assert.equal(daysBetween("2026-11-16", "2027-06-12"), 208);
  });

  test("groups weeks-before into the planning phases", () => {
    assert.equal(phaseForWeeksBefore(60).key, "twelve-plus");
    assert.equal(phaseForWeeksBefore(52).key, "twelve-plus");
    assert.equal(phaseForWeeksBefore(51).key, "nine-to-twelve");
    assert.equal(phaseForWeeksBefore(26).key, "six-to-nine");
    assert.equal(phaseForWeeksBefore(13).key, "three-to-six");
    assert.equal(phaseForWeeksBefore(8).key, "one-to-three");
    assert.equal(phaseForWeeksBefore(4).key, "final-month");
    assert.equal(phaseForWeeksBefore(1).key, "final-week");
    assert.equal(phaseForWeeksBefore(0).key, "final-week");
    assert.equal(phaseForWeeksBefore(-1).key, "after-wedding");
  });

  test("orders a dated journey and works out each stop's state", () => {
    const journey = buildJourney(
      [
        relative(3, 8),
        relative(1, 50, { status: "done" }),
        relative(2, 30),
        relative(4, 4, { status: "skipped" }),
        fixed(5, "2027-01-09"),
      ],
      "2027-06-12",
      "2026-11-16",
    );

    assert.deepEqual(
      journey.nodes.map((node) => node.id),
      [1, 2, 5, 3, 4],
    );
    assert.deepEqual(
      journey.nodes.map((node) => node.state),
      ["done", "overdue", "upcoming", "upcoming", "skipped"],
    );
    // The first unfinished stop is "you are here", even when it's overdue.
    assert.equal(journey.currentMilestoneId, 2);
    assert.equal(journey.nodes[1]!.isCurrent, true);
    assert.equal(journey.nodes[1]!.dueDate, "2026-11-14");
    assert.equal(journey.daysToGo, 208);
    // Skipped stops don't count toward progress.
    assert.deepEqual(journey.progress, { done: 1, total: 4, percent: 25 });
    assert.deepEqual(
      journey.phases.map((phase) => phase.key),
      ["nine-to-twelve", "six-to-nine", "three-to-six", "one-to-three", "final-month"],
    );
  });

  test("marks the current stop when nothing is overdue", () => {
    const journey = buildJourney(
      [relative(1, 20), relative(2, 10)],
      "2027-06-12",
      "2026-11-16",
    );
    assert.deepEqual(
      journey.nodes.map((node) => node.state),
      ["current", "upcoming"],
    );
  });

  test("plans by phase when the couple has no date yet", () => {
    const journey = buildJourney(
      [relative(1, 8), relative(2, 54), fixed(3, "2027-03-01"), relative(4, 1)],
      null,
      "2026-11-16",
    );

    assert.equal(journey.daysToGo, null);
    assert.equal(journey.weddingDate, null);
    assert.deepEqual(
      journey.nodes.map((node) => [node.id, node.dueDate, node.phase]),
      [
        [3, "2027-03-01", "pinned"],
        [2, null, "twelve-plus"],
        [1, null, "one-to-three"],
        [4, null, "final-week"],
      ],
    );
    // Undated stops are never overdue.
    assert.ok(journey.nodes.every((node) => node.state !== "overdue"));
    assert.deepEqual(
      journey.phases.map((phase) => phase.label),
      ["Your set dates", "12+ months", "1–3 months", "Final week"],
    );
  });

  test("places a fixed milestone after the wedding in its own phase", () => {
    const journey = buildJourney(
      [relative(1, 1), fixed(2, "2027-07-01")],
      "2027-06-12",
      "2026-11-16",
    );
    assert.equal(journey.nodes[1]!.phase, "after-wedding");
  });

  test("previews what a new wedding date moves", () => {
    const preview = previewDateChange(
      [
        relative(1, 50),
        relative(2, 30, { status: "skipped" }),
        relative(3, 4, { status: "done" }),
        fixed(4, "2027-05-01"),
        relative(5, 26),
      ],
      "2027-06-12",
      "2027-04-10",
      "2026-11-16",
    );

    assert.deepEqual(
      preview.moved.map((move) => [move.id, move.from, move.to]),
      [
        [1, "2026-06-27", "2026-04-25"],
        [3, "2027-05-15", "2027-03-13"],
        [5, "2026-12-12", "2026-10-10"],
      ],
    );
    assert.deepEqual(preview.fixedAfterWedding, [
      { id: 4, title: "Milestone 4", date: "2027-05-01" },
    ]);
    // Done items aren't flagged as overdue, only unfinished ones.
    assert.deepEqual(
      preview.nowOverdue.map((item) => item.id),
      [1, 5],
    );
  });

  test("ships sensible starter templates", () => {
    const keys = new Set(MILESTONE_TEMPLATES.map((template) => template.key));
    assert.equal(keys.size, MILESTONE_TEMPLATES.length);
    for (const template of MILESTONE_TEMPLATES) {
      assert.ok(template.offsetWeeks >= 0, template.key);
      assert.ok(template.tasks.length > 0, template.key);
      assert.ok(template.title.length <= 120, template.key);
    }
  });
});
