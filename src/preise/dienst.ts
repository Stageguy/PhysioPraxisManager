/**
 * Preislisten-Dienst für den Praxisdienst: Seitendaten und Aktionen (W59). Schreibt nur in die
 * eigene Datenbank und liest öffentliche Quellen – deshalb auch in der Testumgebung erlaubt.
 */
import type { Db } from '../db/index.ts';
import type { NeuDaten, UebersichtDaten } from '../web/preislisten.ts';
import {
  aktivSetzen, alsVorlage, anlegen, archivieren, beihilfeSetzen, freigeben, listen, loeschen, musterAbweichung, musterHakenUebernehmen, positionDetail, positionen,
  PreislisteFehler, preisliste, quellen, speichern, verwendung, vorlagen, wiederherstellen, type Position, type PositionDetail, type Preisliste, type Vorlage,
} from './preislisten.ts';
import { allePruefen, alsGesehen, neueQuellen, type Pruefergebnis } from './quellen.ts';

export { PreislisteFehler };

const ART = { gkv: 'GKV', beihilfe: 'Beihilfe', gebueth: 'GebüTh' } as const;
export const pruefText = (e: Pruefergebnis[]) =>
  e.map((p) => `${ART[p.art]}: ${p.fehler ? `Fehler (${p.fehler})` : p.neu ? `neu – ${p.version}` : 'unverändert'}`).join(' · ');

export interface PreislistenDienst {
  neueAnzahl(): Promise<number>;
  uebersicht(): Promise<UebersichtDaten>;
  neu(vorwahl: { gkv?: string; basis?: string }): Promise<NeuDaten>;
  auswahl(archiv: boolean): Promise<Preisliste[]>;
  /** `musterFrage`: nach dem Speichern prüfen, ob die Liste vom Muster abweicht */
  editor(id: string, musterFrage?: boolean): Promise<{ liste: Preisliste; positionen: Position[]; muster: Vorlage[]; abweichung?: { muster: Vorlage; unterschiede: number } } | undefined>;
  details(id: string): Promise<{ liste: Preisliste; positionen: Position[]; verwendung: { patienten: string[]; rechnungen: string[] } } | undefined>;
  position(id: string, posId: string): Promise<{ liste: Preisliste; detail: PositionDetail } | undefined>;
  original(quelleId: string): Promise<{ daten: Uint8Array; typ: string; name: string } | undefined>;
  aktion(f: URLSearchParams, wer: string): Promise<{ ziel: string; meldung: string }>;
}

