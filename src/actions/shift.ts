"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";

const CALLS_PER_SHIFT = 5;

function shuffled<T>(items: T[]): T[] {
  // Fisher-Yates — a plain `.sort(() => Math.random() - 0.5)` is a classic
  // near-miss here: it doesn't produce a uniform shuffle, some orderings
  // come out more likely than others. Doesn't matter for a coin flip, but
  // "which 5 practice calls you get" is worth actually getting right.
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Queue up a batch of calls and start a shift — the closer-to-a-real-job
 * mode, versus picking one scenario at a time from /training. */
export async function startShift() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const allScenarios = await prisma.trainingScenario.findMany({ select: { id: true } });
  const scenarioIds = shuffled(allScenarios.map((s) => s.id)).slice(0, CALLS_PER_SHIFT);

  const shift = await prisma.shift.create({
    data: { userId: activeUser.id, scenarioIds },
  });

  redirect(`/shift/${shift.id}`);
}

/**
 * Answer the current call in a shift. Unlike freeform practice, this
 * deliberately never allows retrying a call once it's answered — a real
 * shift doesn't let you rewind a call that already happened, and that
 * pressure (one shot, no do-overs) is the whole point of Shift mode.
 */
export async function submitShiftAnswer(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const shiftId = formData.get("shiftId");
  const scenarioId = formData.get("scenarioId");
  const choiceId = formData.get("choiceId");

  if (typeof shiftId !== "string" || !shiftId) {
    throw new Error("Missing shiftId.");
  }
  if (typeof scenarioId !== "string" || !scenarioId) {
    throw new Error("Missing scenarioId.");
  }
  if (typeof choiceId !== "string" || !choiceId) {
    throw new Error("Pick an answer before submitting.");
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { attempts: true },
  });
  if (!shift || shift.userId !== activeUser.id) {
    throw new Error("Shift not found.");
  }

  // The current call is always derived from how many attempts already
  // exist for this shift, never a stored position — see the schema
  // comment on Shift for why. This also doubles as the anti-replay
  // check: submitting for any scenario other than the one actually next
  // in queue (an already-answered call, or one further down the line)
  // is rejected outright.
  const currentIndex = shift.attempts.length;
  const expectedScenarioId = shift.scenarioIds[currentIndex];
  if (!expectedScenarioId || expectedScenarioId !== scenarioId) {
    throw new Error("This call isn't the current one in the shift — no retries mid-shift.");
  }

  const choice = await prisma.trainingChoice.findUnique({ where: { id: choiceId } });
  if (!choice || choice.scenarioId !== scenarioId) {
    throw new Error("That answer doesn't belong to this call.");
  }

  const isLastCall = currentIndex + 1 === shift.scenarioIds.length;

  await prisma.$transaction([
    prisma.trainingAttempt.create({
      data: {
        userId: activeUser.id,
        scenarioId,
        choiceId,
        wasCorrect: choice.isCorrect,
        shiftId,
      },
    }),
    ...(isLastCall
      ? [prisma.shift.update({ where: { id: shiftId }, data: { completedAt: new Date() } })]
      : []),
  ]);

  redirect(`/shift/${shiftId}?answered=${choiceId}`);
}
