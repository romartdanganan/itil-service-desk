import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { CATEGORY_LABELS } from "@/src/types/itil";
import { TRAINING_DIFFICULTY_LABELS } from "@/src/data/training-scenarios";
import { startShift } from "@/src/actions/shift";

export const dynamic = "force-dynamic";

// The Training Simulator's home: every scenario ("call") available,
// with a per-scenario status once a user is picked. Deliberately its own
// top-level route (not folded into the main dashboard) — this is a
// practice tool, not part of the real ticket queue, and keeping them
// visually separate matters so nobody mistakes a training call for an
// actual incident.
export default async function TrainingHomePage() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const [scenarios, attempts] = await Promise.all([
    prisma.trainingScenario.findMany({
      orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
    }),
    // Ordered newest-first, then only the first attempt seen per scenario
    // is kept below — that's the user's most recent try, which is what
    // "have they resolved this yet" should reflect (see the
    // TrainingAttempt schema comment on why every attempt is kept instead
    // of just overwriting one row).
    prisma.trainingAttempt.findMany({
      where: { userId: activeUser.id },
      orderBy: { createdAt: "desc" },
      select: { scenarioId: true, wasCorrect: true },
    }),
  ]);

  const latestAttemptByScenario = new Map<string, { wasCorrect: boolean }>();
  for (const attempt of attempts) {
    if (!latestAttemptByScenario.has(attempt.scenarioId)) {
      latestAttemptByScenario.set(attempt.scenarioId, attempt);
    }
  }

  const resolvedCount = [...latestAttemptByScenario.values()].filter(
    (a) => a.wasCorrect,
  ).length;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            📞 Training Simulator
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;ve correctly resolved {resolvedCount} of {scenarios.length} calls.
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Practice calls come in like a real support line — read past the
            noise, pick your first diagnostic step, then see how it was
            actually resolved. Wrong answers are worth just as much as
            right ones: every choice explains why.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div>
            <p className="text-sm font-semibold text-black dark:text-zinc-50">📋 Shift Mode</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              5 calls back-to-back, no retries once you answer — the
              closest this gets to an actual shift, not just picking a
              scenario at a time.
            </p>
          </div>
          <form action={startShift}>
            <button
              type="submit"
              className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Start a shift
            </button>
          </form>
        </div>

        <ul className="flex flex-col gap-3">
          {scenarios.map((scenario) => {
            const attempt = latestAttemptByScenario.get(scenario.id);
            return (
              <li key={scenario.id}>
                <Link
                  href={`/training/${scenario.id}`}
                  className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                    <span>
                      {CATEGORY_LABELS[scenario.category]} ·{" "}
                      {TRAINING_DIFFICULTY_LABELS[scenario.difficulty]}
                    </span>
                    {attempt && (
                      <span
                        className={
                          attempt.wasCorrect
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }
                      >
                        {attempt.wasCorrect ? "Resolved" : "Try again"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-medium text-black dark:text-zinc-50">{scenario.title}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
