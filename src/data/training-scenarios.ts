import type { IncidentCategory, TrainingDifficulty, TrainingChannel } from "@/app/generated/prisma/enums";

export const TRAINING_DIFFICULTY_LABELS: Record<TrainingDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

// A real service desk doesn't only take phone calls, so neither does this.
// Icon plus a short label, used anywhere a scenario's channel needs to be
// shown at a glance (the scenario list, the transcript header).
export const TRAINING_CHANNEL_LABELS: Record<TrainingChannel, string> = {
  PHONE: "Phone",
  EMAIL: "Email",
  CHAT: "Chat",
};

export const TRAINING_CHANNEL_ICONS: Record<TrainingChannel, string> = {
  PHONE: "\u{1F4DE}",
  EMAIL: "\u{2709}\u{FE0F}",
  CHAT: "\u{1F4AC}",
};

// Content for the Training Simulator (see prisma/schema.prisma for why
// this is a separate subsystem from real Incidents). Kept as plain data,
// not database rows, for the same reason src/types/itil.ts keeps ITIL
// policy out of the schema: this is "what a scenario says", not "how a
// scenario is stored", easy to read, easy to add to, no migration needed
// to write a new call.
//
// Every scenario's `question` is deliberately about the FIRST step, not
// "what's broken", the skill being taught is triage process, and the
// wrong choices are written to be plausible mistakes a real trainee would
// actually make (jumping to a disruptive fix, skipping identity
// verification, escalating too early, treating a mass outage as one
// ticket), not obviously-silly distractors.

export type TrainingScenarioSeed = {
  title: string;
  category: IncidentCategory;
  difficulty: TrainingDifficulty;
  // Every scenario declares its channel explicitly, no default here even
  // though the schema has one, so a new scenario can't accidentally end
  // up PHONE by omission. See the schema comment on TrainingScenario for
  // why the DB-level default exists (it's there for the original
  // scenarios, written before this field did).
  channel: TrainingChannel;
  // Email subject line, or the chat's channel/thread name. Only makes
  // sense for EMAIL/CHAT, leave undefined for PHONE.
  channelSubject?: string;
  callerOpening: string;
  callerFollowUp: string;
  question: string;
  choices: { text: string; isCorrect: boolean; explanation: string }[];
  resolutionSteps: string;
  // A second question, asked after the reveal: not "what would you do"
  // but "how would you respond", phrased per-channel (explain it to the
  // caller, write the email reply, write the chat reply). Optional, and
  // graded by an LLM rather than matched against a fixed answer, since
  // judging a written response for clarity and tone isn't something a
  // fixed correct answer can capture. See WrittenResponse in schema.prisma.
  writtenPrompt?: string;
};

