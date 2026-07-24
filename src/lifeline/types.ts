export type ProblemCategory =
  "education" | "healthcare" | "agriculture" | "productivity" | "community" | "general";

export type LifelineDomain = ProblemCategory;
export type LifelineCategory = ProblemCategory;

export type ProblemUrgency = "low" | "medium" | "high";
export type LifelineUrgency = ProblemUrgency;

export type ProblemStepStatus = "pending" | "in_progress" | "completed";
export type LifelineStepStatus = ProblemStepStatus;

export type SuggestedToolType =
  | "notes"
  | "quiz"
  | "scenarios"
  | "explanation"
  | "study_plan"
  | "checklist"
  | "project_plan"
  | "resource_finder";
export type ProblemResourceKind = "resource" | "service" | "location";

export interface ActionPlanStep {
  id: string;
  step: number;
  title: string;
  description: string;
  timeframe?: string;
  status: ProblemStepStatus;
}

export type LifelineActionStep = ActionPlanStep;

export interface SuggestedTool {
  id: string;
  type: SuggestedToolType;
  title: string;
  description: string;
}

export type LifelineSuggestedTool = SuggestedTool;

export interface ProblemResource {
  id: string;
  title: string;
  description: string;
  kind: ProblemResourceKind;
  locationHint?: string;
}

export type LifelineResource = ProblemResource;

export interface StructuredProblemAnalysis {
  category: ProblemCategory;
  problemSummary: string;
  userIntent: string;
  urgency: ProblemUrgency;
  actionPlan: ActionPlanStep[];
  suggestedTools: SuggestedTool[];
  followUpQuestions: string[];
  resources: ProblemResource[];
  domain?: ProblemCategory;
  explanation?: string;
  safetyNote?: string;
}

export interface LifelineAnalysis extends StructuredProblemAnalysis {
  domain: LifelineDomain;
  explanation: string;
}

export interface LifelineCase {
  id: string;
  createdAt: string;
  input: string;
  analysis: LifelineAnalysis;
}

export type SituationStatus = "active" | "monitoring" | "resolved";

export interface SituationObservation {
  id: string;
  content: string;
  createdAt: string;
  source: "user" | "lifeline";
}

export interface LifelineSituation {
  id: string;
  title: string;
  input: string;
  analysis: LifelineAnalysis;
  observations: SituationObservation[];
  status: SituationStatus;
  createdAt: string;
  updatedAt: string;
}
