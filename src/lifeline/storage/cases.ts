import type { LifelineCase } from "../types";

export interface CaseStore {
  list(): Promise<LifelineCase[]>;
  save(c: LifelineCase): Promise<void>;
  remove(id: string): Promise<void>;
}

export const memoryCaseStore: CaseStore = {
  async list() {
    return [];
  },
  async save() {},
  async remove() {},
};
