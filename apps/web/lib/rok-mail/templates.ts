export type TemplateCategory =
  | 'angmar'
  | 'kingdom';

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
<b><color=#800000>— Angmar Leadership</color></b>`,
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
];
