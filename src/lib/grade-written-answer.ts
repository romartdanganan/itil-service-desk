import "server-only";

// Grades a trainee's written answer with a real LLM instead of keyword
// matching, since "is this explanation clear and complete" is a judgment
// call, not a pattern match. Uses the Gemini API directly over fetch, no
// SDK, so this whole feature is one plain HTTP call, easy to read end to
// end. Gemini specifically (not Claude/OpenAI) because it has a genuinely
// free tier, no credit card, which matters for a project meant to be
// clonable and runnable by anyone without a bill attached.

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type WrittenGrade = {
  score: number;
  strengths: string;
  improvements: string;
};

type GradeScenarioContext = {
  title: string;
  category: string;
  correctChoiceText: string;
  correctChoiceExplanation: string;
  resolutionSteps: string;
  writtenPrompt: string;
};

function buildPrompt(scenario: GradeScenarioContext, answer: string): string {
  return `You are grading a trainee IT service desk agent's written answer in a practice tool. This is a training exercise, not a real support ticket.

Scenario: ${scenario.title} (category: ${scenario.category})
The correct first diagnostic step was: ${scenario.correctChoiceText}
Why that's correct: ${scenario.correctChoiceExplanation}
What actually resolved the issue: ${scenario.resolutionSteps}

The trainee was asked: ${scenario.writtenPrompt}

The trainee wrote:
"""
${answer}
"""

Grade this as a piece of customer-facing writing from a support agent. Judge clarity, accuracy against the facts above, completeness (does it explain what happened and what was done, in terms a non-technical caller could follow), and tone (professional, reassuring, not condescending). Do not penalize the trainee for skipping technical jargon, plain language is the goal, not a flaw.

Give a score from 1 to 5 (5 is excellent, publish-ready; 1 is confusing or inaccurate), one short sentence naming a genuine strength, and one short sentence naming the single most useful thing to improve. Keep both sentences specific to what was actually written, not generic advice.`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: 5 },
    strengths: { type: "string" },
    improvements: { type: "string" },
  },
  required: ["score", "strengths", "improvements"],
};

export async function gradeWrittenAnswer(
  scenario: GradeScenarioContext,
  answer: string,
): Promise<WrittenGrade> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Written-answer grading isn't configured. Add GEMINI_API_KEY to .env (see .env.example) to enable it.",
    );
  }

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(scenario, answer) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Grading request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Grading response didn't come back in the expected shape.");
  }

  const parsed = JSON.parse(text);
  if (
    typeof parsed.score !== "number" ||
    typeof parsed.strengths !== "string" ||
    typeof parsed.improvements !== "string"
  ) {
    throw new Error("Grading response was missing expected fields.");
  }

  return {
    score: Math.max(1, Math.min(5, Math.round(parsed.score))),
    strengths: parsed.strengths,
    improvements: parsed.improvements,
  };
}
