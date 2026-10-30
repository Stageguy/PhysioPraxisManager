/**
 * Schnelltermin (W117): Lilli tippt im Cockpit auf 20 · 30 · 40 · 60 Minuten, die Kartei sucht die nächsten drei
 * freien Zeiten dieser Dauer – aus demselben Angebot, das die öffentliche Buchungsseite bekommt, damit jeder Link
 * dort auch wählbar ist – und baut eine Vorlage für Mail oder WhatsApp. Die Vorlage wird nur kopiert, nie gesendet
 * (Leitplanke 3). „Direkt buchen“ führt Lilli in den eigenen Kalender (W116e).
 */
import type { Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { datumZeitText } from '../format.ts';
import { praxisName } from '../praxis.ts';
import { datumBerlin, zeitBerlin } from '../zeit.ts';
import { angebotErstellen } from '../buchung/abgleich.ts';
import { anfangszeiten } from '../buchung/angebot.ts';

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post' | 'patch' | 'delete'>;

export const SCHNELL_DAUERN = [20, 30, 40, 60] as const;

export interface SchnellZeit {
  beginn: string;
  ende: string;
  /** „Mo., 09.11., 09:00 Uhr“ */
  text: string;
  /** Link für den Patienten auf die Buchungsseite mit vorgewählter Dauer und Zeit – null ohne öffentliche Buchungsseite */
  link: string | null;
  /** Lillis Weg: Terminwahl im Praxiskalender mit vorbelegtem Datum, Zeit und Dauer */
  direkt: string;
}

export interface Schnelltermin {
  dauer: number;
  zeiten: SchnellZeit[];
  /** Fertiger Text für Mail oder WhatsApp */
  vorlage: string;
  /** Es gibt eine öffentliche Buchungsseite – die Vorlage trägt Links */
  buchung: boolean;
}

/** Drei Zeiten, möglichst an verschiedenen Tagen: erst je Tag die erste, dann je Tag die zweite … */
export function dreiZeiten(tage: { datum: string; zeiten: string[] }[], anzahl = 3): string[] {
  const wahl: string[] = [];
  for (let runde = 0; wahl.length < anzahl; runde++) {
    let gefunden = false;
    for (const t of tage) {
      const z = t.zeiten[runde];
      if (z === undefined) continue;
      gefunden = true;
      wahl.push(z);
      if (wahl.length >= anzahl) break;
    }
    if (!gefunden) break;
  }
  return wahl.sort();
}

/** Link auf die Buchungsseite mit Dauer und Zeit – die Seite wählt Behandlung, Tag und Uhrzeit vor; kurz gehalten („2026-11-02T10:30Z“), damit er in WhatsApp lesbar bleibt */
export const buchungsLink = (url: string, dauer: number, beginn: string): string => `${url.replace(/\/$/, '')}/?dauer=${dauer}&zeit=${beginn.replace(/:\d{2}(\.\d{3})?Z$/, 'Z')}`;

export function vorlageText(dauer: number, zeiten: SchnellZeit[], praxis: string): string {
  const liste = zeiten.map((z, i) => `${i + 1}. ${z.text}${z.link ? `\n   ${z.link}` : ''}`).join('\n');
  const mitLinks = zeiten.some((z) => z.link);
  return [
    'Guten Tag,',
    '',
    `für einen Termin (${dauer} Minuten) kann ich Ihnen anbieten:`,
    liste,
    '',
    mitLinks
      ? 'Bitte tippen Sie auf den Link des passenden Termins und senden Sie dort den Terminwunsch ab – ich bestätige ihn dann. Passt keiner, melden Sie sich gern.'
      : 'Bitte antworten Sie kurz mit dem passenden Termin – ich bestätige ihn dann. Passt keiner, melden Sie sich gern.',
    '',
    'Viele Grüße',
    praxis,
  ].join('\n');
}

export async function schnelltermin(db: Db, graph: LeseGraph | undefined, o: { dauer: number; buchungUrl?: string; jetzt?: Date; anzahl?: number }): Promise<Schnelltermin> {
  const dauer = (SCHNELL_DAUERN as readonly number[]).includes(o.dauer) ? o.dauer : 30;
  const angebot = await angebotErstellen(db, graph, { jetzt: o.jetzt });
  const tage = angebot.tage.map((t) => ({ datum: t.datum, zeiten: anfangszeiten(t.fenster, dauer, angebot.rasterMin) })).filter((t) => t.zeiten.length);
  const zeiten: SchnellZeit[] = dreiZeiten(tage, o.anzahl ?? 3).map((beginn) => ({
    beginn, ende: new Date(Date.parse(beginn) + dauer * 60_000).toISOString(), text: `${datumZeitText(beginn, { wochentag: true })} Uhr`,
    link: o.buchungUrl ? buchungsLink(o.buchungUrl, dauer, beginn) : null,
    direkt: `/kalender/termin?datum=${datumBerlin(beginn)}&zeit=${zeitBerlin(beginn)}&dauer_min=${dauer}`,
  }));
  return { dauer, zeiten, vorlage: vorlageText(dauer, zeiten, praxisName()), buchung: Boolean(o.buchungUrl) };
}
