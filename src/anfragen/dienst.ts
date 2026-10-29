/**
 * Anfragen-Dienst für den Praxisdienst (A15): Seitendaten und Aktionen – Patient zuordnen, Zeiten
 * vorschlagen (Kalender reservieren, Antwort als Entwurf), bestätigen (Termin in der Kartei, Spiegelung
 * in den Kalender, Bestätigungs-Entwurf), abschließen. Nichts geht automatisch an Patienten.
 */
import type { Db } from '../db/index.ts';
import { datumZeitText } from '../format.ts';
import { GraphError, type GraphClient } from '../graph.ts';
import { terminSpiegeln } from '../kartei/kalender.ts';
import { einstellungen } from '../kartei/konfiguration.ts';
import { KarteiFehler, patientenListe, type PatientKurz } from '../kartei/patienten.ts';
import { antwortEntwurf, entwurfAnlegen } from '../mail/entwurf.ts';
import { rendern, vorlage, type Person } from '../nachrichten/vorlagen.ts';
import type { Tresor } from '../tresor.ts';
import { SchrankeVerletzt } from '../umgebung.ts';
import { berlinMitternachtUtc, heuteBerlin, tagPlus } from '../zeit.ts';
import {
  abgelaufeneVorschlaege, anfrageAnlegen, anfrageBestaetigen, anfrageLesen, anfragenListe, anfrageStatus, notizSetzen, offeneAnfragen, patientZuordnen,
  reservierungenVergessen, terminartSetzen, vorschlaegeSetzen, type Anfrage, type AnfrageQuelle, type AnfrageStatus, type Vorschlag,
} from './anfragen.ts';
import type { Anliegen } from './erkennung.ts';
import { terminarten, type Terminart } from '../kartei/terminarten.ts';
import { belegteZeiten, reservieren, reservierungenLoeschen } from './kalender.ts';
import { oeffnungszeitenLesen, vorschlaege as vorschlaegeBerechnen, type SlotRegeln } from './slots.ts';
import { gesperrteTage } from '../kartei/freie-tage.ts';

export type AnfragenGraph = Pick<GraphClient, 'get' | 'post' | 'patch' | 'delete' | 'paginate'>;

export type AnfragenFilter = 'offen' | 'alle' | AnfrageStatus;

export interface AnfrageSeiteDaten {
  anfrage: Anfrage;
  /** alle Terminarten (W94) zur Auswahl */
  terminarten: Terminart[];
  /** aktive Patienten zum Zuordnen */
  patienten: PatientKurz[];
  regeln: { dauerMin: number; pufferMin: number; oeffnungszeiten: string };
  /** Kalender erreichbar – dann werden Vorschläge reserviert und Entwürfe angelegt */
  postfach: boolean;
}

export interface AnfragenStand {
  neu: number;
  vorgeschlagen: number;
  neueste: Anfrage[];
}

export interface AnfragenDienst {
  liste(filter: AnfragenFilter): Promise<Anfrage[]>;
  details(id: string): Promise<AnfrageSeiteDaten | undefined>;
  stand(): Promise<AnfragenStand>;
  terminarten(): Promise<Terminart[]>;
  /** Reservierungen unbestätigter Vorschläge nach 48 h aus dem Kalender nehmen */
  aufraeumen(): Promise<number>;
  aktion(f: URLSearchParams, wer: string): Promise<{ ziel: string; meldung: string }>;
}

const QUELLEN: AnfrageQuelle[] = ['telefon', 'hand', 'whatsapp'];
const ANLIEGEN: Anliegen[] = ['termin', 'verschieben', 'absagen', 'unklar'];

export async function slotRegeln(db: Db): Promise<SlotRegeln & { oeffnungszeitenText: string }> {
  const e = await einstellungen(db);
  const text = e.oeffnungszeiten ?? 'Mo 08:00-18:00; Di 08:00-18:00; Mi 08:00-18:00; Do 08:00-18:00; Fr 08:00-14:00';
  // Gesperrte Tage (A26/W111): Feiertage, Brückentage, Schließtage aus der Tabelle – ein halbes Jahr voraus; Wochenende laut Einstellung
  const heute = heuteBerlin();
  return {
    oeffnungszeiten: oeffnungszeitenLesen(text), oeffnungszeitenText: text, dauerMin: Number(e.termin_dauer_min ?? 30) || 30, pufferMin: Number(e.termin_puffer_min ?? 0) || 0,
    gesperrt: await gesperrteTage(db, tagPlus(heute, -1), tagPlus(heute, 200)), wochenendeGesperrt: (e.kalender_wochenende ?? 'gesperrt') !== 'offen',
  };
}

