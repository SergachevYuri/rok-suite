import { createClient } from './client';

// Types
export interface EventParticipation {
  id: string;
  member_name: string;
  event_type: 'aoo' | 'mobilization';
  event_date: string;
  team: 'Team 1' | 'Team 2' | null;
  participated: boolean;
  score: number | null;
  turned_in: number | null;
  accepted: number | null;
  notes: string | null;
  created_at: string;
}

export interface MemberEventStats {
  aoo: {
    lastTeam: 'Team 1' | 'Team 2' | null;
    team1Count: number;        // Times assigned to Team 1
    team2Count: number;        // Times assigned to Team 2
    team1Participated: number; // Times participated when on Team 1
    team2Participated: number; // Times participated when on Team 2
    participatedCount: number;
    totalAssigned: number;
  };
  mobilization: {
    lastScore: number | null;
    lastTurnedIn: number | null;
    lastAccepted: number | null;
    lastDate: string | null;
    previousScore: number | null;
    previousDate: string | null;
    growth: number | null;  // Absolute change from previous
    growthPercent: number | null;  // Percentage change from previous
    totalEvents: number;
  };
}

// Get stats for a single member
export async function getMemberEventStats(memberName: string): Promise<MemberEventStats> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('event_participation')
    .select('*')
    .eq('member_name', memberName)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching member event stats:', error);
    return getEmptyStats();
  }

  return calculateStats(data || []);
}

// Get stats for all members at once (more efficient for roster display)
export async function getAllMemberStats(): Promise<Map<string, MemberEventStats>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('event_participation')
    .select('*')
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching all event stats:', error);
    return new Map();
  }

  // Group by member
  const memberEvents = new Map<string, EventParticipation[]>();
  for (const event of (data || [])) {
    const existing = memberEvents.get(event.member_name) || [];
    existing.push(event);
    memberEvents.set(event.member_name, existing);
  }

  // Calculate stats for each member
  const statsMap = new Map<string, MemberEventStats>();
  for (const [memberName, events] of memberEvents) {
    statsMap.set(memberName, calculateStats(events));
  }

  return statsMap;
}

// Get event history for a specific member
export async function getMemberEventHistory(
  memberName: string,
  eventType: 'aoo' | 'mobilization'
): Promise<EventParticipation[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('event_participation')
    .select('*')
    .eq('member_name', memberName)
    .eq('event_type', eventType)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching member event history:', error);
    return [];
  }

  return data || [];
}

// Get all unique event dates for a type
export async function getEventDates(eventType: 'aoo' | 'mobilization'): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('event_participation')
    .select('event_date')
    .eq('event_type', eventType)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching event dates:', error);
    return [];
  }

  // Get unique dates
  const uniqueDates = [...new Set((data || []).map(d => d.event_date))];
  return uniqueDates;
}

