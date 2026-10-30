/** Aktionen: Patient anlegen, Stammdaten, Kontaktwege, Adressen, Kontaktverlauf, Archiv (W63–W68) */
import { istId } from '../../db/werte.ts';
import { kontaktart } from '../formular.ts';
import { lexwareNummerFrei, lexwareVerknuepfen } from '../lexware-kunden.ts';
import {
  adresseLoeschen, adresseSpeichern, anrufBeginnen, dubletteLoeschen, dublettenPaare, keineDublette, KarteiFehler, kontaktLoeschen, kontaktSpeichern, patientAnlegen, patientLesen,
  rechnungsadresseSetzen, stammdatenSpeichern, statusSetzen, verlaufAbschliessen, verlaufEintragen, verlaufVerwerfen, zusammenfuehren, type Kontaktart,
} from '../patienten.ts';
import type { Aktionen } from './kontext.ts';

/** Eine Adresskachel des Stammdatenformulars (W115b): Felder adr_<n>_<feld>; `wie_rechnung` übernimmt die Felder der Rechnungsadresse, `loeschen` entfernt */
interface AdresseGruppe { n: string; id?: string; bezeichnung?: string; zusatz?: string; strasse?: string; hausnummer?: string; plz?: string; ort?: string; typ?: string; wie_rechnung?: string; loeschen?: string }
const angegeben = (a: Partial<AdresseGruppe> | undefined): boolean => Boolean(a && (a.strasse?.trim() || a.ort?.trim() || a.plz?.trim()));
type AdresseQuelle = { zusatz?: string | null; strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null | undefined;
/** Alle Kacheln des Formulars in ihrer Reihenfolge; die alten Feldnamen ohne Nummer (Lexware-Vorbelegung, ältere Aufrufer) zählen als eine Rechnungsadresse */
function adressGruppen(f: URLSearchParams, g: (n: string) => string | undefined): AdresseGruppe[] {
  const gruppen = new Map<string, AdresseGruppe>();
  for (const [k, v] of f) {
    const m = /^adr_(\d+)_([a-z_]+)$/.exec(k);
    if (!m) continue;
    const e = gruppen.get(m[1]!) ?? { n: m[1]! };
    (e as unknown as Record<string, string>)[m[2]!] = v;
    gruppen.set(m[1]!, e);
  }
  const liste = [...gruppen.values()].sort((a, b) => Number(a.n) - Number(b.n));
  if (!liste.length && (g('strasse') || g('ort') || g('plz'))) liste.push({ n: '0', bezeichnung: g('adresse_bezeichnung'), strasse: g('strasse'), hausnummer: g('hausnummer'), plz: g('plz'), ort: g('ort'), typ: 'rechnung' });
  return liste;
}
const TYP_NAME: Record<string, string> = { rechnung: 'Zuhause', hausbesuch: 'Hausbesuch', betreuer: 'Betreuer' };
/** Die Felder einer Kachel als Adresse; mit „wie_rechnung“ und leeren Feldern kommen Straße, Ort … aus der Quelle */
const alsAdresse = (a: AdresseGruppe, quelle?: AdresseQuelle) => {
  const q = a.wie_rechnung && !angegeben(a) && quelle ? quelle : a;
  const typ = (['rechnung', 'hausbesuch', 'betreuer'].includes(a.typ ?? '') ? a.typ! : 'rechnung') as 'rechnung' | 'hausbesuch' | 'betreuer';
  return { bezeichnung: a.bezeichnung?.trim() || TYP_NAME[typ]!, zusatz: q.zusatz ?? null, strasse: q.strasse ?? null, hausnummer: q.hausnummer ?? null, plz: q.plz ?? null, ort: q.ort ?? null, typ };
};

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
    // Adressen als Kacheln (W115b): die gewählte (sonst die erste) wird Rechnungsadresse; Preisliste und Rechnungsversand gleich beim Anlegen
    const gruppen = adressGruppen(f, g);
    const wahl = g('rechnungsadresse_wahl');
    const rechnung = gruppen.find((x) => x.n === wahl && angegeben(x)) ?? gruppen.find(angegeben);
    const adressen = gruppen.filter((x) => angegeben(x) || (x.wie_rechnung && rechnung)).map((x) => ({ ...alsAdresse(x, rechnung), land: g('land'), rechnungsadresse: x === rechnung }));
    const neu = await patientAnlegen(db, t, {
      anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsdatum: g('geburtsdatum'), patientSeit: g('patient_seit'),
      ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kontakte,
      geburtsname: g('geburtsname'), kommunikationshilfe: g('kommunikationshilfe'), berufBelastung: g('beruf_belastung'), notiz: g('notiz'),
      preislisteId: g('preisliste_id') || undefined, rechnungsversand: g('rechnungsversand'), adressen,
    }, wer);
    // Gibt es den Patienten womöglich schon (W119)? Dann führt der Weg zuerst zur Klärung – Lilli entscheidet
    const dubletten = (await dublettenPaare(db, { patientId: neu })).length;
    const ziel = (sonst: string) => (dubletten ? `/patienten/${neu}/dubletten` : sonst);
    const klaeren = dubletten ? ' Möglicherweise gibt es diesen Patienten schon – bitte klären.' : '';
    if (lexwareNummer) {
      await lexwareVerknuepfen(db, neu, { nummer: lexwareNummer, kontaktId: g('lexware_kontakt_id') }, wer);
      return nach(ziel(`/patienten/${neu}`), `Patient angelegt und mit Lexware-Kunde ${lexwareNummer} verknüpft.${klaeren}`);
    }
    // Aus einer Terminanfrage angelegt (A15): zuordnen und zurück zur Anfrage
    const anfrageId = g('anfrage_id');
    if (anfrageId && istId(anfrageId)) {
      await db.query('UPDATE terminanfrage SET patient_id = $2, geaendert_am = now() WHERE id = $1 AND patient_id IS NULL', [anfrageId, neu]);
      return nach(ziel(`/anfragen/${anfrageId}`), `Patient angelegt und der Anfrage zugeordnet.${klaeren}`);
    }
    return nach(ziel(`/patienten/${neu}`), `Patient angelegt.${klaeren}`);
  },
};

