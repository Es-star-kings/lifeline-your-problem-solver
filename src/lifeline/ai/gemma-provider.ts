import type {
  LifelineActionStep,
  LifelineAnalysis,
  LifelineDomain,
  LifelineResource,
  LifelineSuggestedTool,
  LifelineUrgency,
} from "../types";
import { normalizeAnalysis } from "./schema";
import {
  AIProviderError,
  type LifelineAIContext,
  type LifelineAIProvider,
} from "./provider";
import { AIServiceError, generateAIResponse, isAIConfigured } from "@/lib/ai/ai-client";

const DOMAINS: LifelineDomain[] = [
  "education",
  "healthcare",
  "agriculture",
  "productivity",
  "community",
  "general",
];
const URGENCIES: LifelineUrgency[] = ["low", "medium", "high"];

const SYSTEM_PROMPT = `You are LIFELINE, an adaptive personal and community problem-solving assistant powered by Gemma.

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
- Return a structured JSON object with these fields:
  - category: "education" | "healthcare" | "agriculture" | "productivity" | "community" | "general"
  - problemSummary: string
  - userIntent: string
  - urgency: "low" | "medium" | "high"
  - explanation: string
  - actionPlan: array of objects with title, description, optional timeframe, optional status
  - suggestedTools: array of objects with type, title, description
  - followUpQuestions: array of strings
  - resources: array of objects with title, description, optional kind, optional locationHint
  - safetyNote: optional string
- Prefer 3-5 action steps and 2-4 suggested tools when appropriate.
- Use the category field for the primary domain, and keep the user-facing fields plain language.

Return ONLY a single JSON object, no prose, no markdown fences.`;

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
  return DOMAINS.includes(v as LifelineDomain) ? (v as LifelineDomain) : "general";
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
        id: `${stepNum}-${i}`,
        step: stepNum,
        title: title || `Step ${stepNum}`,
        description: description || title,
        timeframe: typeof r.timeframe === "string" ? r.timeframe : undefined,
        status: r.status === "completed" || r.status === "in_progress" ? r.status : "pending",
      };
    })
    .filter((s): s is LifelineActionStep => s !== null);
}

function coerceSuggestedTools(v: unknown): LifelineSuggestedTool[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw, i): LifelineSuggestedTool | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = pickString(r.title).trim();
      const description = pickString(r.description).trim();
      const type = pickString(r.type).trim();
      if (!title || !description || !type) return null;
      return {
        id: `${type}-${i}`,
        type,
        title,
        description,
      };
    })
    .filter((s): s is LifelineSuggestedTool => s !== null);
}

function coerceResources(v: unknown): LifelineResource[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw, i): LifelineResource | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = pickString(r.title).trim();
      const description = pickString(r.description).trim();
      if (!title || !description) return null;
      return {
        id: `${i}-${title}`,
        title,
        description,
        kind: (r.kind as LifelineResource["kind"]) ?? "resource",
        locationHint: typeof r.locationHint === "string" ? r.locationHint : undefined,
      };
    })
    .filter((s): s is LifelineResource => s !== null);
}

function validate(raw: unknown): LifelineAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new AIProviderError("Gemma response is not an object");
  }

  const r = raw as Record<string, unknown>;
  const summary = pickString(r.problemSummary).trim();
  const explanation = pickString(r.explanation).trim();
  if (!summary || !explanation) {
    throw new AIProviderError("Gemma response missing summary/explanation");
  }

  return normalizeAnalysis({
    category: coerceDomain(r.category ?? r.domain),
    domain: coerceDomain(r.domain ?? r.category),
    problemSummary: summary,
    userIntent: pickString(r.userIntent, "Understand the problem and plan the next step.").trim(),
    urgency: coerceUrgency(r.urgency),
    explanation,
    actionPlan: coerceActionPlan(r.actionPlan),
    suggestedTools: coerceSuggestedTools(r.suggestedTools),
    followUpQuestions: Array.isArray(r.followUpQuestions)
      ? r.followUpQuestions.map((q) => pickString(q).trim()).filter((q) => q.length > 0)
      : [],
    resources: coerceResources(r.resources),
    safetyNote: pickString(r.safetyNote).trim() || undefined,
  });
}

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
      if (err instanceof AIServiceError) {
        throw new AIProviderError(err.message, err);
      }
      throw new AIProviderError("Could not reach AI service", err);
    }

    return validate(extractJson(text));
  },
};
