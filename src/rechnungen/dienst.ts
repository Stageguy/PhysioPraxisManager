/**
 * Rechnungsdienst für den Praxisdienst: verbindet Datenbank, Graph und Ablage für das
 * Rechnungs-Dashboard (Prompt 15). Ohne Datenbank gibt es ihn nicht – dann zeigt die Seite
 * „nicht verbunden“.
 */
import { rechnungsstand } from '../cockpit/daten.ts';
import type { Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { MailOrte } from '../mail/ort.ts';
import type { DashboardDaten, KachelRechnung } from '../web/rechnungen.ts';
import {
  auswertung, ausfuehren, liste, neueRechnungen, pdf, privateRechnungen, rechnung,
  type Aktion, type Filter,
} from './dashboard.ts';

export interface RechnungsDienst {
  dashboard(f: Filter): Promise<DashboardDaten>;
  ansicht(id: string): Promise<KachelRechnung | undefined>;
  pdf(id: string): Promise<{ antwort: Response; name: string } | undefined>;
  onedriveLink(id: string): Promise<string | undefined>;
  aktion(id: string, a: Aktion, wer: string): Promise<string>;
}

/** Höchstens n gleichzeitig – Graph drosselt sonst */
async function jeweils<T, R>(liste: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const ergebnis: R[] = new Array(liste.length);
  let naechster = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (naechster < liste.length) {
      const i = naechster++;
      ergebnis[i] = await f(liste[i]!);
    }
  }));
  return ergebnis;
}

export function rechnungsDienst(q: {
  db: Db;
  graph: Pick<GraphClient, 'get' | 'find' | 'patch' | 'post' | 'stream'>;
  laufwerk?: string;
}): RechnungsDienst {
  const orte = new MailOrte(q.graph);
  const ortVon = async (mailId: string) => {
    try {
      return await orte.ort(mailId);
    } catch {
      return 'unbekannt (Postfach gerade nicht erreichbar)';
    }
  };
  return {
    async dashboard(f) {
      const [stand, neu, privat, a, l] = await Promise.all([
        rechnungsstand(q.db), neueRechnungen(q.db), privateRechnungen(q.db), auswertung(q.db, f.jahr), liste(q.db, f),
      ]);
      const mitOrt = (rs: typeof neu) => jeweils(rs, 6, async (r) => ({ ...r, ort: await ortVon(r.mailId) }));
      return { stand, neu: await mitOrt(neu), privat: await mitOrt(privat), auswertung: a, liste: l, filter: f };
    },
    async ansicht(id) {
      const r = await rechnung(q.db, id);
      return r ? { ...r, ort: await ortVon(r.mailId) } : undefined;
    },
    async pdf(id) {
      const r = await rechnung(q.db, id);
      if (!r) return undefined;
      const antwort = await pdf(q.graph, r, q.laufwerk);
      return antwort ? { antwort, name: r.dateiname ?? 'Rechnung.pdf' } : undefined;
    },
    async onedriveLink(id) {
      return (await rechnung(q.db, id))?.onedriveWebUrl ?? undefined;
    },
    aktion: (id, a, wer) => ausfuehren({ db: q.db, graph: q.graph, laufwerk: q.laufwerk, wer }, id, a),
  };
}