/** Dubletten klären (W119): keine Dublette, zusammenführen, löschen – jede Entscheidung trifft Lilli auf der Klärungsseite */
export const DUBLETTEN: Aktionen = {
  async dublette_keine({ db, id, g, wer, nach, seite }) {
    await keineDublette(db, id, g('anderer_id') ?? '', wer);
    return nach(seite, 'Keine Dublette – beide Patienten bleiben, das Symbol verschwindet.');
  },
  async dublette_zusammenfuehren({ db, id, g, wer, nach, spiegeln }) {
    const anderer = g('anderer_id') ?? '';
    const behalten = g('behalten') === anderer ? anderer : id;
    const weg = behalten === id ? anderer : id;
    const e = await zusammenfuehren(db, behalten, weg, wer);
    // Kommende Termine der Dublette tragen im Kalender noch ihre Initialen und Nummer – nachziehen (höchstens zwanzig, der Abgleich holt den Rest)
    let kalender = '';
    for (const terminId of e.termine.slice(0, 20)) kalender = await spiegeln(terminId);
    return nach(`/patienten/${behalten}`, `Zusammengeführt: ${e.text} von ${e.dublette.patientennummer} nach ${e.behalten.patientennummer}; ${e.dublette.patientennummer} ist archiviert und verweist hierher.${kalender}`);
  },
  async dublette_loeschen({ db, id, g, wer, nach }) {
    const anderer = g('anderer_id') ?? '';
    const weg = g('loeschen_id') ?? '';
    if (weg !== id && weg !== anderer) throw new KarteiFehler('Welcher Patient gelöscht werden soll, ist unklar');
    const bleibt = weg === id ? anderer : id;
    const { patientennummer } = await dubletteLoeschen(db, weg, wer);
    return nach(`/patienten/${bleibt}`, `${patientennummer} gelöscht – es war nichts verknüpft.`);
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
    const patient = await patientLesen(db, t, id);
    const vorhandene = patient?.kontakte ?? [];
    const kennung = (art: Kontaktart) => g(`${art}_id`) || (vorhandene.find((k) => k.art === art && k.primaer) ?? vorhandene.find((k) => k.art === art))?.id;
    for (const art of ['mobil', 'telefon', 'email'] as const) {
      const wert = g(art)?.trim();
      if (wert) await kontaktSpeichern(db, id, { kontaktId: kennung(art), art, wert, primaer: true }, wer);
    }
    if (f.has('whatsapp_wie_mobil') && g('mobil')?.trim()) await kontaktSpeichern(db, id, { kontaktId: kennung('whatsapp'), art: 'whatsapp', wert: g('mobil')!.trim(), primaer: true }, wer);
    // Adressen als Kacheln (W115b): entfernen, ändern (nur was sich geändert hat), neue anlegen; die gewählte wird Rechnungsadresse
    const gruppen = adressGruppen(f, g);
    const wahl = g('rechnungsadresse_wahl');
    const rechnungQuelle = gruppen.find((x) => x.n === wahl && angegeben(x)) ?? patient?.adressen.find((a) => a.rechnungsadresse) ?? null;
    for (const x of gruppen) {
      if (x.loeschen && x.id) { await adresseLoeschen(db, id, x.id, wer); continue; }
      if (!angegeben(x) && !(x.wie_rechnung && rechnungQuelle)) continue;
      const a = alsAdresse(x, rechnungQuelle);
      const rechnungsadresse = wahl === undefined ? Boolean(x.id && patient?.adressen.find((v) => v.id === x.id)?.rechnungsadresse) : x.n === wahl;
      const alt = x.id ? patient?.adressen.find((v) => v.id === x.id) : undefined;
      const unveraendert = alt && alt.bezeichnung === a.bezeichnung && (alt.zusatz ?? null) === a.zusatz && (alt.strasse ?? null) === a.strasse && (alt.hausnummer ?? null) === a.hausnummer && (alt.plz ?? null) === a.plz && (alt.ort ?? null) === a.ort && alt.typ === a.typ && alt.rechnungsadresse === rechnungsadresse;
      if (!unveraendert) await adresseSpeichern(db, id, { adresseId: x.id || undefined, ...a, rechnungsadresse }, wer);
    }
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
