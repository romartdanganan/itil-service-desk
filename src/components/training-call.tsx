import { CATEGORY_LABELS } from "@/src/types/itil";
import { TRAINING_DIFFICULTY_LABELS, TRAINING_CHANNEL_LABELS } from "@/src/data/training-scenarios";
import type { IncidentCategory, TrainingDifficulty, TrainingChannel } from "@/app/generated/prisma/enums";

// Shared between the standalone practice page (app/training/[id]/page.tsx)
// and the Shift mode flow (app/shift/[id]/page.tsx) — both render the same
// "call comes in, answer the question, see the reveal" core, just wired
// to a different Server Action (and Shift mode adds a hidden shiftId
// field + different post-reveal navigation, which each caller renders
// itself below this component rather than this component trying to know
// about both flows).

type ScenarioForCall = {
  id: string;
  title: string;
  category: IncidentCategory;
  difficulty: TrainingDifficulty;
  channel: TrainingChannel;
  channelSubject: string | null;
  callerOpening: string;
  callerFollowUp: string;
  question: string;
  resolutionSteps: string;
  choices: { id: string; text: string; isCorrect: boolean; explanation: string }[];
};

// The "incoming message" transcript, styled per channel so each one
// actually reads like the medium it's simulating rather than three
// channels sharing one phone-call-shaped box. The multiple-choice
// question, reveal, and resolution box below this are identical
// regardless of channel, triage is the same skill no matter how the
// report arrived.
function ChannelTranscript({ scenario }: { scenario: ScenarioForCall }) {
  if (scenario.channel === "EMAIL") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500">
          {"✉️"} New email
        </p>
        {scenario.channelSubject && (
          <p className="text-sm font-semibold text-black dark:text-zinc-50">
            Subject: {scenario.channelSubject}
          </p>
        )}
        <p className="whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
          {scenario.callerOpening}
        </p>
        <p className="text-xs text-zinc-500">Their reply, after you asked a clarifying question:</p>
        <p className="whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
          {scenario.callerFollowUp}
        </p>
      </div>
    );
  }

  if (scenario.channel === "CHAT") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500">
          {"\u{1F4AC}"} {scenario.channelSubject ?? "New chat message"}
        </p>
        <p className="rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
          {scenario.callerOpening}
        </p>
        <p className="text-xs text-zinc-500">After you ask a clarifying question:</p>
        <p className="rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
          {scenario.callerFollowUp}
        </p>
      </div>
    );
  }

  // PHONE, the original transcript treatment.
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500">📞 Incoming call</p>
      <p className="rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
        &ldquo;{scenario.callerOpening}&rdquo;
      </p>
      <p className="text-xs text-zinc-500">— you ask a clarifying question —</p>
      <p className="rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
        &ldquo;{scenario.callerFollowUp}&rdquo;
      </p>
    </div>
  );
}

export function TrainingCall({
  scenario,
  answeredChoice,
  formAction,
  hiddenFields,
  metaBadge,
}: {
  scenario: ScenarioForCall;
  answeredChoice?: { id: string; text: string; isCorrect: boolean; explanation: string };
  formAction: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  metaBadge?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
          {CATEGORY_LABELS[scenario.category]}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
          {TRAINING_DIFFICULTY_LABELS[scenario.difficulty]}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
          {TRAINING_CHANNEL_LABELS[scenario.channel]}
        </span>
        {metaBadge && <span>{metaBadge}</span>}
      </div>

      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{scenario.title}</h1>

      {/* The incoming report, styled to match its channel (phone
          transcript, email, or chat thread) so it reads like the medium
          it's simulating rather than a generic ticket description. Both
          message beats show up front (see the comment in
          training-scenarios.ts on why this is a static two-beat exchange,
          not a full branching conversation). */}
      <ChannelTranscript scenario={scenario} />

      {!answeredChoice ? (
        <form action={formAction} className="flex flex-col gap-3">
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{scenario.question}</h2>
          <div className="flex flex-col gap-2">
            {scenario.choices.map((choice) => (
              <label
                key={choice.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-black/10 bg-white p-3 text-sm hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
              >
                <input type="radio" name="choiceId" value={choice.id} required className="mt-1" />
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Answer
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className={`rounded-lg border p-4 text-sm ${
              answeredChoice.isCorrect
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
            }`}
          >
            <p
              className={`font-semibold ${
                answeredChoice.isCorrect
                  ? "text-emerald-900 dark:text-emerald-300"
                  : "text-red-900 dark:text-red-300"
              }`}
            >
              {answeredChoice.isCorrect ? "✓ Correct" : "✗ Not quite"}
            </p>
            <p className="mt-1 text-black dark:text-zinc-50">&ldquo;{answeredChoice.text}&rdquo;</p>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">{answeredChoice.explanation}</p>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 text-sm dark:bg-blue-950/40">
            <p className="font-semibold text-blue-900 dark:text-blue-300">How this was actually resolved</p>
            <p className="mt-1 text-blue-800 dark:text-blue-400">{scenario.resolutionSteps}</p>
          </div>
        </div>
      )}
    </div>
  );
}
