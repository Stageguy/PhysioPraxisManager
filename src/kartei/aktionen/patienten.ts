/** Aktionen: Patient anlegen, Stammdaten, Kontaktwege, Adressen, Kontaktverlauf, Archiv (W63–W68) */
import { istId } from '../../db/werte.ts';
import { kontaktart } from '../formular.ts';
import { lexwareNummerFrei, lexwareVerknuepfen } from '../lexware-kunden.ts';
import {
  adresseLoeschen, adresseSpeichern, anrufBeginnen, kontaktLoeschen, kontaktSpeichern, patientAnlegen, patientLesen, rechnungsadresseSetzen, stammdatenSpeichern, statusSetzen,
  verlaufAbschliessen, verlaufEintragen, verlaufVerwerfen, type Kontaktart,
} from '../patienten.ts';
import type { Aktionen } from './kontext.ts';

type AdresseFelder = { bezeichnung?: string; zusatz?: string; strasse?: string; hausnummer?: string; plz?: string; ort?: string };
/** Adresse aus den Kachel-Feldern ra_* (Rechnung) bzw. ha_* (Hausbesuch) des Stammdatenformulars (W115b); „ra“ versteht auch die alten Feldnamen ohne Vorsilbe */
const adresseAus = (g: (n: string) => string | undefined, art: 'ra' | 'ha'): AdresseFelder => {
  const feld = (k: string) => g(`${art}_${k}`) ?? (art === 'ra' ? g(k === 'bezeichnung' ? 'adresse_bezeichnung' : k) : undefined);
  return { bezeichnung: feld('bezeichnung'), zusatz: feld('zusatz'), strasse: feld('strasse'), hausnummer: feld('hausnummer'), plz: feld('plz'), ort: feld('ort') };
};
const angegeben = (a: AdresseFelder) => Boolean(a.strasse?.trim() || a.ort?.trim() || a.plz?.trim());
/** Hausbesuchadresse: eigene Felder oder, mit Haken „wie die Rechnungsadresse“ und leeren Feldern, die Rechnungsadresse */
const hausbesuchAus = (g: (n: string) => string | undefined, f: URLSearchParams, ra: AdresseFelder): AdresseFelder | undefined => {
  const ha = adresseAus(g, 'ha');
  if (angegeben(ha)) return ha;
  return f.has('ha_wie_rechnung') && angegeben(ra) ? { ...ra, bezeichnung: ha.bezeichnung?.trim() || 'Hausbesuch' } : undefined;
};
const alsAdresse = (a: AdresseFelder, standardName: string) => ({ bezeichnung: a.bezeichnung?.trim() || standardName, zusatz: a.zusatz ?? null, strasse: a.strasse ?? null, hausnummer: a.hausnummer ?? null, plz: a.plz ?? null, ort: a.ort ?? null });

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
    // Adressen als Kacheln (W115b): Rechnungsadresse und Hausbesuchadresse; Preisliste und Rechnungsversand gleich beim Anlegen
    const ra = adresseAus(g, 'ra');
    const ha = hausbesuchAus(g, f, ra);
    const neu = await patientAnlegen(db, t, {
      anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsdatum: g('geburtsdatum'), patientSeit: g('patient_seit'),
      ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kontakte,
      geburtsname: g('geburtsname'), kommunikationshilfe: g('kommunikationshilfe'), berufBelastung: g('beruf_belastung'), notiz: g('notiz'),
      preislisteId: g('preisliste_id') || undefined, rechnungsversand: g('rechnungsversand'),
      adresse: angegeben(ra) ? { ...alsAdresse(ra, 'Zuhause'), land: g('land') } : undefined,
      hausbesuchAdresse: ha ? alsAdresse(ha, 'Hausbesuch') : undefined,
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
    // Kontaktwege im Formular (W115b): die primären Einträge – leer lassen ändert nichts, Entfernen geht auf der Patientenseite.
    // Fehlt die Kennung im Formular, zählt der primäre Eintrag der Art, damit nie ein Doppelter entsteht
    const vorhandene = (await patientLesen(db, t, id))?.kontakte ?? [];
    const kennung = (art: Kontaktart) => g(`${art}_id`) || (vorhandene.find((k) => k.art === art && k.primaer) ?? vorhandene.find((k) => k.art === art))?.id;
    for (const art of ['mobil', 'telefon', 'email'] as const) {
      const wert = g(art)?.trim();
      if (wert) await kontaktSpeichern(db, id, { kontaktId: kennung(art), art, wert, primaer: true }, wer);
    }
    if (f.has('whatsapp_wie_mobil') && g('mobil')?.trim()) await kontaktSpeichern(db, id, { kontaktId: kennung('whatsapp'), art: 'whatsapp', wert: g('mobil')!.trim(), primaer: true }, wer);
    // Adressen als Kacheln (W115b): Rechnungsadresse und Hausbesuchadresse – mit Kennung ändern, ohne neu anlegen
    const ra = adresseAus(g, 'ra');
    if (angegeben(ra)) await adresseSpeichern(db, id, { adresseId: g('ra_id') || undefined, ...alsAdresse(ra, 'Zuhause'), rechnungsadresse: true, typ: 'rechnung' }, wer);
    const ha = hausbesuchAus(g, f, ra);
    if (ha) await adresseSpeichern(db, id, { adresseId: g('ha_id') || undefined, ...alsAdresse(ha, 'Hausbesuch'), rechnungsadresse: false, typ: 'hausbesuch' }, wer);
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