export function anfragenDienst(q: { db: Db; tresor: Tresor; graph?: AnfragenGraph }): AnfragenDienst {
  const { db, tresor: t } = q;

  const person = (a: Anfrage): Person => {
    if (a.patient) {
      const [vorname, ...rest] = a.patient.name.split(' ');
      return { anrede: null, titel: null, vorname: vorname ?? '', nachname: rest.join(' ') };
    }
    const [vorname, ...rest] = (a.absenderName ?? '').split(' ');
    return { anrede: null, titel: null, vorname: rest.length ? vorname! : '', nachname: rest.length ? rest.join(' ') : (vorname ?? '') };
  };

  /** Antwort als Entwurf: im Faden der Mail, sonst neue Mail an die bekannte Adresse; ohne Adresse nichts */
  const entwurf = async (a: Anfrage, code: string, werte: { termin?: string; freitext?: string }): Promise<string | null> => {
    if (!q.graph) return null;
    const v = vorlage(code)!;
    const { betreff, text } = rendern(v, 'email', { person: person(a), ...werte });
    try {
      if (a.graphMessageId && a.absenderAdresse) return (await antwortEntwurf(q.graph, a.graphMessageId, text, a.absenderAdresse)).webLink ?? null;
      if (a.absenderAdresse) return (await entwurfAnlegen(q.graph, { an: [a.absenderAdresse], betreff, text }, { ausfuehren: true })).webLink ?? null;
      return null;
    } catch (err) {
      if (err instanceof SchrankeVerletzt) throw new KarteiFehler(err.message);
      if (err instanceof GraphError) throw new KarteiFehler(`Postfach nicht erreichbar (${err.status}) – kein Entwurf angelegt`);
      throw err;
    }
  };

  const loeschen = async (vorschlaege: Vorschlag[]): Promise<void> => {
    if (!q.graph) return;
    try {
      await reservierungenLoeschen(q.graph, vorschlaege);
    } catch (err) {
      console.warn(`Reservierung löschen: ${(err as Error).message.slice(0, 160)}`);
    }
  };

  return {
    liste: (filter) => anfragenListe(db, t, { filter }),
    async details(id) {
      const anfrage = await anfrageLesen(db, t, id);
      if (!anfrage) return undefined;
      const r = await slotRegeln(db);
      return { anfrage, terminarten: await terminarten(db), patienten: await patientenListe(db, t, {}), regeln: { dauerMin: r.dauerMin, pufferMin: r.pufferMin, oeffnungszeiten: r.oeffnungszeitenText }, postfach: Boolean(q.graph) };
    },
    terminarten: () => terminarten(db),
    async stand() {
      const z = await offeneAnfragen(db);
      return { ...z, neueste: (await anfragenListe(db, t, { filter: 'offen' })).slice(0, 5) };
    },
    async aufraeumen() {
      let n = 0;
      for (const a of await abgelaufeneVorschlaege(db)) {
        await loeschen(a.vorschlaege);
        await reservierungenVergessen(db, a.id);
        n += a.vorschlaege.filter((v) => v.exchangeEventId).length;
      }
      return n;
    },
    async aktion(f, wer) {
      const g = (name: string) => f.get(name)?.trim() || undefined;
      const id = g('id') ?? '';
      const aktion = g('aktion');
      const seite = `/anfragen/${id}`;
      if (aktion === 'neu') {
        const quelle = QUELLEN.find((x) => x === g('quelle')) ?? 'hand';
        const anliegen = ANLIEGEN.find((x) => x === g('anliegen')) ?? 'termin';
        const neu = await anfrageAnlegen(db, t, { quelle, anliegen, absenderName: g('name') ?? null, absenderTelefon: g('telefon') ?? null, absenderAdresse: g('email') ?? null, text: g('text') ?? null, patientId: g('patient_id') ?? null, terminartId: g('terminart_id') ?? null }, wer);
        return { ziel: `/anfragen/${neu.id}`, meldung: 'Anfrage angelegt.' };
      }
      const a = await anfrageLesen(db, t, id);
      if (!a) throw new KarteiFehler('Unbekannte Anfrage');
      switch (aktion) {
        case 'zuordnen':
          await patientZuordnen(db, id, g('patient_id') ?? '', wer);
          return { ziel: seite, meldung: 'Patient zugeordnet.' };
        case 'vorschlagen': {
          const r = await slotRegeln(db);
          const dauer = Number(g('dauer_min') ?? a.dauerMin ?? a.terminart?.dauerMin ?? r.dauerMin);
          if (!(dauer > 0 && dauer <= 240)) throw new KarteiFehler('Dauer in Minuten, höchstens 240');
          const ab = /^\d{4}-\d{2}-\d{2}$/.test(g('ab') ?? '') ? g('ab')! : heuteBerlin();
          const tage = Math.min(Math.max(Number(g('tage') ?? 14) || 14, 1), 60);
          const von = ab === heuteBerlin() ? new Date(Date.now() + 60 * 60_000).toISOString() : berlinMitternachtUtc(ab);
          const bis = berlinMitternachtUtc(tagPlus(ab, tage));
          await loeschen(a.vorschlaege);
          const belegt = await belegteZeiten(q.graph, db, berlinMitternachtUtc(ab), bis, { ohneAnfrage: id, pufferMin: r.pufferMin });
          const slots = vorschlaegeBerechnen({ ab: von, tage, belegt, regeln: { ...r, dauerMin: dauer }, wunsch: f.has('ohne_wunsch') ? undefined : a.erkannt, anzahl: 3 });
          if (!slots.length) throw new KarteiFehler('Keine freie Zeit in diesem Zeitraum – Zeitraum verlängern oder Öffnungszeiten prüfen');
          const vorschlaege: Vorschlag[] = q.graph ? await reservieren(q.graph, id, slots) : slots.map((s) => ({ ...s, exchangeEventId: null }));
          const freitext = slots.map((s) => `– ${datumZeitText(s.beginn, { jahr: true })} Uhr (${dauer} Minuten)`).join('\n');
          const webLink = await entwurf(a, 'terminvorschlag', { freitext });
          await vorschlaegeSetzen(db, id, vorschlaege, { dauerMin: dauer, leistungNummer: g('leistung_nummer') ?? null, antwortWeblink: webLink }, wer);
          return { ziel: `${seite}#vorschlaege`, meldung: `${slots.length} Zeiten vorgeschlagen${q.graph ? ' und im Kalender reserviert' : ''}.${webLink ? ' Die Antwort liegt als Entwurf im Postfach – bitte prüfen und senden.' : a.absenderAdresse ? '' : ' Keine Mailadresse – bitte telefonisch mitteilen.'}` };
        }
        case 'bestaetigen': {
          const e = await anfrageBestaetigen(db, t, id, Number(g('wahl') ?? -1), wer);
          await loeschen([e.gewaehlt, ...e.andere]);
          let kalender = '';
          if (q.graph) {
            try {
              await terminSpiegeln(db, q.graph, e.terminId, wer);
              kalender = ' Termin steht im Kalender.';
            } catch (err) {
              console.warn(`Kalender: ${(err as Error).message.slice(0, 160)}`);
              kalender = ' Der Kalender war nicht erreichbar – der Abgleich holt es nach.';
            }
          }
          const webLink = await entwurf(a, 'terminbestaetigung', { termin: e.gewaehlt.beginn });
          if (webLink) await db.query('UPDATE terminanfrage SET antwort_weblink = $2 WHERE id = $1', [id, webLink]);
          return { ziel: `/patienten/${a.patient!.id}#termine`, meldung: `Termin am ${datumZeitText(e.gewaehlt.beginn, { jahr: true })} angelegt.${kalender}${webLink ? ' Die Bestätigung liegt als Entwurf im Postfach.' : ''}` };
        }
        case 'absagen':
        case 'erledigt':
        case 'verwerfen':
        case 'wieder_oeffnen': {
          const status: AnfrageStatus = aktion === 'wieder_oeffnen' ? 'neu' : aktion === 'verwerfen' ? 'verworfen' : aktion === 'absagen' ? 'abgesagt' : 'erledigt';
          const reservierungen = await anfrageStatus(db, id, status, wer);
          await loeschen(reservierungen);
          return { ziel: status === 'neu' ? seite : '/anfragen', meldung: status === 'neu' ? 'Anfrage wieder offen.' : `Anfrage ${status === 'verworfen' ? 'verworfen' : status === 'abgesagt' ? 'als abgesagt vermerkt' : 'erledigt'}${reservierungen.some((v) => v.exchangeEventId) ? ', Reservierungen aus dem Kalender genommen' : ''}.` };
        }
        case 'terminart':
          await terminartSetzen(db, id, g('terminart_id'), wer);
          return { ziel: seite, meldung: g('terminart_id') ? 'Terminart gesetzt – ihre Dauer gilt für die Vorschläge.' : 'Terminart entfernt.' };
        case 'notiz':
          await notizSetzen(db, t, id, g('notiz'), wer);
          return { ziel: seite, meldung: 'Notiz gespeichert.' };
        default:
          throw new KarteiFehler('Unbekannte Aktion');
      }
    },
  };
}

export { QUELLEN as ANFRAGE_QUELLEN_HAND };
