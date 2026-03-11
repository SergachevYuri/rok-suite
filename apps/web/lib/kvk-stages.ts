// KvK stage progression — easy to adjust names/instructions later

export interface KvkStage {
  stage: number;
  name: string;
  instructions: string;
  /** Which zone number's fort drops to show in the panel */
  zoneNumber: number;
}

export const KVK_STAGES: KvkStage[] = [
  { stage: 1, name: 'Plan Zone 4',    instructions: 'Set building targets. Plan fort drops for zone 4 regions.', zoneNumber: 4 },
  { stage: 2, name: 'Zone 4 Opens',   instructions: 'Execute zone 4 fort drops. Update statuses as alliances land.', zoneNumber: 4 },
  { stage: 3, name: 'Plan Zone 5',    instructions: 'Plan fort drops for zone 5 regions.', zoneNumber: 5 },
  { stage: 4, name: 'Zone 5 Opens',   instructions: 'Execute zone 5 plans. Update statuses.', zoneNumber: 5 },
  { stage: 5, name: 'Plan Zone 6',    instructions: 'Plan fort drops for zone 6 regions.', zoneNumber: 6 },
  { stage: 6, name: 'Zone 6 Opens',   instructions: 'Execute zone 6 plans. Update statuses.', zoneNumber: 6 },
  { stage: 7, name: "King's Land",    instructions: 'Plan the final push for the Ziggurat.', zoneNumber: 7 },
];

export function getStage(stageNumber: number): KvkStage {
  return KVK_STAGES.find(s => s.stage === stageNumber) || KVK_STAGES[0];
}
