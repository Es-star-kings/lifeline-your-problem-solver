import { z } from "zod";
import type {
  ActionPlanStep,
  LifelineAnalysis,
  LifelineCategory,
  LifelineResource,
  LifelineSuggestedTool,
  LifelineUrgency,
  ProblemCategory,
  ProblemResource,
  ProblemUrgency,
  SuggestedTool,
} from "../types";

const problemCategories = [
  "education",
  "healthcare",
  "agriculture",
  "productivity",
  "community",
  "general",
] as const;

const suggestedToolTypes = [
  "notes",
  "quiz",
  "scenarios",
  "explanation",
  "study_plan",
  "checklist",
  "project_plan",
  "resource_finder",
] as const;
const resourceKinds = ["resource", "service", "location"] as const;
const stepStatuses = ["pending", "in_progress", "completed"] as const;

export const problemCategorySchema = z.enum(problemCategories);
export const problemUrgencySchema = z.enum(["low", "medium", "high"]);
export const problemStepStatusSchema = z.enum(stepStatuses);
export const suggestedToolTypeSchema = z.enum(suggestedToolTypes);
export const problemResourceKindSchema = z.enum(resourceKinds);

export const lifelineDomainSchema = problemCategorySchema;
export const lifelineUrgencySchema = problemUrgencySchema;
export const lifelineStepStatusSchema = problemStepStatusSchema;

export const actionPlanStepSchema = z.object({
  step: z.number().int().positive().optional(),
  id: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(400),
  timeframe: z.string().trim().max(80).optional(),
  status: problemStepStatusSchema.optional().default("pending"),
});

export const suggestedToolSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: suggestedToolTypeSchema.default("explanation"),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(220),
});

export const problemResourceSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  kind: problemResourceKindSchema.optional().default("resource"),
  locationHint: z.string().trim().max(140).optional(),
});

export const structuredProblemAnalysisSchema = z.object({
  category: problemCategorySchema.default("general"),
  problemSummary: z.string().trim().min(1).max(400),
  userIntent: z
    .string()
    .trim()
    .min(1)
    .max(260)
    .default("Understand the problem and find the next useful step."),
  urgency: problemUrgencySchema.default("medium"),
  actionPlan: z.array(actionPlanStepSchema).min(1).max(8).default([]),
  suggestedTools: z.array(suggestedToolSchema).default([]),
  followUpQuestions: z.array(z.string().trim().min(1).max(220)).default([]),
  resources: z.array(problemResourceSchema).default([]),
  domain: problemCategorySchema.optional(),
  explanation: z.string().trim().max(800).optional(),
  safetyNote: z.string().trim().max(400).optional(),
});

export const lifelineAnalysisSchema = structuredProblemAnalysisSchema;

export type StructuredProblemAnalysisSchema = z.infer<typeof structuredProblemAnalysisSchema>;
export type ActionPlanStepSchema = z.infer<typeof actionPlanStepSchema>;
export type SuggestedToolSchema = z.infer<typeof suggestedToolSchema>;
export type ProblemResourceSchema = z.infer<typeof problemResourceSchema>;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStep(step: ActionPlanStepSchema, index: number): ActionPlanStep {
  return {
    step: step.step ?? index + 1,
    id: step.id ?? createId("step"),
    title: step.title,
    description: step.description,
    timeframe: step.timeframe,
    status: step.status ?? "pending",
  };
}

function normalizeTool(tool: SuggestedToolSchema): SuggestedTool {
  return {
    id: tool.id ?? createId("tool"),
    type: tool.type,
    title: tool.title,
    description: tool.description,
  };
}

function normalizeResource(resource: ProblemResourceSchema): ProblemResource {
  return {
    id: resource.id ?? createId("resource"),
    title: resource.title,
    description: resource.description,
    kind: resource.kind ?? "resource",
    locationHint: resource.locationHint,
  };
}

export function normalizeAnalysis(raw: unknown): LifelineAnalysis {
  const parsed = structuredProblemAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid AI analysis schema");
  }

  const value = parsed.data;
  const category = (value.category ?? value.domain ?? "general") as ProblemCategory;
  const domain = (value.domain ?? category) as LifelineCategory;
  return {
    category,
    domain,
    problemSummary: value.problemSummary,
    userIntent: value.userIntent,
    urgency: value.urgency as LifelineUrgency,
    explanation: value.explanation ?? value.problemSummary,
    actionPlan: value.actionPlan.map((step, index) => normalizeStep(step, index)),
    suggestedTools: value.suggestedTools.map((tool) => normalizeTool(tool)),
    followUpQuestions: value.followUpQuestions,
    resources: value.resources.map((resource) => normalizeResource(resource)),
    safetyNote: value.safetyNote,
  };
}
