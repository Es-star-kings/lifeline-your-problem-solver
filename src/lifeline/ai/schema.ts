import { z } from "zod";
import type {
  LifelineActionStep,
  LifelineAnalysis,
  LifelineCategory,
  LifelineResource,
  LifelineSuggestedTool,
  LifelineUrgency,
} from "../types";

const lifelineDomains = [
  "education",
  "healthcare",
  "agriculture",
  "productivity",
  "community",
  "general",
] as const;

export const lifelineDomainSchema = z.enum(lifelineDomains);
export const lifelineUrgencySchema = z.enum(["low", "medium", "high"]);
export const lifelineStepStatusSchema = z.enum(["pending", "in_progress", "completed"]);

export const lifelineActionStepSchema = z.object({
  step: z.number().int().positive().optional(),
  id: z.string().min(1).optional(),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  timeframe: z.string().max(80).optional(),
  status: lifelineStepStatusSchema.optional().default("pending"),
});

export const lifelineSuggestedToolSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(220),
});

export const lifelineResourceSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(240),
  kind: z.enum(["resource", "service", "location"]).optional().default("resource"),
  locationHint: z.string().max(140).optional(),
});

export const lifelineAnalysisSchema = z.object({
  category: lifelineDomainSchema.optional(),
  domain: lifelineDomainSchema.optional(),
  problemSummary: z.string().min(1).max(400),
  userIntent: z.string().min(1).max(260).optional(),
  urgency: lifelineUrgencySchema.optional().default("medium"),
  explanation: z.string().min(1).max(800).optional(),
  actionPlan: z.array(lifelineActionStepSchema).min(1).max(8).optional().default([]),
  suggestedTools: z.array(lifelineSuggestedToolSchema).optional().default([]),
  followUpQuestions: z.array(z.string().min(1).max(220)).optional().default([]),
  resources: z.array(lifelineResourceSchema).optional().default([]),
  safetyNote: z.string().max(400).optional(),
});

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStep(step: z.infer<typeof lifelineActionStepSchema>, index: number): LifelineActionStep {
  return {
    step: step.step ?? index + 1,
    id: step.id ?? createId("step"),
    title: step.title,
    description: step.description,
    timeframe: step.timeframe,
    status: step.status ?? "pending",
  };
}

function normalizeTool(tool: z.infer<typeof lifelineSuggestedToolSchema>, index: number): LifelineSuggestedTool {
  return {
    id: tool.id ?? createId("tool"),
    type: tool.type,
    title: tool.title,
    description: tool.description,
  };
}

function normalizeResource(resource: z.infer<typeof lifelineResourceSchema>, index: number): LifelineResource {
  return {
    id: resource.id ?? createId("resource"),
    title: resource.title,
    description: resource.description,
    kind: resource.kind ?? "resource",
    locationHint: resource.locationHint,
  };
}

export function normalizeAnalysis(raw: unknown): LifelineAnalysis {
  const parsed = lifelineAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid AI analysis schema");
  }

  const value = parsed.data;
  const domain = (value.category ?? value.domain ?? "general") as LifelineCategory;
  return {
    category: domain,
    domain,
    problemSummary: value.problemSummary,
    userIntent: value.userIntent ?? "Understand the problem and find the next useful step.",
    urgency: value.urgency as LifelineUrgency,
    explanation: value.explanation ?? value.problemSummary,
    actionPlan: value.actionPlan.map((step, index) => normalizeStep(step, index)),
    suggestedTools: value.suggestedTools.map((tool, index) => normalizeTool(tool, index)),
    followUpQuestions: value.followUpQuestions,
    resources: value.resources.map((resource, index) => normalizeResource(resource, index)),
    safetyNote: value.safetyNote,
  };
}
