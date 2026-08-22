import type { IncidentCategory, TrainingDifficulty } from "@/app/generated/prisma/enums";

export const TRAINING_DIFFICULTY_LABELS: Record<TrainingDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

// Content for the Training Simulator (see prisma/schema.prisma for why
// this is a separate subsystem from real Incidents). Kept as plain data,
// not database rows, for the same reason src/types/itil.ts keeps ITIL
// policy out of the schema: this is "what a scenario says", not "how a
// scenario is stored" — easy to read, easy to add to, no migration
// needed to write a new call.
//
// Every scenario's `question` is deliberately about the FIRST step, not
// "what's broken" — the skill being taught is triage process, and the
// wrong choices are written to be plausible mistakes a real trainee would
// actually make (jumping to a disruptive fix, skipping identity
// verification, escalating too early, treating a mass outage as one
// ticket), not obviously-silly distractors.

export type TrainingScenarioSeed = {
  title: string;
  category: IncidentCategory;
  difficulty: TrainingDifficulty;
  callerOpening: string;
  callerFollowUp: string;
  question: string;
  choices: { text: string; isCorrect: boolean; explanation: string }[];
  resolutionSteps: string;
};

export const TRAINING_SCENARIOS: TrainingScenarioSeed[] = [
  {
    title: "Laptop won't join the office Wi-Fi",
    category: "NETWORK",
    difficulty: "BEGINNER",
    callerOpening:
      "Hi, thanks for picking up — my laptop won't connect to the office Wi-Fi. I've restarted it twice already.",
    callerFollowUp:
      "Actually, now that you mention it — my phone connects to the same Wi-Fi just fine. It's only my laptop.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check whether Wi-Fi is enabled on the laptop and airplane mode is off.",
        isCorrect: true,
        explanation:
          "Correct — since the phone connects fine, the network itself is up and the problem is isolated to this one device. The cheapest, most basic check (is the radio even on?) comes before anything more invasive.",
      },
      {
        text: "Replace the laptop's Wi-Fi adapter.",
        isCorrect: false,
        explanation:
          "Way too fast to hardware replacement. Nothing so far rules out a simple settings issue — jumping straight to a parts swap skips the cheap checks that would catch the actual cause in seconds.",
      },
      {
        text: "Escalate to L3 network engineering immediately.",
        isCorrect: false,
        explanation:
          "This is a single device failing to connect while everything else on the network works fine — that's squarely an L1 issue, not something that needs specialist network engineering.",
      },
      {
        text: "Ask the caller to reboot the office Wi-Fi router.",
        isCorrect: false,
        explanation:
          "The caller's own phone is connecting fine on the same network, which already rules out the router. Rebooting shared infrastructure to fix one person's device would disrupt everyone else for nothing.",
      },
    ],
    resolutionSteps:
      "The Wi-Fi radio had been toggled off on the laptop after a Windows update reset some settings. Re-enabled it in Network Settings — the laptop reconnected immediately. No further action needed.",
  },
  {
    title: "Expense app crashes on open",
    category: "SOFTWARE",
    difficulty: "BEGINNER",
    callerOpening:
      "Every time I open the expense reporting app it crashes after a few seconds. I have a report due today.",
    callerFollowUp:
      "I did restart my computer already this morning, and it still crashes every time.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check whether other users are reporting the same crash before troubleshooting this one machine.",
        isCorrect: true,
        explanation:
          "Correct — if this is a known issue already affecting multiple people (a bad app update, for example), fixing it on this one laptop would be wasted effort, and the caller needs to know a fix is already in progress.",
      },
      {
        text: "Reinstall the application immediately.",
        isCorrect: false,
        explanation:
          "Premature. If this turns out to be a broader outage affecting everyone (which it is), reinstalling on this one machine wouldn't fix anything and burns time the caller doesn't have before their deadline.",
      },
      {
        text: "Tell the caller to just use a different app for now.",
        isCorrect: false,
        explanation:
          "This sidesteps the actual problem instead of diagnosing it, and doesn't get the caller their real report submitted through the system it's supposed to go through.",
      },
      {
        text: "Tell the caller to submit their report late.",
        isCorrect: false,
        explanation:
          "Not a diagnostic step at all — and deciding a deadline can slip isn't something IT support has the authority to promise on someone else's behalf.",
      },
    ],
    resolutionSteps:
      "Confirmed via the team channel that a vendor update pushed overnight had broken the app for every user, not just this one. The vendor released a hotfix within the hour; had the caller apply it, and the app opened normally afterward.",
  },
  {
    title: "3rd floor printer stuck offline",
    category: "HARDWARE",
    difficulty: "BEGINNER",
    callerOpening:
      "The printer on the 3rd floor keeps saying 'offline' and nothing I send to it is printing.",
    callerFollowUp:
      "It was working yesterday. Nobody moved it or unplugged anything that I know of.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check the printer's physical status lights and network connection.",
        isCorrect: true,
        explanation:
          "Correct — 'offline' from the computer's point of view usually means the printer itself lost its connection. Checking the printer's own status is faster than touching driver settings on a machine that might not be the problem at all.",
      },
      {
        text: "Delete and reinstall the printer driver on the caller's PC.",
        isCorrect: false,
        explanation:
          "This assumes the problem is on the caller's computer, but the printer showing 'offline' is more consistent with the printer itself having lost its connection — worth ruling out first.",
      },
      {
        text: "Order a replacement printer.",
        isCorrect: false,
        explanation:
          "Hugely premature — nothing so far suggests the printer is actually broken, only that it's not reachable right now.",
      },
      {
        text: "Have the caller restart their computer.",
        isCorrect: false,
        explanation:
          "A computer restart wouldn't bring a printer's own network connection back if the printer itself dropped offline — this targets the wrong device.",
      },
    ],
    resolutionSteps:
      "The printer's Ethernet cable had come loose from the wall jack — likely knocked during cleaning. Reseated the cable, the printer came back online within a minute, and the queued print job went through automatically.",
  },
  {
    title: "Suddenly locked out of the team share",
    category: "ACCESS",
    difficulty: "INTERMEDIATE",
    callerOpening:
      "I can't open the team share anymore — it says access denied. I was in it just yesterday.",
    callerFollowUp:
      "I haven't changed my password recently, and I can log into my computer and check my email just fine.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check whether the caller's account is still a member of the security group that grants access to that share.",
        isCorrect: true,
        explanation:
          "Correct — login and email working rules out a broken account or bad password. A sudden access-denied on one specific resource, with everything else working, points at a permissions/group-membership change, not an identity problem.",
      },
      {
        text: "Reset the caller's account password.",
        isCorrect: false,
        explanation:
          "The caller can already log in and use email fine, so the password isn't broken — resetting it doesn't touch the actual cause and just adds friction for no benefit.",
      },
      {
        text: "Rebuild the file server from backup.",
        isCorrect: false,
        explanation:
          "Wildly disproportionate for one person losing access to one share. Nothing here suggests the server or the data is actually damaged.",
      },
      {
        text: "Tell the caller to have a coworker email them the files instead.",
        isCorrect: false,
        explanation:
          "A workaround, not a fix — it doesn't restore the caller's actual access, and the same problem will still be there the next time they need the share.",
      },
    ],
    resolutionSteps:
      "The caller had been removed from the 'Team-Share-ReadWrite' security group during a routine access review the day before. Re-added them to the correct group; access was restored automatically after their next sign-in.",
  },
  {
    title: "Locked out after too many failed logins",
    category: "ACCOUNT",
    difficulty: "BEGINNER",
    callerOpening:
      "I got locked out after too many wrong password attempts and I really need to get into my email.",
    callerFollowUp:
      "Yeah, I probably mistyped it a few times — I just switched to a new keyboard layout this week.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Verify the caller's identity through the standard verification process before resetting anything.",
        isCorrect: true,
        explanation:
          "Correct — a caller asking for an account unlock or password reset is exactly the scenario social engineering attacks target. Verifying identity first isn't extra caution, it's the actual first step of a real account-recovery process, every time, no exceptions for a caller who \"sounds\" legitimate.",
      },
      {
        text: "Reset the password immediately since they already gave you their username.",
        isCorrect: false,
        explanation:
          "Knowing a username proves nothing — usernames aren't secret. Skipping identity verification here is exactly the mistake that makes account takeover attacks work.",
      },
      {
        text: "Tell them to wait 24 hours for the lockout to expire automatically.",
        isCorrect: false,
        explanation:
          "Unnecessarily unhelpful — unlocking an account (once identity is verified) is routine, well within L1 scope, and there's no reason to make a legitimate caller wait a full day.",
      },
      {
        text: "Escalate to L3 as a security incident.",
        isCorrect: false,
        explanation:
          "A routine lockout from mistyped passwords doesn't need specialist escalation — that's reserved for genuinely suspicious activity, not an everyday identity-verified unlock.",
      },
    ],
    resolutionSteps:
      "Verified the caller's identity through the standard callback/verification procedure. Unlocked the account and had them reset their password through the self-service portal, and suggested enabling the keyboard-layout indicator in the taskbar to avoid repeat typos.",
  },
  {
    title: "Whole floor's internet crawling",
    category: "NETWORK",
    difficulty: "ADVANCED",
    callerOpening:
      "Our whole team's internet has been crawling for the last hour. Video calls keep freezing.",
    callerFollowUp:
      "It's not just me — everyone on our floor is having the same problem, and it started right around 2pm.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check whether this is already a known, reported outage affecting that floor before treating it as a brand-new ticket.",
        isCorrect: true,
        explanation:
          "Correct — the caller has already confirmed this is affecting their whole floor, not just them. A confirmed mass-impact issue needs a mass diagnostic step (is this already being worked?), not the same individual troubleshooting used for a single user.",
      },
      {
        text: "Have every affected person restart their computer individually.",
        isCorrect: false,
        explanation:
          "Wildly inefficient once impact is already confirmed as multi-user — a shared-infrastructure problem won't be fixed by restarting individual laptops one at a time.",
      },
      {
        text: "Immediately reset the department's core network switch without checking anything else first.",
        isCorrect: false,
        explanation:
          "A switch reset would drop connectivity for everyone on that floor — a disruptive action that shouldn't happen before confirming the switch is actually the point of failure.",
      },
      {
        text: "Tell the caller it's probably just their internet provider and there's nothing IT can do.",
        isCorrect: false,
        explanation:
          "This dismisses a confirmed, business-impacting, internal issue without any investigation — exactly the kind of ticket a real service desk is expected to actually own.",
      },
    ],
    resolutionSteps:
      "Monitoring showed a core switch on that floor dropping packets after an automatic firmware update. Rolled the firmware back; connectivity returned to normal for everyone within about 10 minutes. Logged as a Problem afterward, to review why that switch was allowed to auto-update during business hours — a root-cause question, not just a one-off fix.",
  },
];
