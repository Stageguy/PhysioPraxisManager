/** Erklärungen (Rechtsklick-Hilfe): Outlook-Kategorien (aus src/mail/kategorien.ts) – Teil von src/web/hilfe.ts (A32) */
import { KATEGORIEN } from '../../mail/kategorien.ts';
import { type HilfeEintrag } from './basis.ts';

export const KATEGORIEN_HILFE: Record<string, HilfeEintrag> = {
  ...Object.fromEntries(
    Object.entries(KATEGORIEN).map(([key, k]) => [
      `kategorie.${key}`,
      {
        seite: 'Outlook-Kategorien', titel: `Kategorie „${k.name}“ (${k.farbname})`,
        loest_aus: 'Nichts – eine farbige Markierung an der Mail in Outlook, auf iPhone und Mac.',
        bezug: 'Eine Mail im Praxispostfach.',
        aendert: `Die Praxis-Assistenz setzt die Kategorie selbst (${k.ab === 'jetzt' ? 'schon heute' : k.ab}).`,
        ergebnis: `${k.wann} Was du tust: ${k.tun}`,
        rueckweg: 'In Outlook die Kategorie entfernen. Was abgelegt wurde, bleibt abgelegt; das System legt nichts doppelt ab.',
      } satisfies HilfeEintrag,
    ]),
  ),
};
