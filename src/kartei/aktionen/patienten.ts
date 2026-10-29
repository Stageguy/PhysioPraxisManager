/** Aktionen: Patient anlegen, Stammdaten, Kontaktwege, Adressen, Kontaktverlauf, Archiv (W63–W68) */
import { istId } from '../../db/werte.ts';
import { kontaktart } from '../formular.ts';
import { lexwareNummerFrei, lexwareVerknuepfen } from '../lexware-kunden.ts';
import {
  adresseLoeschen, adresseSpeichern, anrufBeginnen, kontaktLoeschen, kontaktSpeichern, patientAnlegen, rechnungsadresseSetzen, stammdatenSpeichern, statusSetzen,
  verlaufAbschliessen, verlaufEintragen, verlaufVerwerfen, type Kontaktart,
} from '../patienten.ts';
import type { Aktionen } from './kontext.ts';

/** Ohne Patient: der Patient entsteht erst */
export const PATIENT_ANLEGEN: Aktionen = {
  async anlegen({ db, t, g, f, wer, nach }) {
    const kontakte: { art: Kontaktart; wert: string }[] = [];
    if (g('mobil')) kontakte.push({ art: 'mobil', wert: g('mobil')! });
    if (g('telefon')) kontakte.push({ art: 'telefon', wert: g('telefon')! });
    if (g('mobil') && f.has('whatsapp_wie_mobil')) kontakte.push({ art: 'whatsapp', wert: g('mobil')! });
    else if (g('whatsapp')) kontakte.push({ art: 'whatsapp', wert: g('whatsapp')! });
    if (g('email')) kontakte.push({ art: 'email', wert: g('email')! });
    // Aus Lexware (W99): die Kundennummer muss frei sein, bevor der Patient entsteht
    const lexwareNummer = g('lexware_kundennummer')?.trim() || undefined;
    if (lexwareNummer) await lexwareNummerFrei(db, lexwareNummer);
    const neu = await patientAnlegen(db, t, {
      anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsdatum: g('geburtsdatum'), patientSeit: g('patient_seit'),
      ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kontakte,
      geburtsname: g('geburtsname'), kommunikationshilfe: g('kommunikationshilfe'), berufBelastung: g('beruf_belastung'), notiz: g('notiz'),
      adresse: { bezeichnung: g('adresse_bezeichnung') ?? 'Zuhause', zusatz: null, strasse: g('strasse') ?? null, hausnummer: g('hausnummer') ?? null, plz: g('plz') ?? null, ort: g('ort') ?? null, land: g('land') },
    }, wer);
    if (lexwareNummer) {
      await lexwareVerknuepfen(db, neu, { nummer: lexwareNummer, kontaktId: g('lexware_kontakt_id') }, wer);
      return nach(`/patienten/${neu}`, `Patient angelegt und mit Lexware-Kunde ${lexwareNummer} verknüpft.`);
    }
    // Aus einer Terminanfrage angelegt (A15): zuordnen und zurück zur Anfrage
    const anfrageId = g('anfrage_id');
    if (anfrageId && istId(anfrageId)) {
      await db.query('UPDATE terminanfrage SET patient_id = $2, geaendert_am = now() WHERE id = $1 AND patient_id IS NULL', [anfrageId, neu]);
      return nach(`/anfragen/${anfrageId}`, 'Patient angelegt und der Anfrage zugeordnet.');
    }
    return nach(`/patienten/${neu}`, 'Patient angelegt.');
  },
};

export const PATIENT: Aktionen = {
  async stammdaten({ db, t, id, g, f, wer, nach, seite }) {
    await stammdatenSpeichern(db, t, id, {
      anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsname: g('geburtsname'), geburtsdatum: g('geburtsdatum'),
      patientSeit: g('patient_seit'), ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kommunikationshilfe: g('kommunikationshilfe'),
      berufBelastung: g('beruf_belastung'), notiz: g('notiz'), preislisteId: f.has('preisliste_id') ? (g('preisliste_id') || 'standard') : undefined, rechnungsversand: g('rechnungsversand'),
    }, wer);
    return nach(seite, 'Stammdaten gespeichert.');
  },
  async kontakt_speichern({ db, id, g, f, wer, nach, seite }) {
    await kontaktSpeichern(db, id, { kontaktId: g('kontakt_id'), art: kontaktart(f.get('art')), wert: g('wert') ?? '', bezeichnung: g('bezeichnung'), primaer: f.has('primaer') }, wer);
    return nach(`${seite}#kontakte`, 'Kontakt gespeichert.');
  },
  async kontakt_loeschen({ db, id, g, wer, nach, seite }) {
    await kontaktLoeschen(db, id, g('kontakt_id') ?? '', wer);
    return nach(`${seite}#kontakte`, 'Kontakt entfernt.');
  },
  async adresse_speichern({ db, id, g, f, wer, nach, seite }) {
    await adresseSpeichern(db, id, {
      adresseId: g('adresse_id'), bezeichnung: g('bezeichnung'), zusatz: g('zusatz'), strasse: g('strasse'), hausnummer: g('hausnummer'), plz: g('plz'), ort: g('ort'), land: g('land'),
      rechnungsadresse: f.has('rechnungsadresse'), typ: (g('typ') ?? 'rechnung') as 'rechnung' | 'hausbesuch' | 'betreuer',
    }, wer);
    return nach(`${seite}#adressen`, 'Adresse gespeichert.');
  },
  async adresse_loeschen({ db, id, g, wer, nach, seite }) {
    await adresseLoeschen(db, id, g('adresse_id') ?? '', wer);
    return nach(`${seite}#adressen`, 'Adresse entfernt.');
  },
  async rechnungsadresse({ db, id, g, wer, nach, seite }) {
    await rechnungsadresseSetzen(db, id, g('adresse_id') ?? '', wer);
    return nach(`${seite}#adressen`, 'Rechnungsadresse gesetzt.');
  },
  async anruf({ db, id, g, wer, nach, seite }) {
    await anrufBeginnen(db, id, g('kontakt_id'), wer);
    return nach(`${seite}#verlauf`, 'Anruf vermerkt – nach dem Gespräch bitte den Grund wählen.');
  },
  async verlauf_abschliessen({ db, t, id, g, wer, nach, seite }) {
    await verlaufAbschliessen(db, t, id, g('eintrag_id') ?? '', { grund: g('grund') ?? '', notiz: g('notiz') }, wer);
    return nach(`${seite}#verlauf`, 'Gespräch eingetragen.');
  },
  async verlauf_verwerfen({ db, id, g, nach, seite }) {
    await verlaufVerwerfen(db, id, g('eintrag_id') ?? '');
    return nach(`${seite}#verlauf`, 'Eintrag verworfen – es kam kein Gespräch zustande.');
  },
  async verlauf_eintragen({ db, t, id, g, wer, nach, seite }) {
    await verlaufEintragen(db, t, id, { art: g('art') ?? 'notiz', grund: g('grund'), notiz: g('notiz'), kontaktId: g('kontakt_id') }, wer);
    return nach(`${seite}#verlauf`, 'Eintrag gespeichert.');
  },
  async archivieren({ db, id, wer, nach }) {
    await statusSetzen(db, id, 'archiviert', wer);
    return nach('/patienten', 'Patient archiviert – die Akte bleibt erhalten.');
  },
  async reaktivieren({ db, id, wer, nach, seite }) {
    await statusSetzen(db, id, 'aktiv', wer);
    return nach(seite, 'Patient ist wieder aktiv.');
  },
};
