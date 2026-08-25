import "server-only";

// Grades a trainee's written answer with a real LLM instead of keyword
// matching, since "is this explanation clear and complete" is a judgment
// call, not a pattern match. Uses the Gemini API directly over fetch, no
// SDK, so this whole feature is one plain HTTP call, easy to read end to
// end. Gemini specifically (not Claude/OpenAI) because it has a genuinely
// free tier, no credit card, which matters for a project meant to be
// clonable and runnable by anyone without a bill attached.

// flash-lite over flash: comparable grading quality in testing, noticeably
// faster, and this call is already the slowest thing in the app (an LLM
// round trip on a form submit), every bit of latency shaved off here
// matters more than it would elsewhere.
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type WrittenGrade = {
  score: number;
  strengths: string;
  improvements: string;
  exemplarAnswer: string;
};

type GradeChannel = "PHONE" | "EMAIL" | "CHAT";

type GradeScenarioContext = {
  title: string;
  category: string;
  channel: GradeChannel;
  correctChoiceText: string;
  correctChoiceExplanation: string;
  resolutionSteps: string;
  writtenPrompt: string;
};

// The grading criteria genuinely differ by channel, a phone explanation
// is spoken once and gone, an email is a written record the reader keeps
// (so it needs a real greeting/close and can afford to be thorough), and
// a chat reply lives or dies on being fast (a long, formal chat message
// is itself a mistake, not a sign of thoroughness). Sharing one rubric
// across all three would either grade emails too leniently on structure
// or grade chat replies too harshly for being short.
const CHANNEL_GRADING_CRITERIA: Record<GradeChannel, string> = {
  PHONE:
    "Grade this as something a support agent would say out loud on a phone call. Judge clarity, accuracy against the facts above, completeness (does it explain what happened and what was done, in terms a non-technical caller could follow), and tone (professional, reassuring, not condescending). Do not penalize the trainee for skipping technical jargon, plain language is the goal, not a flaw.",
  EMAIL:
    "Grade this as a professional support email reply the customer will keep in their inbox. Judge clarity, accuracy against the facts above, completeness, a proper greeting and sign-off, and tone (professional, reassuring, not condescending). A missing greeting or sign-off, or a reply that reads like a text message rather than a written record, should cost points. Do not penalize the trainee for skipping technical jargon, plain language is the goal, not a flaw.",
  CHAT:
    "Grade this as a live chat reply, sent to someone waiting on the other end right now. Judge clarity, accuracy against the facts above, and whether it's appropriately short and immediately actionable. A long, formal, essay-style reply is a real flaw here, not a strength, chat calls for the fastest correct answer, not the most thorough one. A missing greeting or sign-off is NOT a flaw in chat, that would be the wrong standard for this channel. Do not penalize the trainee for skipping technical jargon, plain language is the goal, not a flaw.",
};

function buildPrompt(scenario: GradeScenarioContext, answer: string): string {
  return `You are grading a trainee IT service desk agent's written answer in a practice tool. This is a training exercise, not a real support ticket.

Scenario: ${scenario.title} (category: ${scenario.category}, channel: ${scenario.channel})
The correct first diagnostic step was: ${scenario.correctChoiceText}
Why that's correct: ${scenario.correctChoiceExplanation}
What actually resolved the issue: ${scenario.resolutionSteps}

The trainee was asked: ${scenario.writtenPrompt}

The trainee wrote:
"""
${answer}
"""

${CHANNEL_GRADING_CRITERIA[scenario.channel]}

Give a score from 1 to 5 (5 is excellent, publish-ready; 1 is confusing or inaccurate), one short sentence naming a genuine strength, one short sentence naming the single most useful thing to improve, and a short exemplar answer of your own, matching the length and format appropriate for this channel, that would score a 5, so the trainee has something concrete to compare their own answer against. Keep the strength and improvement sentences specific to what was actually written, not generic advice.`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: 5 },
    strengths: { type: "string" },
    improvements: { type: "string" },
    exemplarAnswer: { type: "string" },
  },
  required: ["score", "strengths", "improvements", "exemplarAnswer"],
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
    typeof parsed.improvements !== "string" ||
    typeof parsed.exemplarAnswer !== "string"
  ) {
    throw new Error("Grading response was missing expected fields.");
  }

  return {
    score: Math.max(1, Math.min(5, Math.round(parsed.score))),
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    exemplarAnswer: parsed.exemplarAnswer,
  };
}
