export type LifelineDomain =
  | "education"
  | "healthcare"
  | "agriculture"
  | "productivity"
  | "community"
  | "general";

export type LifelineCategory = LifelineDomain;
export type LifelineUrgency = "low" | "medium" | "high";
export type LifelineStepStatus = "pending" | "in_progress" | "completed";

export interface LifelineActionStep {
  id: string;
  step: number;
  title: string;
  description: string;
  timeframe?: string;
  status: LifelineStepStatus;
}

export interface LifelineSuggestedTool {
  id: string;
  type: string;
  title: string;
  description: string;
}

export interface LifelineResource {
  id: string;
  title: string;
  description: string;
  kind: "resource" | "service" | "location";
  locationHint?: string;
}

export interface LifelineAnalysis {
  category: LifelineCategory;
  domain: LifelineDomain;
  problemSummary: string;
  userIntent: string;
  urgency: LifelineUrgency;
  explanation: string;
  actionPlan: LifelineActionStep[];
  suggestedTools: LifelineSuggestedTool[];
  followUpQuestions: string[];
  resources: LifelineResource[];
  safetyNote?: string;
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
