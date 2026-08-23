"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";

/**
 * Record one attempt at a training scenario and redirect back to the
 * scenario page with the chosen answer in the URL (`?answered=<choiceId>`)
 * so the page can re-render showing the reveal — correct/incorrect for
 * that specific choice, plus the actual resolution. Using a query param
 * for this (rather than component state) keeps the whole feature
 * server-rendered with no client-side JavaScript, same as the rest of
 * the app.
 */
export async function submitTrainingAnswer(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const scenarioId = formData.get("scenarioId");
  const choiceId = formData.get("choiceId");

  if (typeof scenarioId !== "string" || scenarioId.length === 0) {
    throw new Error("Missing scenarioId.");
  }
  if (typeof choiceId !== "string" || choiceId.length === 0) {
    // The form doesn't submit without a radio selected in a normal
    // browser, but nothing stops a raw POST from omitting it.
    throw new Error("Pick an answer before submitting.");
  }

  const choice = await prisma.trainingChoice.findUnique({ where: { id: choiceId } });
  if (!choice || choice.scenarioId !== scenarioId) {
    throw new Error("That answer doesn't belong to this scenario.");
  }

  await prisma.trainingAttempt.create({
    data: {
      userId: activeUser.id,
      scenarioId,
      choiceId,
      // Denormalized at attempt time — see the schema comment on
      // TrainingAttempt for why this isn't just read live off the choice.
      wasCorrect: choice.isCorrect,
    },
  });

  revalidatePath("/training");
  redirect(`/training/${scenarioId}?answered=${choiceId}`);
}
