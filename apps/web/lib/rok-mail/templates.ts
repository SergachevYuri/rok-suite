export type TemplateCategory =
  | 'angmar'
  | 'kingdom'
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
  war: 'War',
  events: 'Events',
  general: 'General',
};

export const MAIL_TEMPLATES: MailTemplate[] = [
  // ── Angmar Templates ──
  {
    id: 'ang-mail',
    name: 'Angmar Mail',
    category: 'angmar',
    description: 'Standard Angmar alliance mail format',
    content: `<size=30px><color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff3333>A</color><color=#ff6666>R</color><color=#ff9999>D</color><color=#ffcccc>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#ff3333>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#800000>— King Fluffy</color></b>`,
  },

  // ── Kingdom Templates ──
  {
    id: 'kingdom-mail',
    name: 'Kingdom Mail',
    category: 'kingdom',
    description: 'Standard Kingdom 3923 mail format',
    content: `<size=30px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>—</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff3333>A</color><color=#ff6666>R</color><color=#ff9999>D</color><color=#ffcccc>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#ff3333>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#800000>— King Fluffy</color></b>`,
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
