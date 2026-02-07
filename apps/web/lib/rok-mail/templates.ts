export type TemplateCategory =
  | 'angmar'
  | 'kingdom'
  | 'recruitment'
  | 'war'
  | 'events'
  | 'general';

export interface MailTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  content: string;
}

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  angmar: 'Angmar',
  kingdom: 'Kingdom',
  recruitment: 'Recruitment',
  war: 'War',
  events: 'Events',
  general: 'General',
};

export const MAIL_TEMPLATES: MailTemplate[] = [
  // ── Angmar Templates ──
  {
    id: 'ang-daily-orders',
    name: 'Daily Orders',
    category: 'angmar',
    description: 'Standard daily alliance orders format',
    content: `<b><color="gold">━━━ ANGMAR DAILY ORDERS ━━━</color></b>

<b><color="cyan">📢 Announcements</color></b>
▸ [Your announcement here]

<b><color="cyan">⚔ Tasks</color></b>
▸ [Task 1]
▸ [Task 2]

<b><color="cyan">⚠ Reminders</color></b>
▸ [Reminder]

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>
<i>~ Angmar Leadership</i>`,
  },
  {
    id: 'ang-kvk-briefing',
    name: 'KvK Briefing',
    category: 'angmar',
    description: 'KvK battle briefing for Angmar',
    content: `<b><color="red">⚔ KVK BATTLE BRIEFING ⚔</color></b>
<color="gold">═══════════════════════</color>

<b><color="cyan">📋 Overview</color></b>
▸ Enemy: [Kingdom]
▸ Time: [UTC time]

<b><color="cyan">🎯 Objectives</color></b>
① [Primary objective]
② [Secondary objective]

<b><color="cyan">📍 Rally Points</color></b>
▸ Zone 1: [Leader] at [Location]
▸ Zone 2: [Leader] at [Location]

<b><color="red">⚠ IMPORTANT</color></b>
▸ [Critical instruction]

<color="gold">═══════════════════════</color>
<b>Glory to Angmar! ⚔</b>`,
  },
  {
    id: 'ang-aoo-orders',
    name: 'AoO Orders',
    category: 'angmar',
    description: 'Ark of Osiris team orders',
    content: `<b><color="gold">🏆 ARK OF OSIRIS ORDERS 🏆</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

<b><color="cyan">📅 Date:</color></b> [Date/Time UTC]
<b><color="cyan">👥 Team:</color></b> [Team name]

<b><color="cyan">📍 Zone Assignments</color></b>
▸ Ark: [Players]
▸ Zone 2: [Players]
▸ Zone 3: [Players]

<b><color="cyan">⚔ Rally Leaders</color></b>
▸ [Leader 1] - [Target]
▸ [Leader 2] - [Target]

<b><color="yellow">📋 Rules</color></b>
▸ Teleport to assigned zone at start
▸ Follow rally leader calls
▸ Do NOT go rogue

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>`,
  },

  // ── Kingdom Templates ──
  {
    id: 'kingdom-announcement',
    name: 'Kingdom Announcement',
    category: 'kingdom',
    description: 'Official kingdom-wide announcement',
    content: `<b><color="gold">👑 KINGDOM ANNOUNCEMENT 👑</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

[Your message here]

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>
<i>Kingdom Leadership</i>`,
  },
  {
    id: 'kingdom-kvk-strategy',
    name: 'KvK Strategy',
    category: 'kingdom',
    description: 'Kingdom-wide KvK strategy announcement',
    content: `<b><color="red">⚔ KVK STRATEGY UPDATE ⚔</color></b>
<color="gold">═══════════════════════</color>

<b><color="cyan">📋 Current Phase:</color></b> [Phase]
<b><color="cyan">🎯 Priority:</color></b> [Target/Objective]

<b><color="yellow">📍 Key Positions</color></b>
▸ [Alliance 1] - [Zone/Task]
▸ [Alliance 2] - [Zone/Task]
▸ [Alliance 3] - [Zone/Task]

<b><color="red">⚠ Rules of Engagement</color></b>
▸ [Rule 1]
▸ [Rule 2]

<b><color="green">✅ Remember</color></b>
▸ [Important reminder]

<color="gold">═══════════════════════</color>
<i>Fight as one kingdom!</i>`,
  },

  // ── Recruitment Templates ──
  {
    id: 'recruitment-post',
    name: 'Alliance Recruitment',
    category: 'recruitment',
    description: 'Alliance recruitment mail template',
    content: `<b><color="cyan">★ [ALLIANCE] is recruiting! ★</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

<b>Requirements:</b>
▸ Power: [minimum]M+
▸ Kill Points: [minimum]M+
▸ Active daily

<b>We offer:</b>
▸ [Benefit 1]
▸ [Benefit 2]
▸ [Benefit 3]

<b><color="green">How to apply:</color></b>
▸ [Instructions]

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>`,
  },

  // ── War Templates ──
  {
    id: 'war-rally-call',
    name: 'Rally Call',
    category: 'war',
    description: 'Urgent rally call for war',
    content: `<b><color="red">🚨 RALLY CALL 🚨</color></b>
<color="red">━━━━━━━━━━━━━━━━━━━━</color>

<b>Target:</b> [Target name/coords]
<b>Rally Leader:</b> [Name]
<b>Time:</b> [Time]

<b><color="yellow">⚠ Instructions:</color></b>
▸ [Troop type/march requirements]
▸ [Commanders to use]

<b><color="red">JOIN NOW!</color></b>`,
  },
  {
    id: 'war-garrison',
    name: 'Garrison Orders',
    category: 'war',
    description: 'Garrison defense assignment orders',
    content: `<b><color="blue">🛡 GARRISON ORDERS 🛡</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

<b><color="cyan">📍 Locations</color></b>
▸ [Pass/Flag 1]: [Garrison leader]
▸ [Pass/Flag 2]: [Garrison leader]
▸ [Pass/Flag 3]: [Garrison leader]

<b><color="yellow">⚠ Reinforcement Rules</color></b>
▸ Send [troop type] only
▸ Do NOT fill garrison completely
▸ Leave room for swaps

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>
<b><color="blue">Hold the line! 🛡</color></b>`,
  },

  // ── Event Templates ──
  {
    id: 'event-announcement',
    name: 'Event Announcement',
    category: 'events',
    description: 'Alliance event announcement',
    content: `<b><color="gold">🏆 EVENT: [Event Name] 🏆</color></b>
<color="gold">═══════════════════════</color>

<b><color="cyan">📅 When:</color></b> [Date/Time]
<b><color="cyan">📍 Where:</color></b> [Location]

<b><color="cyan">📋 Rules:</color></b>
① [Rule 1]
② [Rule 2]
③ [Rule 3]

<b><color="cyan">🎁 Rewards:</color></b>
▸ 1st: [Prize]
▸ 2nd: [Prize]
▸ 3rd: [Prize]

<color="gold">═══════════════════════</color>
<i>Good luck!</i>`,
  },
  {
    id: 'event-mge',
    name: 'MGE Announcement',
    category: 'events',
    description: 'Mightiest Governor Event coordination',
    content: `<b><color="gold">👑 MGE ANNOUNCEMENT 👑</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

<b><color="cyan">🎯 This Round:</color></b> [Commander name]

<b><color="cyan">📋 Priority List</color></b>
① [Player 1]
② [Player 2]
③ [Player 3]

<b><color="yellow">⚠ Rules</color></b>
▸ Do NOT compete unless assigned
▸ Save heads for next round if not on list
▸ Report scores in alliance chat

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>`,
  },

  // ── General Templates ──
  {
    id: 'general-welcome',
    name: 'Welcome Message',
    category: 'general',
    description: 'Welcome new alliance members',
    content: `<b><color="green">✅ Welcome to [Alliance]! ✅</color></b>
<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>

Welcome, <b>[Name]</b>!

<b><color="cyan">📋 Quick Start Guide</color></b>
▸ Set alliance tag in your name
▸ Join our Discord: [link]
▸ Read alliance rules in description

<b><color="cyan">📍 Important</color></b>
▸ [Key rule 1]
▸ [Key rule 2]

<color="gold">━━━━━━━━━━━━━━━━━━━━━━━━</color>
<i>Glad to have you!</i>`,
  },
  {
    id: 'general-rules',
    name: 'Alliance Rules',
    category: 'general',
    description: 'Alliance rules and guidelines',
    content: `<b><color="gold">📋 ALLIANCE RULES 📋</color></b>
<color="gold">═══════════════════════</color>

<b><color="red">① Zero Tolerance</color></b>
▸ No attacking alliance members
▸ No farming alliance territory

<b><color="yellow">② Daily Requirements</color></b>
▸ Use all AP daily
▸ Contribute to alliance tech
▸ Help with building requests

<b><color="cyan">③ Communication</color></b>
▸ Join Discord
▸ Read alliance mail
▸ Report issues to R4+

<b><color="green">④ Events</color></b>
▸ Participate in all events
▸ Follow MGE priority list
▸ Join AoO when assigned

<color="gold">═══════════════════════</color>
<i>Breaking rules = warning → kick</i>`,
  },
];
