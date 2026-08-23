import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { submitShiftAnswer, startShift } from "@/src/actions/shift";
import { TrainingCall } from "@/src/components/training-call";
import { CATEGORY_LABELS } from "@/src/types/itil";

export const dynamic = "force-dynamic";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default async function ShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ answered?: string }>;
}) {
  const { id } = await params;
  const { answered } = await searchParams;

  const [shift, activeUser] = await Promise.all([
    prisma.shift.findUnique({
      where: { id },
      include: { attempts: { orderBy: { createdAt: "asc" } } },
    }),
    getActiveUser(),
  ]);

  if (!shift) {
    notFound();
  }
  if (!activeUser) {
    redirect("/login");
  }
  if (shift.userId !== activeUser.id) {
    // Someone else's shift — not this trainee's to see or continue.
    notFound();
  }

  // Just landed here right after submitting an answer: show the reveal
  // for the call that was JUST answered (the last recorded attempt),
  // not the next call's blank form — even though, by this point,
  // `shift.attempts.length` already includes that just-recorded attempt
  // and would otherwise point one call further ahead.
  if (answered) {
    const lastAttempt = shift.attempts[shift.attempts.length - 1];
    const scenario = lastAttempt
      ? await prisma.trainingScenario.findUnique({
          where: { id: lastAttempt.scenarioId },
          include: { choices: { orderBy: { order: "asc" } } },
        })
      : null;
    const answeredChoice = scenario?.choices.find((choice) => choice.id === answered);

    if (scenario && answeredChoice) {
      const isLastCall = shift.attempts.length === shift.scenarioIds.length;
      return (
        <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
          <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
            <TrainingCall
              scenario={scenario}
              answeredChoice={answeredChoice}
              formAction={submitShiftAnswer}
              hiddenFields={{ shiftId: shift.id, scenarioId: scenario.id }}
              metaBadge={`Call ${shift.attempts.length} of ${shift.scenarioIds.length}`}
            />
            <Link
              href={`/shift/${shift.id}`}
              className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
            >
              {isLastCall ? "View shift summary" : "Next call"}
            </Link>
          </main>
        </div>
      );
    }
    // Fell through (bad/stale `answered` value) — just show current state below.
  }

  const currentIndex = shift.attempts.length;
  const isComplete = currentIndex >= shift.scenarioIds.length;

  if (!isComplete) {
    const currentScenarioId = shift.scenarioIds[currentIndex];
    const scenario = await prisma.trainingScenario.findUniqueOrThrow({
      where: { id: currentScenarioId },
      include: { choices: { orderBy: { order: "asc" } } },
    });

    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            📋 Shift in progress — no retries once you answer, same as a real one.
          </p>
          <TrainingCall
            scenario={scenario}
            formAction={submitShiftAnswer}
            hiddenFields={{ shiftId: shift.id, scenarioId: scenario.id }}
            metaBadge={`Call ${currentIndex + 1} of ${shift.scenarioIds.length}`}
          />
        </main>
      </div>
    );
  }

  // Shift complete — summary.
  const scenarios = await prisma.trainingScenario.findMany({
    where: { id: { in: shift.scenarioIds } },
  });
  const scenariosById = new Map(scenarios.map((s) => [s.id, s]));
  const correctCount = shift.attempts.filter((a) => a.wasCorrect).length;
  const durationMs =
    (shift.completedAt ?? new Date()).getTime() - shift.startedAt.getTime();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Shift complete</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {correctCount} of {shift.scenarioIds.length} correct, in {formatDuration(durationMs)}.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {shift.attempts.map((attempt, index) => {
            const scenario = scenariosById.get(attempt.scenarioId);
            if (!scenario) return null;
            return (
              <li key={attempt.id}>
                <Link
                  href={`/training/${scenario.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 text-sm hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">#{index + 1}</span>
                    <span className="font-medium text-black dark:text-zinc-50">{scenario.title}</span>
                    <span className="text-xs text-zinc-500">{CATEGORY_LABELS[scenario.category]}</span>
                  </span>
                  <span
                    className={
                      attempt.wasCorrect
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300"
                    }
                  >
                    {attempt.wasCorrect ? "Correct" : "Incorrect"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-3">
          <form action={startShift}>
            <button
              type="submit"
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
            >
              Start another shift
            </button>
          </form>
          <Link
            href="/training"
            className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
          >
            Back to training
          </Link>
        </div>
      </main>
    </div>
  );
}
