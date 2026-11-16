/**
 * The starter journey every couple gets. Each milestone is scheduled by how
 * many weeks before the wedding it should be done, so the whole map moves
 * when the date moves. Couples can skip any of these and add their own.
 *
 * Keys are stable identifiers stored on each wedding's milestone rows. Never
 * rename or reuse a key: a wedding that already has the row would get a
 * duplicate on the next seed.
 */

export interface MilestoneTemplate {
  key: string;
  title: string;
  offsetWeeks: number;
  tasks: string[];
}

export const MILESTONE_TEMPLATES: readonly MilestoneTemplate[] = [
  {
    key: "set-budget",
    title: "Set your budget",
    offsetWeeks: 56,
    tasks: [
      "Agree on a total you're both comfortable with",
      "Decide who is contributing and how much",
      "Pick your top three priorities",
    ],
  },
  {
    key: "draft-guest-list",
    title: "Draft the guest list",
    offsetWeeks: 54,
    tasks: [
      "List everyone you'd both like to invite",
      "Agree on a rough headcount",
      "Collect mailing addresses",
    ],
  },
  {
    key: "book-venue",
    title: "Book the venue",
    offsetWeeks: 50,
    tasks: [
      "Shortlist three venues",
      "Tour your favorites",
      "Review and sign the contract",
      "Pay the deposit",
    ],
  },
  {
    key: "book-photographer",
    title: "Book your photographer",
    offsetWeeks: 44,
    tasks: [
      "Compare portfolios and packages",
      "Meet your top two",
      "Sign the contract",
    ],
  },
  {
    key: "book-caterer",
    title: "Book the caterer",
    offsetWeeks: 40,
    tasks: [
      "Collect quotes",
      "Schedule a tasting",
      "Sign the contract",
    ],
  },
  {
    key: "book-officiant",
    title: "Book your officiant",
    offsetWeeks: 36,
    tasks: ["Choose your officiant", "Confirm the date and time"],
  },
  {
    key: "wedding-attire",
    title: "Choose your wedding attire",
    offsetWeeks: 36,
    tasks: [
      "Book fittings or appointments",
      "Order your attire",
      "Plan alterations",
    ],
  },
  {
    key: "room-block",
    title: "Reserve a hotel room block",
    offsetWeeks: 34,
    tasks: [
      "Compare two or three nearby hotels",
      "Reserve the block",
      "Note the booking deadline for guests",
    ],
  },
  {
    key: "save-the-dates",
    title: "Send save-the-dates",
    offsetWeeks: 32,
    tasks: ["Finalize the guest list", "Design and order", "Send them out"],
  },
  {
    key: "book-music",
    title: "Book music",
    offsetWeeks: 30,
    tasks: ["Choose a band or DJ", "Sign the contract"],
  },
  {
    key: "book-florist",
    title: "Book the florist",
    offsetWeeks: 26,
    tasks: ["Gather inspiration", "Collect quotes", "Sign the contract"],
  },
  {
    key: "order-invitations",
    title: "Order invitations",
    offsetWeeks: 16,
    tasks: [
      "Settle the wording",
      "Choose paper, digital or both",
      "Place the order",
    ],
  },
  {
    key: "send-invitations",
    title: "Send invitations",
    offsetWeeks: 8,
    tasks: ["Address and send", "Set an RSVP deadline"],
  },
  {
    key: "marriage-license",
    title: "Get your marriage license",
    offsetWeeks: 4,
    tasks: [
      "Check your county's requirements",
      "Book an appointment",
      "Bring IDs and pick it up",
    ],
  },
  {
    key: "final-headcount",
    title: "Confirm the final headcount",
    offsetWeeks: 3,
    tasks: ["Chase missing RSVPs", "Send the count to the caterer"],
  },
  {
    key: "seating-plan",
    title: "Finish the seating plan",
    offsetWeeks: 2,
    tasks: ["Draft the tables", "Share it with the venue"],
  },
  {
    key: "confirm-vendors",
    title: "Confirm every vendor",
    offsetWeeks: 1,
    tasks: [
      "Confirm arrival times",
      "Settle final payments",
      "Share contact numbers",
    ],
  },
  {
    key: "day-of-timeline",
    title: "Share the day-of timeline",
    offsetWeeks: 1,
    tasks: ["Write the run of show", "Send it to the wedding party"],
  },
];
