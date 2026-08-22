import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { CATEGORY_LABELS } from "@/src/types/itil";
import { TRAINING_DIFFICULTY_LABELS } from "@/src/data/training-scenarios";
import { submitTrainingAnswer } from "@/src/actions/training";

export const dynamic = "force-dynamic";

export default async function TrainingScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ answered?: string }>;
}) {
  const { id } = await params;
  const { answered } = await searchParams;

  const [scenario, activeUser] = await Promise.all([
    prisma.trainingScenario.findUnique({
      where: { id },
      include: { choices: { orderBy: { order: "asc" } } },
    }),
    getActiveUser(),
  ]);

  if (!scenario) {
    notFound();
  }

  if (!activeUser) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 py-16 px-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick a user from &quot;Viewing as&quot; at the top of the page
          before taking a training call — your attempts are tracked per
          person.
        </p>
        <Link href="/training" className="text-sm underline">
          Back to training
        </Link>
      </main>
    );
  }

  const priorAttempts = await prisma.trainingAttempt.count({
    where: { userId: activeUser.id, scenarioId: scenario.id },
  });

  // Once a choice has been submitted, `answered` holds its id — look it
  // up among this scenario's own choices (not a fresh DB query) so we
  // can't accidentally reveal a choice belonging to a different scenario.
  const answeredChoice = answered
    ? scenario.choices.find((choice) => choice.id === answered)
    : undefined;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
        <Link href="/training" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to training
        </Link>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
            {CATEGORY_LABELS[scenario.category]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 dark:bg-zinc-800">
            {TRAINING_DIFFICULTY_LABELS[scenario.difficulty]}
          </span>
          {priorAttempts > 0 && <span>Attempt #{priorAttempts + 1}</span>}
        </div>

        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{scenario.title}</h1>

        {/* The "call" — styled as a transcript so it reads like an actual
            support call rather than a ticket description. Both caller
            lines show up front (see the comment in training-scenarios.ts
            on why this is a static two-beat transcript, not a full
            branching conversation). */}
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

        {!answeredChoice ? (
          <form action={submitTrainingAnswer} className="flex flex-col gap-3">
            <input type="hidden" name="scenarioId" value={scenario.id} />
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
              {scenario.question}
            </h2>
            <div className="flex flex-col gap-2">
              {scenario.choices.map((choice) => (
                <label
                  key={choice.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-black/10 bg-white p-3 text-sm hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
                >
                  <input
                    type="radio"
                    name="choiceId"
                    value={choice.id}
                    required
                    className="mt-1"
                  />
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

            <div className="flex gap-3">
              <Link
                href={`/training/${scenario.id}`}
                className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
              >
                Try again
              </Link>
              <Link
                href="/training"
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
              >
                Next call
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