export function preislistenDienst(q: { db: Db; holen?: (url: string) => Promise<Response>; textAus?: (b: Uint8Array) => Promise<string> }): PreislistenDienst {
  const { db } = q;
  const pruefen = () => allePruefen(db, { speichern: true, holen: q.holen, textAus: q.textAus });
  const stand = async () => {
    const r: UebersichtDaten['stand'] = {};
    for (const art of ['gkv', 'beihilfe', 'gebueth'] as const) r[art] = (await quellen(db, art))[0];
    return r;
  };
  return {
    neueAnzahl: async () => (await neueQuellen(db)).length,
    async uebersicht() {
      return { neu: await neueQuellen(db), listen: await listen(db), stand: await stand() };
    },
    async neu(vorwahl) {
      // „Neu“ prüft zuerst auf neue Grundlagen – höchstens einmal je Stunde, damit die Seite schnell bleibt
      const letzte = (await db.query<{ t: Date | null }>('SELECT max(abgerufen_am) AS t FROM preisquelle')).rows[0]?.t;
      const pruefung = !letzte || Date.now() - new Date(letzte).getTime() > 3600_000 ? await pruefen() : undefined;
      return {
        gkv: await quellen(db, 'gkv'), beihilfe: await quellen(db, 'beihilfe'), gebueth: (await quellen(db, 'gebueth'))[0],
        listen: await listen(db), vorlagen: await vorlagen(db), vorwahl, pruefung,
      };
    },
    auswahl: (archiv) => listen(db, { archiv }),
    async editor(id, musterFrage) {
      const liste = await preisliste(db, id);
      if (!liste) return undefined;
      const abweichung = musterFrage && liste.status === 'entwurf' ? await musterAbweichung(db, id) : undefined;
      return { liste, positionen: await positionen(db, id), muster: await vorlagen(db), abweichung };
    },
    async details(id) {
      const liste = await preisliste(db, id);
      return liste ? { liste, positionen: await positionen(db, id), verwendung: await verwendung(db, id) } : undefined;
    },
    async position(id, posId) {
      const liste = await preisliste(db, id);
      const detail = liste ? await positionDetail(db, id, posId) : undefined;
      return liste && detail ? { liste, detail } : undefined;
    },
    async original(quelleId) {
      if (!/^\d+$/.test(quelleId)) return undefined;
      const r = (await db.query<{ art: string; rohdaten: Uint8Array | null; rohdaten_typ: string | null; version: string }>(
        'SELECT art::text, rohdaten, rohdaten_typ, version FROM preisquelle WHERE id = $1', [quelleId],
      )).rows[0];
      if (!r?.rohdaten) return undefined;
      const endung = r.rohdaten_typ?.startsWith('application/pdf') ? 'pdf' : r.rohdaten_typ?.startsWith('text/html') ? 'html' : 'txt';
      return { daten: r.rohdaten, typ: r.rohdaten_typ ?? 'application/octet-stream', name: `${r.art}-${r.version.replace(/[^\w.-]+/g, '_')}.${endung}` };
    },
    async aktion(f, wer) {
      const id = f.get('id') ?? '';
      const nach = (pfad: string, meldung: string) => ({ ziel: pfad, meldung });
      switch (f.get('aktion')) {
        case 'pruefen':
          return nach('/preislisten', `Grundlagen geprüft – ${pruefText(await pruefen())}`);
        case 'gesehen':
          await alsGesehen(db, wer);
          return nach('/preislisten', 'Neue Grundlagen als gesehen markiert.');
        case 'aktiv': {
          const aktivId = f.get('aktiv_id') ?? id;
          await aktivSetzen(db, aktivId, wer);
          return nach(f.get('zurueck') ?? '/preislisten', `„${(await preisliste(db, aktivId))?.name}“ ist jetzt die aktive Preisliste.`);
        }
        case 'anlegen': {
          const grundlage = f.get('grundlage');
          const faktor = (f.get('standard_faktor') ?? '').trim().replace(',', '.');
          if (faktor && !(Number(faktor) > 0)) throw new PreislisteFehler('Der Faktor muss eine Zahl größer 0 sein, z. B. 1,3');
          const neu = await anlegen(db, {
            name: f.get('name') ?? '',
            gkvQuelleId: grundlage === 'preisliste' ? undefined : f.get('gkv_id') || undefined,
            basisPreislisteId: grundlage === 'preisliste' ? f.get('basis_id') || undefined : undefined,
            beihilfeQuelleId: f.get('beihilfe_id') || undefined,
            vorlageId: f.get('vorlage_id') || undefined,
            standardFaktor: faktor ? Number(faktor) : undefined,
            aufrunden: f.has('aufrunden'),
            wer,
          });
          return nach(`/preislisten/${neu}/bearbeiten`, 'Preisliste angelegt – jetzt Positionen, Faktoren und Preise prüfen.');
        }
        case 'speichern': {
          const zeilen = f.getAll('z_nummer').map((nummer) => ({
            nummer, uebernehmen: f.has(`z_uebernehmen_${nummer}`), faktor: f.get(`z_faktor_${nummer}`) ?? '', eigenerPreis: f.get(`z_preis_${nummer}`) ?? '',
          }));
          await speichern(db, id, { name: f.get('name') ?? '', standardFaktor: f.get('standard_faktor') ?? '', aufrunden: f.has('aufrunden'), zeilen }, wer);
          // Weicht die Liste jetzt vom Muster ab, fragt die Seite, ob es ein neues Muster geben soll
          const abw = await musterAbweichung(db, id);
          return nach(`/preislisten/${id}/bearbeiten${abw ? '?muster_frage=1' : ''}`, 'Gespeichert.');
        }
        case 'muster_neu': {
          const name = (f.get('muster_name') ?? '').trim();
          if ((await vorlagen(db)).some((v) => v.name.toLowerCase() === name.toLowerCase())) {
            throw new PreislisteFehler(`Ein Muster „${name}“ gibt es schon – bitte einen anderen Namen wählen oder es aktualisieren`);
          }
          await alsVorlage(db, id, name, wer);
          return nach(`/preislisten/${id}/bearbeiten`, `Neues Muster „${name}“ gespeichert – die Preisliste folgt ihm.`);
        }
        case 'muster_aktualisieren': {
          const l = await preisliste(db, id);
          if (!l?.vorlage) throw new PreislisteFehler('Diese Preisliste hat kein Muster');
          await alsVorlage(db, id, l.vorlage.name, wer);
          return nach(`/preislisten/${id}/bearbeiten`, `Muster „${l.vorlage.name}“ aktualisiert.`);
        }
        case 'muster_nein':
          return nach(`/preislisten/${id}/bearbeiten`, 'Muster bleibt, wie es war.');
        case 'muster_haken': {
          const name = await musterHakenUebernehmen(db, id, f.get('vorlage_id') ?? '', wer);
          return nach(`/preislisten/${id}/bearbeiten`, `Haken aus Muster „${name}“ übernommen.`);
        }
        case 'freigeben':
          await freigeben(db, id, wer);
          return nach(`/preislisten/${id}`, 'Freigegeben – die Preisliste ist jetzt fest. Mit dem Knopf „aktiv“ wird sie für neue Rechnungen verwendet.');
        case 'loeschen':
          await loeschen(db, id, wer);
          return nach('/preislisten', 'Entwurf gelöscht.');
        case 'archivieren':
          await archivieren(db, id, wer);
          return nach('/preislisten/archiv', 'Archiviert – für Rechnungen nicht mehr wählbar.');
        case 'wiederherstellen':
        case 'wiederherstellen_aktiv':
          await wiederherstellen(db, id, wer, { aktiv: f.get('aktion') === 'wiederherstellen_aktiv' });
          return nach(f.get('zurueck') ?? '/preislisten', f.get('aktion') === 'wiederherstellen_aktiv' ? 'Wiederhergestellt und aktiv gesetzt.' : 'Wiederhergestellt.');
        case 'vorlage':
          await alsVorlage(db, id, f.get('vorlage_name') ?? '', wer);
          return nach(`/preislisten/${id}/bearbeiten`, `Muster „${f.get('vorlage_name')}“ gespeichert.`);
        case 'beihilfe': {
          const posId = f.get('position_id') ?? '';
          await beihilfeSetzen(db, id, posId, f.get('beihilfe_position_id') || null, f.get('notiz') ?? '', wer);
          return nach(`/preislisten/${id}/positionen/${posId}`, 'Zuordnung gespeichert.');
        }
        default:
          throw new PreislisteFehler('Unbekannte Aktion');
      }
    },
  };
}
