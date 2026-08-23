// A small pool of fictional employees across different departments —
// what "who reported this?" looks like on generated tickets, so a
// practice queue reads like it belongs to one company with many
// different people, not the same one customer submitting everything.
//
// These are real User rows (see prisma/seed.ts) with a real password
// hash, but nobody's meant to log into them — they're not marked
// `isDemoAccount`, so they never show up in the login page's quick
// sign-in list, and their distinct email domain (@acmeco.example) is
// what src/actions/generate-tickets.ts uses to find exactly this pool
// and nothing else (never a real self-registered customer's account).
export type NpcEmployee = { name: string; email: string; department: string };

export const NPC_EMPLOYEES: NpcEmployee[] = [
  { name: "Taylor Brooks", email: "taylor.brooks@acmeco.example", department: "Marketing" },
  { name: "Jamie Chen", email: "jamie.chen@acmeco.example", department: "Sales" },
  { name: "Riley Ortiz", email: "riley.ortiz@acmeco.example", department: "Finance" },
  { name: "Devon Walsh", email: "devon.walsh@acmeco.example", department: "Engineering" },
  { name: "Harper Nguyen", email: "harper.nguyen@acmeco.example", department: "HR" },
  { name: "Quinn Alvarez", email: "quinn.alvarez@acmeco.example", department: "Operations" },
];
