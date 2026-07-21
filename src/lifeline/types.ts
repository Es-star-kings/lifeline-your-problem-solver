export type LifelineDomain =
  | "education"
  | "healthcare"
  | "agriculture"
  | "productivity"
  | "community";

export type LifelineUrgency = "low" | "medium" | "high";

export interface LifelineActionStep {
  step: number;
  title: string;
  description: string;
}

export interface LifelineAnalysis {
  domain: LifelineDomain;
  problemSummary: string;
  urgency: LifelineUrgency;
  explanation: string;
  actionPlan: LifelineActionStep[];
  followUpQuestions: string[];
  safetyNote?: string;
}

export interface LifelineCase {
  id: string;
  createdAt: string;
  input: string;
  analysis: LifelineAnalysis;
}