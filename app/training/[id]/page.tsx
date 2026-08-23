import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { submitTrainingAnswer } from "@/src/actions/training";
import { TrainingCall } from "@/src/components/training-call";

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
    redirect("/login");
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

        <TrainingCall
          scenario={scenario}
          answeredChoice={answeredChoice}
          formAction={submitTrainingAnswer}
          hiddenFields={{ scenarioId: scenario.id }}
          metaBadge={priorAttempts > 0 ? `Attempt #${priorAttempts + 1}` : undefined}
        />

        {answeredChoice && (
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
        )}
      </main>
    </div>
  );
}
