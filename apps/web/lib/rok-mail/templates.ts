export type TemplateCategory =
  | 'angmar'
  | 'mng'
  | 'kng'
  | 'sng'
  | 'ing'
  | 'eng'
  | 'kingdom';

export interface MailTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  content: string;
}

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  angmar: 'ANG',
  mng: 'MNG',
  kng: 'KNG',
  sng: 'SNG',
  ing: 'ING',
  eng: 'ENG',
  kingdom: 'Kingdom',
};

export const MAIL_TEMPLATES: MailTemplate[] = [
  // ── Angmar Templates ──
  {
    id: 'ang-mail',
    name: 'Angmar Mail',
    category: 'angmar',
    description: 'Standard Angmar Nazgul Guards alliance mail format',
    content: `<size=30px><color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#ff3333>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#800000>— Angmar Leadership</color></b>`,
  },

  // ── MNG Templates ──
  {
    id: 'mng-mail',
    name: 'Mithril Mail',
    category: 'mng',
    description: 'Standard Mithril Noble Guard alliance mail format',
    content: `<size=30px><color=#004d1a>M</color><color=#006622>I</color><color=#008030>T</color><color=#009939>H</color><color=#00b342>R</color><color=#00cc4d>I</color><color=#00e659>L</color> <color=#004d1a>N</color><color=#006622>O</color><color=#008030>B</color><color=#009939>L</color><color=#00b342>E</color> <color=#00cc4d>G</color><color=#00e659>U</color><color=#00b342>A</color><color=#009939>R</color><color=#008030>D</color></size>
►═════════❂❂❂═════════◄

<b><color=#00b342>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#008030>— Mithril Leadership</color></b>`,
  },

  // ── KNG Templates ──
  {
    id: 'kng-mail',
    name: 'Keepers Mail',
    category: 'kng',
    description: 'Standard Keepers of Noble Guards alliance mail format',
    content: `<size=30px><color=#003366>K</color><color=#004080>E</color><color=#004d99>E</color><color=#0059b3>P</color><color=#0066cc>E</color><color=#0073e6>R</color><color=#0080ff>S</color> <color=#003366>O</color><color=#004d99>F</color> <color=#003366>N</color><color=#004080>O</color><color=#004d99>B</color><color=#0059b3>L</color><color=#0066cc>E</color> <color=#0073e6>G</color><color=#0080ff>U</color><color=#0066cc>A</color><color=#004d99>R</color><color=#003366>D</color><color=#003366>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#3399ff>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#004d99>— Keepers Leadership</color></b>`,
  },

  // ── SNG Templates ──
  {
    id: 'sng-mail',
    name: 'Sauron\'s Nine Mail',
    category: 'sng',
    description: 'Standard Sauron\'s Nine Guards alliance mail format',
    content: `<size=30px><color=#333333>S</color><color=#404040>A</color><color=#4d4d4d>U</color><color=#595959>R</color><color=#666666>O</color><color=#737373>N</color><color=#808080>'</color><color=#8c8c8c>S</color> <color=#333333>N</color><color=#4d4d4d>I</color><color=#666666>N</color><color=#808080>E</color> <color=#333333>G</color><color=#4d4d4d>U</color><color=#666666>A</color><color=#808080>R</color><color=#999999>D</color><color=#808080>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#999999>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#666666>— Sauron's Nine Leadership</color></b>`,
  },

  // ── ING Templates ──
  {
    id: 'ing-mail',
    name: 'Immortal Mail',
    category: 'ing',
    description: 'Standard Immortal Nightguards alliance mail format',
    content: `<size=30px><color=#330066>I</color><color=#400080>M</color><color=#4d0099>M</color><color=#5900b3>O</color><color=#6600cc>R</color><color=#7300e6>T</color><color=#8000ff>A</color><color=#7300e6>L</color> <color=#330066>N</color><color=#400080>I</color><color=#4d0099>G</color><color=#5900b3>H</color><color=#6600cc>T</color><color=#7300e6>G</color><color=#8000ff>U</color><color=#7300e6>A</color><color=#6600cc>R</color><color=#5900b3>D</color><color=#4d0099>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#9933ff>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#5900b3>— Immortal Leadership</color></b>`,
  },

  // ── ENG Templates ──
  {
    id: 'eng-mail',
    name: 'Equestris Mail',
    category: 'eng',
    description: 'Standard Equestris alliance mail format',
    content: `<size=30px><color=#330066>E</color><color=#400080>Q</color><color=#4d0099>U</color><color=#5900b3>E</color><color=#6600cc>S</color><color=#7300e6>T</color><color=#8000ff>R</color><color=#6600cc>I</color><color=#4d0099>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#9933ff>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#5900b3>— Equestris Leadership</color></b>`,
  },

  // ── Kingdom Templates ──
  {
    id: 'kingdom-mail',
    name: 'Kingdom Mail',
    category: 'kingdom',
    description: 'Standard Kingdom 3923 mail format',
    content: `<size=30px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>—</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>
►═════════❂❂❂═════════◄

<b><color=#ff3333>SUBJECT TITLE HERE</color></b>

Your message here.

►═════════❂❂❂═════════◄
<b><color=#800000>— King Fluffy</color></b>`,
  },
];
