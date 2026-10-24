/**
 * Kartei-Dienst für den Praxisdienst: Seitendaten und Aktionen (W63–W68). Schreibt nur in die
 * eigene Datenbank – in Test und Produktion gleichermaßen erlaubt (die Testdatenbank enthält nur
 * erfundene Patienten, N28).
 */
import type { Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import {
  adresseLoeschen, adresseSpeichern, akte, anrufBeginnen, behandlungErfassen, gespraechsgruende, KarteiFehler, kontaktLoeschen, kontaktSpeichern, kontaktverlauf,
  offeneFaelle, patientAnlegen, patientenListe, patientLesen, rechnungen, rechnungsadresseSetzen, stammdatenSpeichern, statusSetzen, terminAnlegen, terminStatus,
  termine, verlaufAbschliessen, verlaufEintragen, verlaufVerwerfen, verordnungAnlegen, verordnungen,
  type Fall, type Gespraechsgrund, type Kontaktart, type Patient, type PatientKurz, type RechnungKurz, type TerminKurz, type VerlaufEintrag, type VerordnungKurz,
} from './patienten.ts';

export { KarteiFehler };

export interface PatientSeiteDaten {
  patient: Patient;
  verlauf: VerlaufEintrag[];
  gruende: Gespraechsgrund[];
  termine: TerminKurz[];
  verordnungen: VerordnungKurz[];
  rechnungen: RechnungKurz[];
}

export interface AkteDaten {
  patient: Patient;
  faelle: Fall[];
}

export interface NeuAktionDaten {
  patient: Patient;
  faelle: { id: string; nummer: number; grundlage: string; bezeichnung: string | null }[];
  verordnungen: VerordnungKurz[];
  termine: TerminKurz[];
}

export interface KarteiDienst {
  liste(o: { suche?: string; archiv?: boolean }): Promise<PatientKurz[]>;
  patient(id: string): Promise<PatientSeiteDaten | undefined>;
  akte(id: string, wer: string): Promise<AkteDaten | undefined>;
  neuAktion(id: string): Promise<NeuAktionDaten | undefined>;
  gruende(): Promise<Gespraechsgrund[]>;
  aktion(f: URLSearchParams, wer: string): Promise<{ ziel: string; meldung: string }>;
}

const ARTEN: Kontaktart[] = ['mobil', 'telefon', 'whatsapp', 'email', 'sonstige'];
const kontaktart = (s: string | null): Kontaktart => (ARTEN.includes(s as Kontaktart) ? (s as Kontaktart) : 'sonstige');
const ganz = (s: string | null, standard = 0) => (s && /^\d+$/.test(s.trim()) ? Number(s) : standard);
const istId = (s: string) => /^\d+$/.test(s);

export function karteiDienst(q: { db: Db; tresor: Tresor }): KarteiDienst {
  const { db, tresor: t } = q;
  return {
    liste: (o) => patientenListe(db, t, o),
    async patient(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      return {
        patient, verlauf: await kontaktverlauf(db, t, id), gruende: await gespraechsgruende(db),
        termine: await termine(db, id, { kommend: true }), verordnungen: await verordnungen(db, id), rechnungen: await rechnungen(db, id),
      };
    },
    async akte(id, wer) {
      const patient = await patientLesen(db, t, id);
      return patient ? { patient, faelle: await akte(db, t, id, wer) } : undefined;
    },
    async neuAktion(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      return { patient, faelle: await offeneFaelle(db, t, id), verordnungen: (await verordnungen(db, id)).filter((v) => v.status === 'aktiv'), termine: await termine(db, id) };
    },
    gruende: () => gespraechsgruende(db),
    async aktion(f, wer) {
      const id = f.get('id') ?? '';
      const g = (name: string) => f.get(name) ?? undefined;
      const nach = (pfad: string, meldung: string) => ({ ziel: pfad, meldung });
      const seite = `/patienten/${id}`;
      const aktion = f.get('aktion');
      if (aktion === 'anlegen') {
        const kontakte: { art: Kontaktart; wert: string }[] = [];
        if (g('mobil')) kontakte.push({ art: 'mobil', wert: g('mobil')! });
        if (g('telefon')) kontakte.push({ art: 'telefon', wert: g('telefon')! });
        if (g('mobil') && f.has('whatsapp_wie_mobil')) kontakte.push({ art: 'whatsapp', wert: g('mobil')! });
        else if (g('whatsapp')) kontakte.push({ art: 'whatsapp', wert: g('whatsapp')! });
        if (g('email')) kontakte.push({ art: 'email', wert: g('email')! });
        const neu = await patientAnlegen(db, t, {
          anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsdatum: g('geburtsdatum'), patientSeit: g('patient_seit'),
          ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kontakte,
          adresse: { bezeichnung: g('adresse_bezeichnung') ?? 'Zuhause', zusatz: null, strasse: g('strasse') ?? null, hausnummer: g('hausnummer') ?? null, plz: g('plz') ?? null, ort: g('ort') ?? null, land: g('land') },
        }, wer);
        return nach(`/patienten/${neu}`, 'Patient angelegt.');
      }
      if (!istId(id)) throw new KarteiFehler('Unbekannter Patient');
      switch (aktion) {
        case 'stammdaten':
          await stammdatenSpeichern(db, t, id, {
            anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsname: g('geburtsname'), geburtsdatum: g('geburtsdatum'),
            patientSeit: g('patient_seit'), ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kommunikationshilfe: g('kommunikationshilfe'),
            berufBelastung: g('beruf_belastung'), notiz: g('notiz'),
          }, wer);
          return nach(seite, 'Stammdaten gespeichert.');
        case 'kontakt_speichern':
          await kontaktSpeichern(db, id, { kontaktId: g('kontakt_id'), art: kontaktart(f.get('art')), wert: g('wert') ?? '', bezeichnung: g('bezeichnung'), primaer: f.has('primaer') }, wer);
          return nach(`${seite}#kontakte`, 'Kontakt gespeichert.');
        case 'kontakt_loeschen':
          await kontaktLoeschen(db, id, g('kontakt_id') ?? '', wer);
          return nach(`${seite}#kontakte`, 'Kontakt entfernt.');
        case 'adresse_speichern':
          await adresseSpeichern(db, id, {
            adresseId: g('adresse_id'), bezeichnung: g('bezeichnung'), zusatz: g('zusatz'), strasse: g('strasse'), hausnummer: g('hausnummer'), plz: g('plz'), ort: g('ort'), land: g('land'),
            rechnungsadresse: f.has('rechnungsadresse'),
          }, wer);
          return nach(`${seite}#adressen`, 'Adresse gespeichert.');
        case 'adresse_loeschen':
          await adresseLoeschen(db, id, g('adresse_id') ?? '', wer);
          return nach(`${seite}#adressen`, 'Adresse entfernt.');
        case 'rechnungsadresse':
          await rechnungsadresseSetzen(db, id, g('adresse_id') ?? '', wer);
          return nach(`${seite}#adressen`, 'Rechnungsadresse gesetzt.');
        case 'anruf':
          await anrufBeginnen(db, id, g('kontakt_id'), wer);
          return nach(`${seite}#verlauf`, 'Anruf vermerkt – nach dem Gespräch bitte den Grund wählen.');
        case 'verlauf_abschliessen':
          await verlaufAbschliessen(db, t, id, g('eintrag_id') ?? '', { grund: g('grund') ?? '', notiz: g('notiz') }, wer);
          return nach(`${seite}#verlauf`, 'Gespräch eingetragen.');
        case 'verlauf_verwerfen':
          await verlaufVerwerfen(db, id, g('eintrag_id') ?? '');
          return nach(`${seite}#verlauf`, 'Eintrag verworfen – es kam kein Gespräch zustande.');
        case 'verlauf_eintragen':
          await verlaufEintragen(db, t, id, { art: g('art') ?? 'notiz', grund: g('grund'), notiz: g('notiz'), kontaktId: g('kontakt_id') }, wer);
          return nach(`${seite}#verlauf`, 'Eintrag gespeichert.');
        case 'termin_anlegen':
          await terminAnlegen(db, id, { datum: g('datum') ?? '', zeit: g('zeit') ?? '', dauerMin: ganz(f.get('dauer_min'), 30), art: g('art'), verordnungId: g('verordnung_id'), fallId: g('fall_id') }, wer);
          return nach(`${seite}#termine`, 'Termin angelegt – er steht bisher nur hier, noch nicht im Kalender.');
        case 'termin_status':
          await terminStatus(db, id, g('termin_id') ?? '', g('status') ?? '', wer);
          return nach(`${seite}#termine`, 'Termin geändert.');
        case 'verordnung_anlegen':
          await verordnungAnlegen(db, t, id, {
            ausgestelltAm: g('ausgestellt_am') ?? '', arzt: g('arzt'), massnahme: g('massnahme') ?? '', leistungNummer: g('leistung_nummer'), anzahl: ganz(f.get('anzahl')),
            frequenz: g('frequenz'), diagnose: g('diagnose'), gueltigBis: g('gueltig_bis'), fallId: g('fall_id'),
          }, wer);
          return nach(`${seite}#rezepte`, 'Rezept angelegt.');
        case 'behandlung_erfassen': {
          const neu = g('fall_id') === 'neu';
          const e = await behandlungErfassen(db, t, id, {
            fallId: neu ? undefined : g('fall_id'),
            neuerFall: neu ? { grundlage: g('grundlage') ?? '', bezeichnung: g('fall_bezeichnung'), anlass: g('anlass'), diagnoseArzt: g('diagnose_arzt') } : undefined,
            datum: g('datum') ?? '', dauerMin: ganz(f.get('dauer_min')) || undefined, terminId: g('termin_id') || undefined, verordnungId: g('verordnung_id') || undefined,
            leistungNummer: g('leistung_nummer'), massnahmen: g('massnahmen'), verlaufWirkung: g('verlauf_wirkung'), reaktionen: g('reaktionen'), uebungen: g('uebungen'),
          }, wer);
          return nach(`/patienten/${id}/akte#b-${e.behandlungId}`, 'Behandlung in der Akte eingetragen.');
        }
        case 'archivieren':
          await statusSetzen(db, id, 'archiviert', wer);
          return nach('/patienten', 'Patient archiviert – die Akte bleibt erhalten.');
        case 'reaktivieren':
          await statusSetzen(db, id, 'aktiv', wer);
          return nach(seite, 'Patient ist wieder aktiv.');
        default:
          throw new KarteiFehler('Unbekannte Aktion');
      }
    },
  };
}
