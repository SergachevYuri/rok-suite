// KvK stage progression — easy to adjust names/instructions later

export interface KvkStage {
  stage: number;
  name: string;
  instructions: string;
  /** Which zone number's fort drops to show in the panel */
  zoneNumber: number;
}

export const KVK_STAGES: KvkStage[] = [
  { stage: 1, name: 'Pre-Planning',   instructions: 'Set building targets in the grid. Plan fort drops for zone 4 regions.', zoneNumber: 4 },
  { stage: 2, name: 'Zone 4 Opens',   instructions: 'Execute zone 4 fort drops. Update statuses as alliances land.', zoneNumber: 4 },
  { stage: 3, name: 'Plan Zone 3',    instructions: 'Plan fort drops for zone 3 regions.', zoneNumber: 3 },
  { stage: 4, name: 'Zone 3 Opens',   instructions: 'Execute zone 3 plans. Update statuses.', zoneNumber: 3 },
  { stage: 5, name: 'Plan Zone 2',    instructions: 'Plan fort drops for zone 2 regions.', zoneNumber: 2 },
  { stage: 6, name: 'Zone 2 Opens',   instructions: 'Execute zone 2 plans. Update statuses.', zoneNumber: 2 },
  { stage: 7, name: "King's Land",    instructions: 'Plan the final push for the Ziggurat.', zoneNumber: 1 },
];

export function getStage(stageNumber: number): KvkStage {
  return KVK_STAGES.find(s => s.stage === stageNumber) || KVK_STAGES[0];
}
