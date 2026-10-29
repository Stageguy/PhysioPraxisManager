/**
 * Abgleich Manager ↔ Buchungsdienst (W96): das Angebot erzeugen (aktive Terminarten, freie Fenster aus
 * Öffnungszeiten, Feiertagen, Kartei, Haupt- und Praxiskalender, Puffer, Vorlauf) und hinüberschieben;
 * Buchungswünsche abholen und als Anfragen anlegen – mit dem gewünschten Termin als Vorschlag, im
 * Praxiskalender reserviert, Status „neu“: Lilli bestätigt mit einem Klick.
 */
import { anfrageAnlegen, patientFinden, type Vorschlag } from '../anfragen/anfragen.ts';
import { slotRegeln } from '../anfragen/dienst.ts';
import { belegteZeiten, reservieren } from '../anfragen/kalender.ts';
import { tagGesperrt, wochentag } from '../anfragen/slots.ts';
import { protokolliere, type Db } from '../db/index.ts';
import { datumText, datumZeitText } from '../format.ts';
import type { GraphClient } from '../graph.ts';
import { einstellungen, einstellungSetzen } from '../kartei/konfiguration.ts';
import { terminarten } from '../kartei/terminarten.ts';
import { praxisName } from '../praxis.ts';
import type { Tresor } from '../tresor.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, tagPlus, zeitBerlin } from '../zeit.ts';
import { freieFenster, type Angebot, type Buchung, type Fenster } from './angebot.ts';
import type { BuchungsClient } from './client.ts';

type Graph = Pick<GraphClient, 'get' | 'post' | 'paginate' | 'patch' | 'delete'>;
const ACTOR = 'system:buchung';

/** Das Angebot aus dem Stand der Praxis – ohne Patientendaten */
export async function angebotErstellen(db: Db, graph: Graph | undefined, o: { jetzt?: Date } = {}): Promise<Angebot> {
  const e = await einstellungen(db);
  const regeln = await slotRegeln(db);
  const jetzt = o.jetzt ?? new Date();
  const vorlauf = Number(e.buchung_vorlauf_stunden ?? 24) || 0;
  const tage = Math.min(Math.max(Number(e.buchung_tage ?? 21) || 21, 1), 90);
  const ab = new Date(jetzt.getTime() + vorlauf * 3_600_000).toISOString();
  const erster = datumBerlin(jetzt.toISOString());
  const von = berlinMitternachtUtc(erster);
  const bis = berlinMitternachtUtc(tagPlus(erster, tage));
  const belegt = await belegteZeiten(graph, db, von, bis, { pufferMin: regeln.pufferMin });
  const liste: Angebot['tage'] = [];
  for (let i = 0, datum = erster; i < tage; i++, datum = tagPlus(datum, 1)) {
    if (tagGesperrt(datum, regeln)) continue;
    const wt = wochentag(datum);
    const offen: Fenster[] = regeln.oeffnungszeiten.filter((f) => f.tag === wt).map((f) => ({ beginn: berlinZeitUtc(datum, f.von), ende: berlinZeitUtc(datum, f.bis) }));
    const frei = freieFenster(offen, belegt, { pufferMin: regeln.pufferMin, ab });
    if (frei.length) liste.push({ datum, fenster: frei });
  }
  return {
    erstellt: jetzt.toISOString(), praxis: praxisName(), hinweis: e.buchung_hinweis ?? '', rasterMin: 15,
    terminarten: (await terminarten(db, { nurAktiv: true })).map((t) => ({ code: t.code, sektion: t.sektion, kurz: t.kurz, lang: t.lang, dauerMin: t.dauerMin })),
    tage: liste,
  };
}

export interface AbgleichBericht {
  angebot: { terminarten: number; tage: number };
  buchungen: number;
  neu: number;
  bekannt: number;
  fehler: number;
}

