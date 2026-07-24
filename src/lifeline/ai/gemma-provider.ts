import type {
  LifelineActionStep,
  LifelineAnalysis,
  LifelineDomain,
  LifelineUrgency,
} from "../types";
import {
  AIProviderError,
  type LifelineAIContext,
  type LifelineAIProvider,
} from "./provider";
import {
  AIServiceError,
  generateAIResponse,
  isAIConfigured,
} from "@/lib/ai/ai-client";

const DOMAINS: LifelineDomain[] = [
  "education",
  "healthcare",
  "agriculture",
  "productivity",
  "community",
];
const URGENCIES: LifelineUrgency[] = ["low", "medium", "high"];

const SYSTEM_PROMPT = `You are LIFELINE, an adaptive real-world problem-solving assistant powered by Gemma.

A person will describe a situation in their own words. It may be about learning,
health, farming, work, family, community — anything real. Do not force it into a
category. Understand what is actually happening and help them take a useful next
step.

Rules:
- Be practical, calm, and specific. No fluff, no motivational filler.
- Do not pretend to be a licensed doctor, lawyer, or other professional.
- If the situation sounds medically urgent, dangerous, or life-threatening,
  set urgency to "high" and add a clear safetyNote telling them to contact
  emergency services or a qualified professional now.
- If continuing an existing situation, take the previous analysis and prior
  observations into account and update your understanding.
- "domain" is internal metadata. Pick the single closest match; never mention
  the category to the user in your text fields.

Return ONLY a single JSON object, no prose, no markdown fences, matching:
{
  "domain": "education" | "healthcare" | "agriculture" | "productivity" | "community",
  "problemSummary": string,     // 1 short sentence, plain language
  "urgency": "low" | "medium" | "high",
  "explanation": string,        // 2-4 sentences, what's going on and why it matters
  "actionPlan": [               // 3-5 concrete steps, ordered
    { "step": number, "title": string, "description": string }
  ],
  "followUpQuestions": string[],// 2-4 questions that would sharpen the plan
  "safetyNote": string          // optional, only when urgency is high
}`;

function endpoint(): string | undefined {
  const raw = (import.meta.env.VITE_GEMMA_ENDPOINT as string | undefined)?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function model(): string {
  return (import.meta.env.VITE_GEMMA_MODEL as string | undefined)?.trim() || "gemma-3-4b-it";
}

function buildUserMessage(ctx: LifelineAIContext): string {
  if (ctx.situation && ctx.newObservation) {
    const priorObs = ctx.situation.observations.map((o, i) => `${i + 1}. ${o.content}`).join("\n");
    return [
      `Original situation: ${ctx.situation.input}`,
      `Previous understanding: ${ctx.situation.analysis.problemSummary}`,
      `Previous explanation: ${ctx.situation.analysis.explanation}`,
      priorObs ? `Prior observations:\n${priorObs}` : "",
      `New observation from the user: ${ctx.newObservation}`,
      `Update the analysis given this new information.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return ctx.input;
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AIProviderError("Gemma returned non-JSON output");
  }
}

function pickString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function coerceDomain(v: unknown): LifelineDomain {
  return DOMAINS.includes(v as LifelineDomain) ? (v as LifelineDomain) : "productivity";
}

function coerceUrgency(v: unknown): LifelineUrgency {
  return URGENCIES.includes(v as LifelineUrgency) ? (v as LifelineUrgency) : "medium";
}

function coerceActionPlan(v: unknown): LifelineActionStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw, i): LifelineActionStep | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = pickString(r.title).trim();
      const description = pickString(r.description).trim();
      if (!title && !description) return null;
      const stepNum = typeof r.step === "number" ? r.step : i + 1;
      return {
        step: stepNum,
        title: title || `Step ${stepNum}`,
        description: description || title,
      };
    })
    .filter((s): s is LifelineActionStep => s !== null);
}

function validate(raw: unknown): LifelineAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new AIProviderError("Gemma response is not an object");
  }
  const r = raw as Record<string, unknown>;
  const actionPlan = coerceActionPlan(r.actionPlan);
  if (actionPlan.length === 0) {
    throw new AIProviderError("Gemma response missing actionPlan");
  }
  const summary = pickString(r.problemSummary).trim();
  const explanation = pickString(r.explanation).trim();
  if (!summary || !explanation) {
    throw new AIProviderError("Gemma response missing summary/explanation");
  }
  const followUps = Array.isArray(r.followUpQuestions)
    ? r.followUpQuestions.map((q) => pickString(q).trim()).filter((q) => q.length > 0)
    : [];
  const safety = pickString(r.safetyNote).trim();
  return {
    domain: coerceDomain(r.domain),
    problemSummary: summary,
    urgency: coerceUrgency(r.urgency),
    explanation,
    actionPlan,
    followUpQuestions: followUps,
    safetyNote: safety.length > 0 ? safety : undefined,
  };
}

/**
 * Gemma provider. Talks to a server-side proxy at VITE_GEMMA_ENDPOINT that
 * holds the actual API credentials. The browser never sees a secret key.
 *
 * The proxy is expected to accept an OpenAI-compatible chat completions
 * body and return `{ choices: [{ message: { content: string } }] }`.
 */
export const gemmaProvider: LifelineAIProvider = {
  name: "Gemma",

  isAvailable() {
    return isAIConfigured();
  },

  async analyzeProblem(ctx, signal): Promise<LifelineAnalysis> {
    if (!isAIConfigured()) {
      throw new AIProviderError("Gemma endpoint is not configured");
    }

    let text: string;
    try {
      text = await generateAIResponse(buildUserMessage(ctx), {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 1024,
        signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
<<<<<<< HEAD
      throw new AIProviderError("Could not reach Gemma", err);
    }

    if (!res.ok) {
      throw new AIProviderError(`Gemma request failed (${res.status})`);
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      throw new AIProviderError("Gemma returned invalid JSON envelope", err);
    }

    const p = payload as {
      choices?: Array<{ message?: { content?: string } }>;
      content?: string;
      text?: string;
    };
    const text = p.choices?.[0]?.message?.content ?? p.content ?? p.text ?? "";
    if (!text) {
      throw new AIProviderError("Gemma returned empty content");
=======
      if (err instanceof AIServiceError) {
        throw new AIProviderError(err.message, err);
      }
      throw new AIProviderError("Could not reach AI service", err);
>>>>>>> 247a0eca7d223abd65bfe50ff348dbabaa4c7f71
    }

    return validate(extractJson(text));
  },
};
