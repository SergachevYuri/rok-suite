// ─── Constants ──────────────────────────────────────────────────────

/** RoK KvK maps use a 1200×1200 coordinate grid (X: 0→1200, Y: 1200→0). */
export const GAME_MAP_SIZE = 1200;

// ─── Feature Types ──────────────────────────────────────────────────

export type FeatureType =
  | 'pass_4'
  | 'pass_5'
  | 'pass_6'
  | 'crusader_fortress'
  | 'crusader_camp'
  | 'hieron_steel'
  | 'hieron_thorns'
  | 'ancient_ruins'
  | 'circle_nature'
  | 'circle_vitality'
  | 'circle_courage'
  | 'circle_defense'
  | 'tempest_sanctuary'
  | 'altar_darkness'
  | 'ziggurat'
  | 'flag'
  | 'fortress';

export type MapStatus = 'draft' | 'base_complete' | 'planning' | 'active';

export type AssignmentStatus = 'planned' | 'contested' | 'occupied' | 'lost';

export type AllianceRole = 'top' | 'support';

export type AchievementScope = 'individual' | 'alliance' | 'kingdom';

export type RequirementType = 'occupy_count' | 'occupy_specific' | 'custom';

// ─── Database Row Types ─────────────────────────────────────────────

export interface KvkMap {
  id: string;
  name: string;
  kvk_type: string;
  season: string | null;
  image_path: string;
  image_width: number;
  image_height: number;
  symmetry_segments: number;
  symmetry_center_x: number;
  symmetry_center_y: number;
  status: MapStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KvkMapFeature {
  id: string;
  map_id: string;
  feature_type: FeatureType;
  name: string | null;
  x: number;
  y: number;
  level: number | null;
  zone: number | null;
  buff_name: string | null;
  buff_value: string | null;
  buff_description: string | null;
  metadata: Record<string, unknown>;
  is_template: boolean;
  template_segment: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KvkMapZone {
  id: string;
  map_id: string;
  zone_number: number;
  name: string | null;
  zone_type: 'zone' | 'starting_zone';
  polygon: [number, number][];
  color: string;
  opacity: number;
  created_at: string;
}

export interface KvkAlliance {
  id: string;
  map_id: string;
  tag: string;
  name: string;
  role: AllianceRole;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface KvkAssignment {
  id: string;
  map_id: string;
  feature_id: string;
  alliance_id: string;
  status: AssignmentStatus;
  priority: number;
  notes: string | null;
  assigned_by: string | null;
  assigned_at: string;
  updated_at: string;
}

export interface KvkAchievement {
  id: string;
  map_id: string;
  name: string;
  description: string | null;
  scope: AchievementScope;
  category: string | null;
  requirement_type: RequirementType;
  requirement_feature_type: string | null;
  requirement_count: number | null;
  requirement_details: Record<string, unknown>;
  reward_tier: number;
  reward_gems: number;
  reward_speedups_minutes: number;
  reward_gold_heads: number;
  reward_other: string | null;
  sort_order: number;
  created_at: string;
}

export interface KvkAchievementProgress {
  id: string;
  map_id: string;
  achievement_id: string;
  alliance_id: string | null;
  current_count: number;
  is_completed: boolean;
  notes: string | null;
  updated_at: string;
}

// ─── Auth ───────────────────────────────────────────────────────────

export type WarRoomRole = 'viewer' | 'officer' | 'admin';

// ─── Strategies ─────────────────────────────────────────────────────

export interface KvkStrategy {
  id: string;
  map_id: string;
  name: string;
  share_code: string | null;
  assignments: KvkAssignment[];
  alliance_snapshot: KvkAlliance[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── UI State Types ─────────────────────────────────────────────────

export type AdminTool = 'select' | 'place';

export interface PlacementState {
  featureType: FeatureType;
  isActive: boolean;
}

export interface SelectedFeature {
  feature: KvkMapFeature;
  isEditing: boolean;
}