/** Eine Buchung → Anfrage mit reserviertem Wunschtermin; schon bekannte Buchungen (Kennung) werden übersprungen */
export async function buchungUebernehmen(db: Db, t: Tresor, graph: Graph | undefined, b: Buchung): Promise<'neu' | 'bekannt'> {
  if ((await db.query('SELECT 1 FROM terminanfrage WHERE buchung_id = $1', [b.id])).rows.length) return 'bekannt';
  const art = (await terminarten(db)).find((x) => x.code === b.terminart);
  const ende = new Date(new Date(b.beginn).getTime() + b.dauerMin * 60_000).toISOString();
  const text = [
    `Gebucht über die Website: ${art ? `${art.code} – ${art.kurz}` : b.terminart}, ${datumZeitText(b.beginn, { jahr: true })} Uhr (${b.dauerMin} Minuten)`,
    `Telefon: ${b.telefon}${b.email ? `\nE-Mail: ${b.email}` : ''}`,
    b.nachricht ? `Nachricht: ${b.nachricht}` : '',
  ].filter(Boolean).join('\n');
  const { id } = await anfrageAnlegen(db, t, {
    quelle: 'buchung', anliegen: 'termin', buchungId: b.id, absenderName: b.name, absenderTelefon: b.telefon, absenderAdresse: b.email || null,
    betreff: `Terminwunsch ${datumText(b.beginn)} ${zeitBerlin(b.beginn)} Uhr`, text, eingegangenAm: b.eingegangen,
    erkannt: { daten: [datumBerlin(b.beginn)], uhrzeiten: [zeitBerlin(b.beginn)] }, terminartId: art?.id ?? null,
    patientId: await patientFinden(db, { email: b.email, telefon: b.telefon }),
  }, ACTOR);
  let vorschlaege: Vorschlag[] = [{ beginn: b.beginn, ende, exchangeEventId: null }];
  if (graph) {
    try {
      vorschlaege = await reservieren(graph, id, vorschlaege);
    } catch (err) {
      console.warn(`Buchung ${b.id}: Reservierung im Kalender fehlgeschlagen – ${(err as Error).message.slice(0, 160)}`);
    }
  }
  await db.query('UPDATE terminanfrage SET vorschlaege = $2, dauer_min = $3, geaendert_am = now() WHERE id = $1', [id, JSON.stringify(vorschlaege), b.dauerMin]);
  await protokolliere(db, { actor: ACTOR, action: 'buchung_eingegangen', objectType: 'terminanfrage', objectId: id, details: { terminart: b.terminart, reserviert: Boolean(vorschlaege[0]?.exchangeEventId) } });
  return 'neu';
}

/** Ein Durchgang: Angebot schieben, Buchungen abholen und übernehmen, Abgeholtes beim Dienst löschen */
export async function buchungAbgleich(db: Db, t: Tresor, graph: Graph | undefined, client: BuchungsClient, o: { jetzt?: Date; wer?: string } = {}): Promise<AbgleichBericht> {
  const wer = o.wer ?? ACTOR;
  const bericht: AbgleichBericht = { angebot: { terminarten: 0, tage: 0 }, buchungen: 0, neu: 0, bekannt: 0, fehler: 0 };
  const letzte = Number((await einstellungen(db)).buchung_letzte_nr ?? 0) || 0;
  const buchungen = await client.buchungenAbholen(letzte);
  bericht.buchungen = buchungen.length;
  let hoechste = letzte;
  for (const b of buchungen) {
    try {
      bericht[await buchungUebernehmen(db, t, graph, b)]++;
      hoechste = Math.max(hoechste, b.nr);
    } catch (err) {
      bericht.fehler++;
      console.warn(`Buchung ${b.id}: ${(err as Error).message.slice(0, 160)}`);
    }
  }
  if (hoechste > letzte && !bericht.fehler) {
    await einstellungSetzen(db, 'buchung_letzte_nr', String(hoechste), wer);
    await client.abgeholt(hoechste);
  }
  // Erst nach den Buchungen: die neuen Reservierungen stehen dann schon in den belegten Zeiten
  bericht.angebot = await client.angebotSenden(await angebotErstellen(db, graph, { jetzt: o.jetzt }));
  return bericht;
}