export const TRAINING_SCENARIOS: TrainingScenarioSeed[] = [
  {
    title: "Laptop won't join the office Wi-Fi",
    category: "NETWORK",
    difficulty: "BEGINNER",
    channel: "PHONE",
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
    writtenPrompt:
      "Write what you'd tell the caller once it's fixed. Keep it short, plain, and clear about what actually happened.",
  },
  {
    title: "Expense app crashes on open",
    category: "SOFTWARE",
    difficulty: "BEGINNER",
    channel: "PHONE",
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
    writtenPrompt:
      "Write what you'd tell the caller right after you confirm it's a known, wider outage, not just their machine. They have a deadline today, so say what they should expect and by when.",
  },
  {
    title: "3rd floor printer stuck offline",
    category: "HARDWARE",
    difficulty: "BEGINNER",
    channel: "PHONE",
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
    writtenPrompt:
      "Write what you'd tell the caller once it's fixed, including what actually caused it in plain language.",
  },
  {
    title: "Suddenly locked out of the team share",
    category: "ACCESS",
    difficulty: "INTERMEDIATE",
    channel: "PHONE",
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
    writtenPrompt:
      "Write what you'd tell the caller once access is restored, explaining why it happened without making a routine access review sound alarming.",
  },
  {
    title: "Locked out after too many failed logins",
    category: "ACCOUNT",
    difficulty: "BEGINNER",
    channel: "PHONE",
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
    writtenPrompt:
      "Write what you'd say to the caller to explain that you need to verify their identity before unlocking anything, without making it sound like you suspect them of anything.",
  },
  {
    title: "Whole floor's internet crawling",
    category: "NETWORK",
    difficulty: "ADVANCED",
    channel: "PHONE",
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
    writtenPrompt:
      "Write a short message you'd send to the whole floor once it's fixed, explaining what happened and reassuring them it's resolved.",
  },
  {
    title: "Spreadsheet won't open, says it's corrupted",
    category: "SOFTWARE",
    difficulty: "INTERMEDIATE",
    channel: "PHONE",
    callerOpening:
      "I've got a quarterly report spreadsheet that won't open anymore — it says the file is corrupted. This has months of work in it.",
    callerFollowUp:
      "I emailed a copy to my personal email yesterday to work on it at home, and that copy opens fine on my laptop at home. It's just this copy on my work PC that's broken.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Try opening the working copy from the personal-email version on the work PC, to isolate whether the file or the machine is the problem.",
        isCorrect: true,
        explanation:
          "Correct — a known-good copy of the same file already exists. Testing it on the suspect machine is the fastest way to find out whether the *file* is actually corrupted or whether something on *this PC* (a broken Office install, a bad sync, a full disk) is the real cause — and it doesn't touch or risk the only copy that might still be broken.",
      },
      {
        text: "Tell the caller the file is lost and they'll need to recreate it from scratch.",
        isCorrect: false,
        explanation:
          "Way too fast to give up — a working copy of the same file exists elsewhere, which hasn't even been checked yet. Declaring months of work unrecoverable before actually investigating is a serious premature conclusion.",
      },
      {
        text: "Immediately reinstall Office on the caller's PC.",
        isCorrect: false,
        explanation:
          "A big, disruptive action taken before confirming Office is even the problem — the working copy from home hasn't been used yet to check whether it's the file or the machine.",
      },
      {
        text: "Have the caller forward the personal-email copy to IT and close the ticket, since a working copy exists.",
        isCorrect: false,
        explanation:
          "This works around the symptom without ever finding out why the work PC's copy corrupted in the first place — if it's a failing disk or a bad sync client, the exact same thing will happen to the next file.",
      },
    ],
    resolutionSteps:
      "The working copy opened fine on the work PC too, ruling out a machine-wide Office problem. Checked the sync client and found it had been silently failing uploads for two days due to a expired auth token — the on-PC copy was a partially-written, incomplete sync, not a real corruption. Re-authenticated the sync client and re-uploaded from the known-good copy.",
    writtenPrompt:
      "Write what you'd tell the caller once it's fixed. Their file has months of work in it, so be clear and reassuring that nothing was actually lost, and explain what really happened in plain language.",
  },
  {
    title: "Laptop randomly shuts off during video calls",
    category: "HARDWARE",
    difficulty: "ADVANCED",
    channel: "PHONE",
    callerOpening:
      "My laptop just shuts off completely, no warning, always during video calls. Happened three times this week.",
    callerFollowUp:
      "It's always plugged in when it happens, and the battery's always showing like 60-70% right before it dies. It's not like it's about to die from empty battery.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check the laptop's event logs and thermal/power history around the times it shut down, before touching any hardware.",
        isCorrect: true,
        explanation:
          "Correct — 'shuts off during demanding tasks, while plugged in, with charge remaining' matches several very different root causes (overheating shutdown protection, a failing battery reporting false charge levels, a power delivery fault). The event/thermal logs are what turn a guess into an actual diagnosis before anything gets swapped.",
      },
      {
        text: "Replace the battery immediately since it's the most common cause of laptops dying unexpectedly.",
        isCorrect: false,
        explanation:
          "The caller already gave a specific detail that argues against a simple dead battery — charge remaining and always plugged in. Swapping a part based on the *general* pattern instead of *this* caller's specific details risks not fixing it and burning a part for nothing.",
      },
      {
        text: "Tell the caller to stop using video calls on that laptop.",
        isCorrect: false,
        explanation:
          "A workaround that avoids diagnosing anything — and doesn't actually solve the underlying problem, which will likely show up doing other demanding tasks too.",
      },
      {
        text: "Escalate directly to the hardware vendor's support line without any internal diagnostics.",
        isCorrect: false,
        explanation:
          "Skips gathering any data first — a vendor support line is going to ask for exactly the logs and history that should be pulled internally first, and doing so first means whatever the vendor is told is actually useful.",
      },
    ],
    resolutionSteps:
      "Thermal logs showed the CPU hitting its critical temperature threshold right before each shutdown — the fan curve wasn't ramping up properly, likely dust-clogged intake vents. A compressed-air cleaning and a BIOS fan-curve update fixed it; no shutdowns since.",
    writtenPrompt:
      "Write what you'd tell the caller once you've diagnosed and fixed it, explaining the actual cause in terms someone without a technical background could follow.",
  },
  {
    title: "New hire needs access to the finance shared drive",
    category: "ACCESS",
    difficulty: "BEGINNER",
    channel: "PHONE",
    callerOpening:
      "Hi, I just started on the finance team this week and I need access to the finance shared drive to do my job.",
    callerFollowUp:
      "My manager is Priya Shah, but she's in back-to-back meetings all day so I figured I'd just ask IT directly to save time.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Confirm the access request through the standard approval channel (the requester's manager or the access-request system) before granting anything.",
        isCorrect: true,
        explanation:
          "Correct — granting access to a sensitive shared drive based solely on a caller's own claim of who they are and what they need is exactly how access-control policies get bypassed. A short delay for proper approval is the entire point of having an approval step at all, even when the requester's story sounds completely reasonable.",
      },
      {
        text: "Grant access immediately since new hires need to get productive quickly and the request sounds reasonable.",
        isCorrect: false,
        explanation:
          "\"Sounds reasonable\" isn't verification — this is precisely the pressure (new, in a hurry, manager conveniently unavailable) a real unauthorized-access attempt would also use. Skipping approval here isn't being helpful, it's bypassing the control that access requests exist to enforce.",
      },
      {
        text: "Tell the caller access requests aren't something IT handles at all.",
        isCorrect: false,
        explanation:
          "Not true, and unhelpful — provisioning access is a normal part of the job. The issue isn't whether to help, it's skipping the approval step, not whether this is IT's job.",
      },
      {
        text: "Grant temporary access now and remove it later if it turns out to be wrong.",
        isCorrect: false,
        explanation:
          "\"Grant now, fix it later\" still means sensitive data was exposed before anyone verified the request was legitimate — the harm already happened by the time anyone would notice and revoke it.",
      },
    ],
    resolutionSteps:
      "Sent the standard access-request confirmation to the requester's manager (Priya Shah) rather than granting on the caller's word alone. She approved it within the hour once out of meetings. Access was granted the same day — barely slower than granting it immediately, but through the process that actually exists to prevent unauthorized access.",
    writtenPrompt:
      "Write what you'd say to the new hire to explain why you can't just grant access right away, and what happens next, without making them feel distrusted on their first week.",
  },
  {
    title: "Authenticator app stopped generating codes",
    category: "ACCOUNT",
    difficulty: "INTERMEDIATE",
    channel: "PHONE",
    callerOpening:
      "My authenticator app isn't generating the right codes anymore, I can't log into anything that needs two-factor. Can you just turn off two-factor on my account so I can get in?",
    callerFollowUp:
      "I did just get a new phone, actually — I didn't think to move the authenticator app over before I got rid of the old one.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Use the account's backup/recovery codes or an identity-verified manual re-enrollment process — not disabling two-factor authentication.",
        isCorrect: true,
        explanation:
          "Correct — losing the authenticator (a lost/replaced phone) is exactly what backup codes and recovery procedures exist for. Turning off two-factor entirely to solve one login is fixing a temporary inconvenience by permanently removing the account's actual security, which is a wildly disproportionate trade.",
      },
      {
        text: "Disable two-factor authentication on the account so the caller can log in normally again.",
        isCorrect: false,
        explanation:
          "This is the request, but not the right fix — it solves the caller's immediate annoyance by leaving their account (and the door it opens) permanently less protected, for a problem that has a proper recovery path instead.",
      },
      {
        text: "Tell the caller there's nothing that can be done until they find their old phone.",
        isCorrect: false,
        explanation:
          "Unhelpful and untrue — a lost authenticator device is a routine, expected situation with a real recovery process, not a dead end.",
      },
      {
        text: "Have the caller read out a code from the broken authenticator app over the phone to prove their identity.",
        isCorrect: false,
        explanation:
          "The whole problem is that the app isn't generating valid codes anymore — this doesn't verify anything and wouldn't even be possible to do correctly.",
      },
    ],
    resolutionSteps:
      "Verified the caller's identity through the standard process, then used their account's recovery codes to get them back in, and walked them through re-enrolling the authenticator app on their new phone. Two-factor stayed enabled the entire time — the account was never left less protected than before the call.",
    writtenPrompt:
      "Write what you'd say to explain why you're not just turning off two-factor authentication like they asked, and what you're doing instead to get them logged in today.",
  },
  {
    title: "VP wants a policy exception, right now",
    category: "ACCOUNT",
    difficulty: "ADVANCED",
    channel: "PHONE",
    callerOpening:
      "This is [name], VP of Sales. I need admin rights on my laptop today, I've got a client demo in an hour and I can't install the software I need without them.",
    callerFollowUp:
      "I know it's against the standard policy, I've been told that before, but I don't have time to go through the whole request-and-approval thing today. Just make it happen.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Explain the policy applies regardless of seniority, and offer the fastest *compliant* path — installing the specific software directly, or an expedited exception request to whoever actually owns that policy.",
        isCorrect: true,
        explanation:
          "Correct — seniority and urgency are exactly the pressure real policy-bypass attempts use, whether or not this particular request is genuinely legitimate. The right move isn't refusing to help *or* quietly complying — it's solving the actual underlying need (getting the software installed in time) through a path that doesn't require ignoring the control.",
      },
      {
        text: "Grant admin rights immediately — it's a VP, and pushing back could cause real problems.",
        isCorrect: false,
        explanation:
          "Complying just because of a job title is precisely how policy exceptions become meaningless, and it sets a precedent that pressure and urgency can override a security control that applies to everyone.",
      },
      {
        text: "Flatly refuse and tell the caller to submit a standard request that will be reviewed in 3-5 business days.",
        isCorrect: false,
        explanation:
          "Technically follows the rule but ignores the actual problem — there's a real business need (a client demo in an hour) that a same-day compliant solution could likely still meet. Refusing without even trying to help isn't the same as holding the line correctly.",
      },
      {
        text: "Grant temporary admin rights and remove them right after the demo so no one notices.",
        isCorrect: false,
        explanation:
          "Granting elevated access and quietly walking it back isn't a compliant exception process, it's bypassing the control while avoiding the appearance of doing so — arguably worse, since there's no proper record or approval at all.",
      },
    ],
    resolutionSteps:
      "Installed the specific software the caller actually needed directly, using an IT-held admin credential for that one installation, instead of granting the caller standing admin rights. The demo went ahead on time, and the underlying policy — no standing local admin rights without an approved exception — was never bypassed.",
    writtenPrompt:
      "Write exactly what you'd say to the VP, on this call, right now, to hold the line on policy while still solving their problem in time for the demo. Keep it professional, not defensive.",
  },
  {
    title: "\"My computer is being weird\"",
    category: "OTHER",
    difficulty: "BEGINNER",
    channel: "PHONE",
    callerOpening:
      "Hey, so my computer's just... being weird today. Can you help?",
    callerFollowUp:
      "I don't really know how to describe it better than that, honestly. It's just not acting right.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Ask specific, narrowing questions (what app were you using, what exactly happens, when did it start) to turn a vague complaint into an actual symptom.",
        isCorrect: true,
        explanation:
          "Correct — \"being weird\" isn't a diagnosable symptom yet. Before anything can be checked or fixed, the ticket needs an actual description of what's happening: which application, what specifically goes wrong, and when it started. This is the real first skill in triage — turning noise into a workable problem statement.",
      },
      {
        text: "Restart the computer, since that fixes most vague issues anyway.",
        isCorrect: false,
        explanation:
          "Might genuinely help, but jumping straight to a fix for an undiagnosed, unspecified problem means nobody will know whether it actually worked, or what was even wrong in the first place — and if it comes back, this call starts over from zero.",
      },
      {
        text: "Tell the caller to submit a more detailed ticket and call back when they can describe the problem.",
        isCorrect: false,
        explanation:
          "Pushes the actual diagnostic work back onto the caller instead of doing the job a support call exists for — a few good questions from the agent would get the same specificity in under a minute.",
      },
      {
        text: "Escalate to L2 immediately since it's an unclear issue.",
        isCorrect: false,
        explanation:
          "Nothing has actually been diagnosed yet — escalating an undefined complaint just moves the same lack of information to someone else instead of spending thirty seconds narrowing it down first.",
      },
    ],
    resolutionSteps:
      "A few follow-up questions narrowed \"being weird\" down to: the caller's email client had been silently failing to send attachments over 10MB for the past two days. Once the actual symptom was clear, it was a two-minute fix — the client's attachment-size setting had reverted after an update.",
    writtenPrompt:
      "Write the actual questions you'd ask the caller to turn \"being weird\" into something you can actually diagnose.",
  },

  // Email scenarios. Reports come in with more detail up front and less
  // time pressure than a phone call, but the reply has to hold up as a
  // written record: a proper greeting and close, not just an explanation.
  {
    title: "Email: Shared drive filling up again",
    category: "HARDWARE",
    difficulty: "INTERMEDIATE",
    channel: "EMAIL",
    channelSubject: "Getting 'disk full' errors saving to the team drive",
    callerOpening:
      "Hi IT, for the third time this month I'm getting a 'not enough space' error trying to save files to the \\\\fileserver\\team-share drive. Can someone free up space or increase the quota? This is really slowing down my work.",
    callerFollowUp:
      "Sorry, to answer your question: it's happening specifically in the Marketing\\Campaigns folder, and yes, I've noticed a bunch of old video files sitting in there that nobody's touched in months.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check actual free space on the drive and identify what's consuming it before assuming a quota increase is the right fix.",
        isCorrect: true,
        explanation:
          "The follow-up email already points at large unused video files. The real problem might be cleanup, not capacity, and diagnosing first avoids buying more storage to hold files nobody needs.",
      },
      {
        text: "Immediately request budget approval to expand the drive's storage quota.",
        isCorrect: false,
        explanation:
          "Jumping straight to a capacity increase skips finding out whether the space is actually needed, and the follow-up email already hints the real issue is old, unused files.",
      },
      {
        text: "Tell the employee to just delete their own files to free up space.",
        isCorrect: false,
        explanation:
          "This is a shared team drive, not the employee's personal space. Unilaterally deleting anything, even old files, needs verification with the team, not an instruction to one person.",
      },
      {
        text: "Escalate to L3 immediately since storage issues are always infrastructure-level.",
        isCorrect: false,
        explanation:
          "This looks resolvable without deep infrastructure work. Jumping straight to escalation skips even basic investigation.",
      },
    ],
    resolutionSteps:
      "Found 40GB of old campaign video files untouched for eight-plus months in the Campaigns folder. Confirmed with the marketing team lead that they were safe to archive, moved them to cold storage, and freed enough space to resolve the immediate issue. Flagged the drive for a recurring quarterly cleanup review going forward.",
    writtenPrompt:
      "Write your email reply to the employee explaining what you found and what you did. Include a proper greeting and sign-off, this is a written reply they'll keep in their inbox, not something you say once.",
  },
  {
    title: "Email: Suspicious email reported by an employee",
    category: "OTHER",
    difficulty: "INTERMEDIATE",
    channel: "EMAIL",
    channelSubject: "Is this email safe? Looks weird",
    callerOpening:
      "Hi, I got an email that says it's from 'IT Support' asking me to verify my password by clicking a link because my account will be suspended in 24 hours. It looks kind of official but something feels off. Should I click it?",
    callerFollowUp:
      "I haven't clicked anything yet, don't worry! I just wanted to check with you first. It came from an address like it-support@company-secure-verify.com, not our normal domain.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Confirm it's phishing based on the mismatched domain, and reply telling them not to click it, then have it reported and blocked.",
        isCorrect: true,
        explanation:
          "The follow-up email already provides the smoking gun: a domain that doesn't match the real company domain. Real IT verification requests never come from a lookalike domain, this is textbook phishing.",
      },
      {
        text: "Ask them to click the link so you can see what it does.",
        isCorrect: false,
        explanation:
          "Never ask a user to click a suspected phishing link, even to investigate it, that's exactly the outcome the phishing attempt wants.",
      },
      {
        text: "Tell them it's probably fine since IT does sometimes ask for password verification.",
        isCorrect: false,
        explanation:
          "Real IT departments never ask for a password via an email link. Reassuring the employee this is normal is actively dangerous.",
      },
      {
        text: "Reset the employee's password immediately as a precaution.",
        isCorrect: false,
        explanation:
          "Nothing has been compromised yet, they haven't clicked anything. This jumps to a response for an incident that hasn't happened instead of addressing the actual phishing attempt.",
      },
    ],
    resolutionSteps:
      "Confirmed the email was phishing based on the lookalike domain, had the employee forward it so the sender could be blocked company-wide, and reassured them their account was never at risk since they didn't click through. No password reset was needed since nothing was compromised.",
    writtenPrompt:
      "Write your email reply to the employee. Confirm what it is, thank them for checking first instead of clicking, and tell them clearly what happens next.",
  },
  {
    title: "Email: New starter's software wasn't set up before day one",
    category: "SOFTWARE",
    difficulty: "BEGINNER",
    channel: "EMAIL",
    channelSubject: "Missing software on my first day",
    callerOpening:
      "Hi, today's my first day and I was told my laptop would have the design software bundle already installed, but it's not here. My manager wants me working on a project this afternoon. Can you help?",
    callerFollowUp:
      "It's a Windows laptop, and the specific tools I was told I'd need are the ones in our standard Creative software bundle, I don't know the exact install package name though, sorry.",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Look up the standard onboarding software bundle assigned to their role or team and start that install right away.",
        isCorrect: true,
        explanation:
          "This is a known, standard package, the Creative bundle. The fastest path is pulling up the existing standard install list rather than guessing or making them wait on back-and-forth about exact software names.",
      },
      {
        text: "Tell them to wait until their manager submits a formal software request.",
        isCorrect: false,
        explanation:
          "This is a known onboarding gap, not a new custom request. Standard onboarding software should already have a defined install process, adding a manager-approval step here just delays a routine fix unnecessarily.",
      },
      {
        text: "Have them install it themselves using their own admin rights.",
        isCorrect: false,
        explanation:
          "A brand new starter's laptop shouldn't be handed local admin rights to self-install software, that's an access-control risk on day one, not a fix.",
      },
      {
        text: "Escalate immediately since onboarding failures are always a management issue.",
        isCorrect: false,
        explanation:
          "This is a straightforward, fixable IT task, missing standard software, not something that needs escalating past the service desk before even attempting it.",
      },
    ],
    resolutionSteps:
      "Identified their role's standard onboarding software bundle in the provisioning system, remote-installed it directly, and confirmed all the expected tools launched correctly before their afternoon project started. Flagged the onboarding gap so this laptop gets checked before the next new starter's first day.",
    writtenPrompt:
      "Write your email reply to the new starter. Be reassuring, they're anxious on day one, and be clear about what you're doing and when they can expect it to be ready.",
  },

  // Chat scenarios. Fast, casual, and often mid-interruption, the reply
  // needs to be short and immediately useful, a wall of text in live chat
  // is its own usability problem, not a sign of thoroughness.
  {
    title: "Chat: Wi-Fi's down right before a call",
    category: "NETWORK",
    difficulty: "BEGINNER",
    channel: "CHAT",
    channelSubject: "#it-support-chat",
    callerOpening:
      "hey is anyone else's wifi down?? i have a client call starting in like 2 min and i cant get online",
    callerFollowUp:
      "just tried reconnecting, still nothing. laptop says 'no internet, secured' under the wifi name",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Ask if anyone else nearby is also affected, to tell a local device issue apart from a wider outage, while giving them a quick mobile-hotspot fallback for the call.",
        isCorrect: true,
        explanation:
          "\"No internet, secured\" (connected to the router but no internet beyond it) plus the time pressure means the priority is confirming scope and giving them an immediate way to make the call, not diagnosing in isolation while they miss it.",
      },
      {
        text: "Have them restart their laptop and wait to see if that fixes it.",
        isCorrect: false,
        explanation:
          "A full restart takes too long against a two-minute deadline, and \"no internet, secured\" points at a network-level issue, not something a laptop restart is likely to fix.",
      },
      {
        text: "Tell them to just reschedule the call.",
        isCorrect: false,
        explanation:
          "Rescheduling a client call should be a last resort, not the first suggestion, especially when a quick mobile hotspot could get them online in seconds.",
      },
      {
        text: "Ask them to run a full network diagnostic report and send you the results.",
        isCorrect: false,
        explanation:
          "This takes too long for a two-minute deadline, and buries the urgent need, getting them on the call now, under a slower investigation that can happen afterward.",
      },
    ],
    resolutionSteps:
      "Confirmed two other people on the same floor reported the same issue, a switch had dropped, pointing to a local network problem, not this one laptop. Got the employee onto their phone's mobile hotspot in time for the call, then flagged the switch for a hard reset, which resolved it for the floor within a few minutes.",
    writtenPrompt:
      "Write your chat reply. Keep it fast and short, this is live chat under time pressure, not an email, get them the fallback plan immediately.",
  },
  {
    title: "Chat: Can't share screen mid-meeting",
    category: "SOFTWARE",
    difficulty: "BEGINNER",
    channel: "CHAT",
    channelSubject: "#it-support-chat",
    callerOpening:
      "in a meeting right now, share screen button is greyed out in the video call app, need to present in like a minute",
    callerFollowUp:
      "just restarted the app once already, still greyed out. it worked yesterday",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Check whether screen recording/sharing permission was granted to the app in the OS privacy settings, a common cause of a suddenly-greyed-out share button.",
        isCorrect: true,
        explanation:
          "\"Worked yesterday, suddenly doesn't\" plus an already-tried app restart points away from the app itself and toward an OS-level permission that may have been reset, common after an OS update, not something a second app restart would fix.",
      },
      {
        text: "Tell them to restart the app again.",
        isCorrect: false,
        explanation:
          "They already tried this and it didn't work, repeating the same failed step wastes their remaining time before they need to present.",
      },
      {
        text: "Have them reinstall the entire video call app.",
        isCorrect: false,
        explanation:
          "A full reinstall takes too long for someone who needs to present within a minute, and isn't justified yet, since the symptom (a permission-gated button, not a crash) doesn't point at a broken installation.",
      },
      {
        text: "Tell them to share their screen using a different device instead.",
        isCorrect: false,
        explanation:
          "This assumes their current device is unfixable in time without even checking the likely one-setting cause first, and asking them to switch devices mid-meeting is more disruptive than a twenty-second permissions check.",
      },
    ],
    resolutionSteps:
      "Found screen recording permission had been revoked for the video call app after a recent OS update, a known side effect of that update. Walked them through re-enabling it in system privacy settings in under a minute, share screen worked immediately after.",
    writtenPrompt:
      "Write your chat reply. They're mid-meeting, keep it to the exact steps, no extra explanation they don't have time to read right now.",
  },
  {
    title: "Chat: Quick favor, just turn off MFA for today",
    category: "ACCOUNT",
    difficulty: "ADVANCED",
    channel: "CHAT",
    channelSubject: "#it-support-chat",
    callerOpening:
      "hey quick one - can you just turn off 2FA/MFA on my account for today? phone's dead and I've got a client call in 5 where I need to log into the portal",
    callerFollowUp:
      "I get that it's policy but it's literally just for today, I'll turn it back on myself after, promise. really need this call to go well",
    question: "What's your first diagnostic step?",
    choices: [
      {
        text: "Decline to disable MFA, and instead help them get a working second factor for right now, a backup code, or a verification method that doesn't need their phone.",
        isCorrect: true,
        explanation:
          "This is the exact shape real social engineering takes: urgency plus a small, reasonable-sounding ask, framed as temporary. The right move is solving the actual underlying need, getting into the portal in the next five minutes, without disabling a security control account-wide.",
      },
      {
        text: "Disable MFA for the rest of the day since it's a small, temporary request and they seem genuinely rushed.",
        isCorrect: false,
        explanation:
          "Genuine urgency is exactly what makes this convincing, and exactly why it's dangerous to comply with. Disabling MFA even briefly removes protection for as long as it's off, regardless of how sincere the request sounds.",
      },
      {
        text: "Ignore the request and tell them to sort it out after their call.",
        isCorrect: false,
        explanation:
          "This leaves them blocked from a call they said matters, and doesn't offer any real alternative. A good agent solves the actual problem, getting them logged in, without taking the unsafe shortcut.",
      },
      {
        text: "Ask a coworker to approve it instead, since it's technically not you disabling it.",
        isCorrect: false,
        explanation:
          "Passing the same unsafe request to someone else doesn't make it safe. If it's the wrong move for you to make, it's the wrong move for anyone to make on this account.",
      },
    ],
    resolutionSteps:
      "Walked them through using a backup MFA code from their account recovery kit instead of disabling anything. They were logged into the portal in under two minutes, ahead of their call, and MFA stayed on the whole time. Flagged the request pattern to the security team, since \"just turn off MFA, I promise I'll turn it back on\" is a known social-engineering script worth having on record even when the employee is genuinely who they say they are.",
    writtenPrompt:
      "Write your chat reply. Be quick, they're in a hurry, but firm, get them unblocked without giving in on the actual ask.",
  },
];
