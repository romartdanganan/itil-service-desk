"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { gradeWrittenAnswer } from "@/src/lib/grade-written-answer";

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

  const attempt = await prisma.trainingAttempt.create({
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
  // `attempt` in the URL is what the written-response step (if this
  // scenario has one) hooks onto: a scenario can have several past
  // attempts from retrying, so the choiceId alone can't tell the page
  // which one is "the current call" to attach a written answer to.
  redirect(`/training/${scenarioId}?answered=${choiceId}&attempt=${attempt.id}`);
}

/**
 * Grade a written follow-up answer for the current call and attach it to
 * the same TrainingAttempt. Optional, not a gate: nothing stops a trainee
 * from skipping straight to the next call without writing anything.
 */
export async function submitWrittenAnswer(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const attemptId = formData.get("attemptId");
  const answer = formData.get("answer");

  if (typeof attemptId !== "string" || attemptId.length === 0) {
    throw new Error("Missing attemptId.");
  }
  if (typeof answer !== "string" || answer.trim().length === 0) {
    throw new Error("Write an answer before submitting.");
  }

  const attempt = await prisma.trainingAttempt.findUnique({
    where: { id: attemptId },
    include: {
      choice: true,
      scenario: { include: { choices: true } },
      writtenResponse: true,
    },
  });
  if (!attempt || attempt.userId !== activeUser.id) {
    throw new Error("Attempt not found.");
  }
  if (attempt.writtenResponse) {
    throw new Error("This call's written answer has already been graded.");
  }
  if (!attempt.scenario.writtenPrompt) {
    throw new Error("This scenario doesn't have a written exercise.");
  }

  const correctChoice = attempt.scenario.choices.find((c) => c.isCorrect);
  const grade = await gradeWrittenAnswer(
    {
      title: attempt.scenario.title,
      category: attempt.scenario.category,
      correctChoiceText: correctChoice?.text ?? attempt.choice.text,
      correctChoiceExplanation: correctChoice?.explanation ?? attempt.choice.explanation,
      resolutionSteps: attempt.scenario.resolutionSteps,
      writtenPrompt: attempt.scenario.writtenPrompt,
    },
    answer.trim(),
  );

  await prisma.writtenResponse.create({
    data: {
      attemptId,
      answer: answer.trim(),
      score: grade.score,
      strengths: grade.strengths,
      improvements: grade.improvements,
    },
  });

  revalidatePath(`/training/${attempt.scenarioId}`);
}
