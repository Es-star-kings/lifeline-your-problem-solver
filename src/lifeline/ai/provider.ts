import type { LifelineAnalysis } from "../types";

/**
 * AI provider abstraction. A concrete implementation (e.g. Gemma via
 * Lovable AI Gateway, or an on-device runtime) can be plugged in later
 * without changing UI code.
 */
export interface LifelineAIProvider {
  name: string;
  analyzeProblem(input: string, signal?: AbortSignal): Promise<LifelineAnalysis>;
}

/**
 * Placeholder provider used until Gemma is wired up. Returns a plausible
 * shaped response so the UI can render the full experience end-to-end.
 */
export const placeholderProvider: LifelineAIProvider = {
  name: "placeholder",
  async analyzeProblem(input: string): Promise<LifelineAnalysis> {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      domain: "productivity",
      problemSummary: input.slice(0, 140),
      urgency: "medium",
      explanation:
        "This is a placeholder analysis. Once the Gemma provider is connected, LIFELINE will produce a real, domain-aware understanding of the situation here.",
      actionPlan: [
        {
          step: 1,
          title: "Clarify the problem",
          description: "Write down what you already know and what's uncertain.",
        },
        {
          step: 2,
          title: "Identify constraints",
          description: "Note time, resources, and people involved.",
        },
        {
          step: 3,
          title: "Take one concrete action",
          description: "Pick the smallest useful next step and do it today.",
        },
      ],
      followUpQuestions: [
        "What have you already tried?",
        "When does this need to be resolved?",
        "Who else is affected?",
      ],
    };
  },
};