// Record a single event participation
export async function recordEvent(data: {
  memberName: string;
  eventType: 'aoo' | 'mobilization';
  eventDate: string;
  team?: 'Team 1' | 'Team 2' | null;
  participated?: boolean;
  score?: number | null;
  notes?: string | null;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('event_participation')
    .upsert({
      member_name: data.memberName,
      event_type: data.eventType,
      event_date: data.eventDate,
      team: data.team ?? null,
      participated: data.participated ?? true,
      score: data.score ?? null,
      notes: data.notes ?? null,
    }, {
      onConflict: 'member_name,event_type,event_date'
    });

  if (error) {
    console.error('Error recording event:', error);
    throw error;
  }
}

// Bulk record AoO event
export async function bulkRecordAoO(
  eventDate: string,
  entries: Array<{
    memberName: string;
    team: 'Team 1' | 'Team 2';
    participated: boolean;
  }>
): Promise<void> {
  const supabase = createClient();

  const records = entries.map(entry => ({
    member_name: entry.memberName,
    event_type: 'aoo' as const,
    event_date: eventDate,
    team: entry.team,
    participated: entry.participated,
    score: null,
  }));

  const { error } = await supabase
    .from('event_participation')
    .upsert(records, {
      onConflict: 'member_name,event_type,event_date'
    });

  if (error) {
    console.error('Error bulk recording AoO:', error);
    throw error;
  }
}

// Bulk record Mobilization event
export async function bulkRecordMobilization(
  eventDate: string,
  entries: Array<{
    memberName: string;
    score: number;
    turnedIn?: number;
    accepted?: number;
  }>
): Promise<void> {
  const supabase = createClient();

  const records = entries.map(entry => ({
    member_name: entry.memberName,
    event_type: 'mobilization' as const,
    event_date: eventDate,
    team: null,
    participated: true,
    score: entry.score,
    turned_in: entry.turnedIn ?? null,
    accepted: entry.accepted ?? null,
  }));

  const { error } = await supabase
    .from('event_participation')
    .upsert(records, {
      onConflict: 'member_name,event_type,event_date'
    });

  if (error) {
    console.error('Error bulk recording Mobilization:', error);
    throw error;
  }
}

// Delete an event record
export async function deleteEvent(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('event_participation')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

// Helper: Get empty stats object
function getEmptyStats(): MemberEventStats {
  return {
    aoo: {
      lastTeam: null,
      team1Count: 0,
      team2Count: 0,
      team1Participated: 0,
      team2Participated: 0,
      participatedCount: 0,
      totalAssigned: 0,
    },
    mobilization: {
      lastScore: null,
      lastTurnedIn: null,
      lastAccepted: null,
      lastDate: null,
      previousScore: null,
      previousDate: null,
      growth: null,
      growthPercent: null,
      totalEvents: 0,
    },
  };
}

// Helper: Calculate stats from events array
function calculateStats(events: EventParticipation[]): MemberEventStats {
  const stats = getEmptyStats();

  const aooEvents = events.filter(e => e.event_type === 'aoo');
  const mobEvents = events.filter(e => e.event_type === 'mobilization');

  // AoO stats - count unique event dates
  if (aooEvents.length > 0) {
    // Events are already sorted by date desc, so first is most recent
    stats.aoo.lastTeam = aooEvents[0].team;
    // Count unique event dates (in case of duplicate entries)
    const uniqueEventDates = new Set(aooEvents.map(e => e.event_date));
    stats.aoo.totalAssigned = uniqueEventDates.size;
    // For participated count, count dates where they participated
    const participatedDates = new Set(aooEvents.filter(e => e.participated).map(e => e.event_date));
    stats.aoo.participatedCount = participatedDates.size;

    // Team-specific stats
    const team1Events = aooEvents.filter(e => e.team === 'Team 1');
    const team2Events = aooEvents.filter(e => e.team === 'Team 2');
    stats.aoo.team1Count = team1Events.length;
    stats.aoo.team2Count = team2Events.length;
    stats.aoo.team1Participated = team1Events.filter(e => e.participated).length;
    stats.aoo.team2Participated = team2Events.filter(e => e.participated).length;
  }

  // Mobilization stats
  if (mobEvents.length > 0) {
    stats.mobilization.lastScore = mobEvents[0].score;
    stats.mobilization.lastTurnedIn = mobEvents[0].turned_in;
    stats.mobilization.lastAccepted = mobEvents[0].accepted;
    stats.mobilization.lastDate = mobEvents[0].event_date;
    stats.mobilization.totalEvents = mobEvents.length;

    // Calculate growth from previous event (if exists)
    if (mobEvents.length > 1) {
      stats.mobilization.previousScore = mobEvents[1].score;
      stats.mobilization.previousDate = mobEvents[1].event_date;
      if (mobEvents[0].score !== null && mobEvents[1].score !== null) {
        stats.mobilization.growth = mobEvents[0].score - mobEvents[1].score;
        if (mobEvents[1].score > 0) {
          stats.mobilization.growthPercent = Math.round(
            ((mobEvents[0].score - mobEvents[1].score) / mobEvents[1].score) * 100
          );
        }
      }
    }
  }

  return stats;
}
