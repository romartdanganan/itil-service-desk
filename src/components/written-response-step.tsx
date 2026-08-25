import { submitWrittenAnswer } from "@/src/actions/training";
import { SubmitButton } from "@/src/components/submit-button";

// A second, separate step from TrainingCall above, shown only after that
// component's multiple-choice reveal: not "what would you do" but "how
// would you explain it to the caller", graded by an LLM instead of
// matched against a fixed correct answer (see
// src/lib/grade-written-answer.ts). Kept as its own component rather than
// folded into TrainingCall so Shift Mode, which reuses TrainingCall but
// doesn't include this step, is untouched by any of this.

export function WrittenResponseStep({
  writtenPrompt,
  attemptId,
  response,
}: {
  writtenPrompt: string;
  attemptId: string;
  response?: {
    answer: string;
    score: number;
    strengths: string;
    improvements: string;
    exemplarAnswer: string | null;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        Now explain it to the caller
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{writtenPrompt}</p>

      {!response ? (
        <form action={submitWrittenAnswer} className="flex flex-col gap-3">
          <input type="hidden" name="attemptId" value={attemptId} />
          <textarea
            name="answer"
            required
            rows={4}
            placeholder="Write what you'd actually say..."
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
          <SubmitButton
            pendingText="Getting feedback..."
            className="self-start rounded-full border border-black/10 px-5 py-2 text-sm font-medium transition-colors hover:border-black/20 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-zinc-800"
          >
            Get feedback
          </SubmitButton>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50">
            {response.answer}
          </p>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/40">
            <p className="font-semibold text-blue-900 dark:text-blue-300">
              Score: {response.score} / 5
            </p>
            <p className="mt-2 text-blue-800 dark:text-blue-400">
              <span className="font-medium">What worked: </span>
              {response.strengths}
            </p>
            <p className="mt-1 text-blue-800 dark:text-blue-400">
              <span className="font-medium">Try this next time: </span>
              {response.improvements}
            </p>
          </div>
          {response.exemplarAnswer && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="font-semibold text-emerald-900 dark:text-emerald-300">
                A strong answer would sound like
              </p>
              <p className="mt-1 whitespace-pre-wrap text-emerald-800 dark:text-emerald-400">
                {response.exemplarAnswer}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
