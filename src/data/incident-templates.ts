import type { IncidentCategory, Impact, Urgency } from "@/app/generated/prisma/enums";

// The "incoming tickets" content bank — what makes /generate-tickets (see
// src/actions/generate-tickets.ts) actually useful: without a steady
// supply of realistic new problems, an agent's queue empties out after a
// few practice sessions and the app stops feeling like an ongoing job.
// This plays the same role for the real Incident Management queue that
// src/data/training-scenarios.ts plays for the Training Simulator — a
// content bank kept separate from the schema, easy to extend without a
// migration.
//
// Unlike training scenarios (a scripted call with a right/wrong
// diagnostic answer), these become real Incident rows an agent actually
// works through the full lifecycle — take, escalate, resolve, close —
// so they're written as a ticket description would actually read, not
// as a transcript.

export type IncidentTemplate = {
  title: string;
  description: string;
  category: IncidentCategory;
  impact: Impact;
  urgency: Urgency;
};

export const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  {
    title: "Can't send emails with attachments over 10MB",
    description: "Every email with a large attachment bounces back with a size-limit error. Need to send a client proposal with images today.",
    category: "SOFTWARE",
    impact: "LOW",
    urgency: "MEDIUM",
  },
  {
    title: "Second monitor not detected",
    description: "Plugged in my second monitor this morning like always and it's just not showing up in Display Settings. Cable seems fine.",
    category: "HARDWARE",
    impact: "LOW",
    urgency: "LOW",
  },
  {
    title: "Can't connect to the office VPN from home",
    description: "VPN client just spins on 'Connecting...' forever and then times out. Was working fine yesterday.",
    category: "NETWORK",
    impact: "MEDIUM",
    urgency: "HIGH",
  },
  {
    title: "Shared calendar not syncing across the team",
    description: "Events I create on the team calendar aren't showing up for anyone else, and theirs aren't showing up for me either. Started sometime this week.",
    category: "SOFTWARE",
    impact: "MEDIUM",
    urgency: "MEDIUM",
  },
  {
    title: "New laptop needs setup before Monday",
    description: "Starting a new role Monday and my replacement laptop hasn't been set up with any of the standard software yet.",
    category: "HARDWARE",
    impact: "LOW",
    urgency: "HIGH",
  },
  {
    title: "Can't submit expense reports — form errors out",
    description: "The expense system gives a generic error every time I hit submit, no matter what I put in the form. Deadline for reimbursement is Friday.",
    category: "SOFTWARE",
    impact: "MEDIUM",
    urgency: "MEDIUM",
  },
  {
    title: "Entire department can't reach the CRM",
    description: "Nobody on my team can log into the CRM this morning — same 'service unavailable' error for all six of us.",
    category: "NETWORK",
    impact: "HIGH",
    urgency: "HIGH",
  },
  {
    title: "Wrong name showing on my email signature",
    description: "My email signature auto-generated with my old name after I got married and updated my HR record. Not urgent, just annoying on client emails.",
    category: "ACCOUNT",
    impact: "LOW",
    urgency: "LOW",
  },
  {
    title: "Conference room screen won't show laptop input",
    description: "Trying to present in the big conference room and the screen just says 'No Signal' no matter which cable I try. Client call in 20 minutes.",
    category: "HARDWARE",
    impact: "MEDIUM",
    urgency: "HIGH",
  },
  {
    title: "Can't install approved software — 'administrator rights required'",
    description: "Trying to install the design software IT approved last week and it's asking for admin rights I don't have.",
    category: "ACCESS",
    impact: "LOW",
    urgency: "MEDIUM",
  },
  {
    title: "Whole building's Wi-Fi keeps dropping every ~15 minutes",
    description: "Wi-Fi cuts out for a few seconds every 15 minutes or so, all day, affecting everyone on the floor. Video calls keep glitching.",
    category: "NETWORK",
    impact: "HIGH",
    urgency: "MEDIUM",
  },
  {
    title: "Can't reset my own password — reset email never arrives",
    description: "Clicked 'forgot password' three times now and the reset email never shows up, checked spam too.",
    category: "ACCOUNT",
    impact: "LOW",
    urgency: "MEDIUM",
  },
  {
    title: "Printer producing pages with a diagonal streak",
    description: "Everything printed from the 2nd floor printer has a faint diagonal ink streak across every page for the last two days.",
    category: "HARDWARE",
    impact: "LOW",
    urgency: "LOW",
  },
  {
    title: "Payroll system down right before the pay run",
    description: "The payroll processing system is throwing a database error and payroll is supposed to run in two hours.",
    category: "SOFTWARE",
    impact: "HIGH",
    urgency: "HIGH",
  },
  {
    title: "Need access to the marketing asset library",
    description: "Started on the marketing team last week and still don't have access to the shared asset library everyone else uses daily.",
    category: "ACCESS",
    impact: "LOW",
    urgency: "MEDIUM",
  },
  {
    title: "Laptop fan running loud and constant",
    description: "Fan's been running at full speed non-stop for two days now even when I'm not doing anything demanding. Getting pretty hot underneath too.",
    category: "HARDWARE",
    impact: "LOW",
    urgency: "LOW",
  },
  {
    title: "Video calls freezing for everyone on our floor",
    description: "Every video call on our floor has been freezing and dropping for the last hour, not just mine — heard the same from three other people.",
    category: "NETWORK",
    impact: "HIGH",
    urgency: "HIGH",
  },
  {
    title: "Old contractor's account still shows as active",
    description: "Noticed a contractor who left the company two months ago still shows up as an active user in the system directory. Flagging in case that's a problem.",
    category: "ACCOUNT",
    impact: "MEDIUM",
    urgency: "LOW",
  },
];
