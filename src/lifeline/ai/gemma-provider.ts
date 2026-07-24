import type { LifelineAnalysis, LifelineDomain, LifelineUrgency } from "../types";
import { normalizeAnalysis, structuredProblemAnalysisSchema } from "./schema";
import { AIProviderError, type LifelineAIContext, type LifelineAIProvider } from "./provider";
import { AIServiceError, generateAIResponse, isAIConfigured } from "@/lib/ai/ai-client";
import { offlineProvider } from "./offline-provider";

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
- Return a single JSON object and nothing else. No markdown fences, no prose,
  no explanation outside the JSON.
- Match this exact schema:
  {
    "category": "education | healthcare | agriculture | productivity | community | general",
    "problemSummary": "A concise explanation of the user's actual problem",
    "userIntent": "What the user is trying to achieve",
    "urgency": "low | medium | high",
    "actionPlan": [
      {
        "id": "unique-id",
        "title": "Action step",
        "description": "What the user should do",
        "timeframe": "Optional timeframe",
        "status": "pending"
      }
    ],
    "suggestedTools": [
      {
        "id": "unique-id",
        "type":
        "notes | quiz | scenarios | explanation | study_plan | checklist | project_plan | resource_finder",
        "title": "Tool title",
        "description": "What this tool does"
      }
    ],
    "followUpQuestions": [],
    "resources": []
  }
- Prefer 3-5 action steps and 2-4 suggested tools when appropriate.
- Use the category field for the primary domain, and keep the user-facing fields plain language.
- Ensure every actionPlan item has an id string and status set to "pending".
- Ensure every suggestedTools item has a type from the allowed list.`;

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

function buildFallbackAnalysis(ctx: LifelineAIContext): LifelineAnalysis {
  const summary =
    ctx.input.trim() || "The user described a situation that needs practical guidance.";
  return normalizeAnalysis({
    category: "general",
    domain: "general",
    problemSummary: summary.slice(0, 240),
    userIntent: "Understand the problem and identify the next helpful action.",
    urgency: "medium",
    explanation:
      "The AI response did not arrive in the expected structured format, so a concise " +
      "fallback analysis was generated to keep the workflow moving.",
    actionPlan: [
      {
        id: "fallback-step-1",
        title: "Clarify the issue",
        description: "Write down the specific problem and what you have already tried.",
        timeframe: "Today",
        status: "pending",
      },
    ],
    suggestedTools: [],
    followUpQuestions: ["What is the most important part of this problem to solve first?"],
    resources: [],
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
      console.warn("Gemma request failed, falling back to offline analysis", err);
      return offlineProvider.analyzeProblem(ctx, signal);
    }

    try {
      const parsed = extractJson(text);
      const validation = structuredProblemAnalysisSchema.safeParse(parsed);

      if (!validation.success) {
        console.warn("Gemma returned invalid structured output", validation.error.flatten());
        return offlineProvider.analyzeProblem(ctx, signal);
      }

      return normalizeAnalysis(validation.data);
    } catch (error) {
      console.warn("Falling back to plain-text-compatible analysis", error);
      return buildFallbackAnalysis(ctx);
    }
  },
};
