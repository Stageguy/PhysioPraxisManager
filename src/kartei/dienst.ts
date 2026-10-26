/**
 * Kartei-Dienst für den Praxisdienst: Seitendaten und Aktionen (W63–W68, W73–W74). Schreibt nur in
 * die eigene Datenbank – in Test und Produktion gleichermaßen erlaubt (die Testdatenbank enthält nur
 * erfundene Patienten, N28).
 */
import type { Db } from '../db/index.ts';
import { istId } from '../db/werte.ts';
import type { GraphClient } from '../graph.ts';
import type { Tresor } from '../tresor.ts';
import { terminSpiegeln } from './kalender.ts';
import {
  adresseLoeschen, adresseSpeichern, akte, anrufBeginnen, behandlungErfassen, fallAnlegen, gespraechsgruende, KarteiFehler, kontaktLoeschen, kontaktSpeichern, kontaktverlauf,
  offeneFaelle, patientAnlegen, patientenListe, patientLesen, rechnungen, rechnungsadresseSetzen, serieAbschliessen, serien, stammdatenSpeichern, statusSetzen, terminAnlegen,
  terminStatus, termine, verlaufAbschliessen, verlaufEintragen, verlaufVerwerfen, verordnungAbbrechen, verordnungAnlegen, verordnungen, wellnessAktiv, wellnessLeistungen,
  wellnessSpeichern, zweitschriftVermerken,
  type Fall, type Gespraechsgrund, type Kontaktart, type Patient, type PatientKurz, type RechnungKurz, type Serie, type TerminKurz, type VerlaufEintrag, type VerordnungKurz,
  type WellnessLeistung,
} from './patienten.ts';
import { anamneseErfassen, befundErfassen, erklaerungErfassen, erklaerungWiderrufen, fallDetails, phaseSetzen, PHASEN, PHASEN_NAMEN, pinnwand, type FallDetails, type Phase, type Spalte } from './pinnwand.ts';
import { einstellungen, einstellungSetzen, textbausteinAktiv, textbausteine, textbausteinSpeichern, type Textbaustein } from './konfiguration.ts';
import {
  bausteinAendern, bausteinEntfernen, bausteinHinzufuegen, positionAendern, positionHinzufuegen, positionLoeschen, rechnungAnlegen, rechnungLesen, rechnungPdf, rechnungStatus, type Rechnung,
} from './rechnungen.ts';
import { termineZeitraum, type TerminKalender } from './patienten.ts';
import { listen as preislistenListen, type Preisliste } from '../preise/preislisten.ts';
import { steuerfreieUmsaetze, type SteuerListe } from './steuer.ts';
import { dokumente, mailEntwurf, whatsappAngebote, whatsappEingang, whatsappSenden, whatsappVermerken, type DokumentKurz, type WhatsAppAngebot } from './nachrichten.ts';
import { akteExport } from './akte-export.ts';
import { terminartAktiv, terminarten, terminartSpeichern, type Terminart } from './terminarten.ts';
import type { EingehendeNachricht, WhatsAppCloud } from '../whatsapp/schnittstelle.ts';

export { KarteiFehler };

export interface PatientSeiteDaten {
  patient: Patient;
  verlauf: VerlaufEintrag[];
  gruende: Gespraechsgrund[];
  termine: TerminKurz[];
  verordnungen: VerordnungKurz[];
  serien: Serie[];
  rechnungen: RechnungKurz[];
  /** freigegebene Preislisten für die Stammdaten */
  preislisten: Preisliste[];
  /** Unterlagen der Akte, die man einer Mail anhängen kann (W91) */
  dokumente: DokumentKurz[];
  /** WhatsApp-Knöpfe mit fertigem Text (Click-to-Chat, W90) */
  whatsapp: WhatsAppAngebot[];
  /** Cloud API eingerichtet – dann gibt es zusätzlich „Senden“ */
  whatsappCloud: boolean;
}

export interface AkteDaten {
  patient: Patient;
  faelle: Fall[];
}

export interface NeuAktionDaten {
  patient: Patient;
  faelle: { id: string; nummer: number; grundlage: string; bezeichnung: string | null }[];
  /** aktive Rezepte (Abhaken, Termine) */
  verordnungen: VerordnungKurz[];
  /** alle Rezepte (Vorgänger bei Folgerezept/Korrektur) */
  alleVerordnungen: VerordnungKurz[];
  termine: TerminKurz[];
  wellness: WellnessLeistung[];
  /** Terminarten (W94) – Farbe und Symbol des Termins im Kalender */
  terminarten: Terminart[];
}

export interface RezepteDaten {
  verordnungen: VerordnungKurz[];
  serien: Serie[];
  filter: 'aktiv' | 'alle';
}

export interface KarteiDienst {
  liste(o: { suche?: string; archiv?: boolean }): Promise<PatientKurz[]>;
  pinnwand(o: { archiv?: boolean }): Promise<Spalte[]>;
  fall(patientId: string, fallId: string, wer: string): Promise<{ patient: Patient; details: FallDetails; verordnungen: VerordnungKurz[]; termine: TerminKurz[]; rechnungen: RechnungKurz[] } | undefined>;
  patient(id: string): Promise<PatientSeiteDaten | undefined>;
  akte(id: string, wer: string): Promise<AkteDaten | undefined>;
  /** Die ganze Akte als PDF – Einsicht nach § 630g (A19d), jeder Export im Protokoll */
  aktePdf(id: string, wer: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  neuAktion(id: string): Promise<NeuAktionDaten | undefined>;
  rezepte(filter: 'aktiv' | 'alle'): Promise<RezepteDaten>;
  rechnung(patientId: string, rechnungId: string): Promise<{ patient: Patient; rechnung: Rechnung; textbausteine: Textbaustein[]; preislistePositionen: { id: string; nummer: string; bezeichnung: string; preis: number | null }[]; wellness: WellnessLeistung[] } | undefined>;
  rechnungPdf(patientId: string, rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  konfiguration(): Promise<{ textbausteine: Textbaustein[]; einstellungen: Record<string, string> }>;
  kalender(vonIso: string, bisIso: string): Promise<TerminKalender[]>;
  steuer(jahr: number, maskiert: boolean): Promise<SteuerListe>;
  wellness(): Promise<WellnessLeistung[]>;
  gruende(): Promise<Gespraechsgrund[]>;
  /** Terminarten der Online-Anfrage (W94) */
  terminarten(): Promise<Terminart[]>;
  /** Eingehende WhatsApp-Nachricht vom Webhook (W90) */
  whatsappEingang(n: EingehendeNachricht): Promise<'zugeordnet' | 'medien' | 'unbekannt'>;
  aktion(f: URLSearchParams, wer: string): Promise<{ ziel: string; meldung: string }>;
}

const ARTEN: Kontaktart[] = ['mobil', 'telefon', 'whatsapp', 'email', 'sonstige'];
const kontaktart = (s: string | null): Kontaktart => (ARTEN.includes(s as Kontaktart) ? (s as Kontaktart) : 'sonstige');
const ganz = (s: string | null, standard = 0) => (s && /^\d+$/.test(s.trim()) ? Number(s) : standard);

export function karteiDienst(q: { db: Db; tresor: Tresor; graph?: Pick<GraphClient, 'get' | 'post' | 'patch' | 'delete'>; whatsapp?: WhatsAppCloud }): KarteiDienst {
  const { db, tresor: t } = q;
  /** Termin in den Kalender spiegeln; scheitert der Kalender, bleibt der Termin in der Kartei und die Meldung sagt es */
  const spiegeln = async (terminId: string, wer: string): Promise<string> => {
    if (!q.graph) return ' Noch nicht im Kalender (kein Postfach verbunden).';
    try {
      const e = await terminSpiegeln(db, q.graph, terminId, wer);
      return e === 'angelegt' ? ' Steht auch im Kalender.' : e === 'entfernt' ? ' Aus dem Kalender genommen.' : e === 'aktualisiert' ? ' Kalender aktualisiert.' : '';
    } catch (err) {
      console.warn(`Kalender: ${(err as Error).message.slice(0, 200)}`);
      return ' Der Kalender war nicht erreichbar – der Abgleich holt es nach.';
    }
  };
  return {
    liste: (o) => patientenListe(db, t, o),
    pinnwand: (o) => pinnwand(db, t, o),
    async fall(patientId, fallId, wer) {
      const patient = await patientLesen(db, t, patientId);
      const details = patient ? await fallDetails(db, t, patientId, fallId, wer) : undefined;
      if (!patient || !details) return undefined;
      return { patient, details, verordnungen: (await verordnungen(db, { patientId })).filter((v) => v.fallId === fallId), termine: await termine(db, patientId, { kommend: true }), rechnungen: (await rechnungen(db, patientId)) };
    },
    async patient(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      const kommende = await termine(db, id, { kommend: true });
      return {
        patient, verlauf: await kontaktverlauf(db, t, id), gruende: await gespraechsgruende(db), termine: kommende,
        verordnungen: await verordnungen(db, { patientId: id }), serien: await serien(db, t, { patientId: id }), rechnungen: await rechnungen(db, id),
        preislisten: (await preislistenListen(db)).filter((l) => l.status === 'freigegeben'),
        dokumente: await dokumente(db, t, id), whatsapp: whatsappAngebote(patient, kommende), whatsappCloud: Boolean(q.whatsapp),
      };
    },
    whatsappEingang: (n) => whatsappEingang(db, t, n),
    async akte(id, wer) {
      const patient = await patientLesen(db, t, id);
      return patient ? { patient, faelle: await akte(db, t, id, wer) } : undefined;
    },
    async aktePdf(id, wer) {
      if (!istId(id) || !(await patientLesen(db, t, id))) return undefined;
      return akteExport(db, t, id, wer);
    },
    async neuAktion(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      const alle = await verordnungen(db, { patientId: id });
      return {
        patient, faelle: await offeneFaelle(db, t, id), verordnungen: alle.filter((v) => v.status === 'aktiv'), alleVerordnungen: alle,
        termine: await termine(db, id), wellness: await wellnessLeistungen(db), terminarten: await terminarten(db),
      };
    },
    async rezepte(filter) {
      return { verordnungen: await verordnungen(db, { nurAktiv: filter === 'aktiv' }), serien: await serien(db, t, { nurOffen: filter === 'aktiv' }), filter };
    },
    wellness: () => wellnessLeistungen(db, { alle: true }),
    async rechnung(patientId, rechnungId) {
      const patient = await patientLesen(db, t, patientId);
      const rechnung = patient ? await rechnungLesen(db, patientId, rechnungId) : undefined;
      if (!patient || !rechnung) return undefined;
      const positionen = rechnung.preisliste
        ? (await db.query<{ id: string; nummer: string; bezeichnung: string; preis: string | null }>('SELECT id::text, nummer, bezeichnung, coalesce(eigener_preis, gkv_preis)::text AS preis FROM preisliste_position WHERE preisliste_id = $1 AND uebernehmen ORDER BY reihenfolge', [rechnung.preisliste.id])).rows
          .map((x) => ({ id: x.id, nummer: x.nummer, bezeichnung: x.bezeichnung, preis: x.preis === null ? null : Number(x.preis) }))
        : [];
      return { patient, rechnung, textbausteine: await textbausteine(db), preislistePositionen: positionen, wellness: await wellnessLeistungen(db) };
    },
    rechnungPdf: (patientId, rechnungId) => rechnungPdf(db, patientId, rechnungId),
    async konfiguration() { return { textbausteine: await textbausteine(db, { alle: true }), einstellungen: await einstellungen(db) }; },
    kalender: (von, bis) => termineZeitraum(db, von, bis),
    steuer: (jahr, maskiert) => steuerfreieUmsaetze(db, { jahr, maskiert }),
    gruende: () => gespraechsgruende(db),
    terminarten: () => terminarten(db),
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
        // Aus einer Terminanfrage angelegt (A15): zuordnen und zurück zur Anfrage
        const anfrageId = g('anfrage_id');
        if (anfrageId && istId(anfrageId)) {
          await db.query('UPDATE terminanfrage SET patient_id = $2, geaendert_am = now() WHERE id = $1 AND patient_id IS NULL', [anfrageId, neu]);
          return nach(`/anfragen/${anfrageId}`, 'Patient angelegt und der Anfrage zugeordnet.');
        }
        return nach(`/patienten/${neu}`, 'Patient angelegt.');
      }
      // Wellness-Katalog (W74) – ohne Patient
      if (aktion === 'wellness_speichern') {
        await wellnessSpeichern(db, { id: g('wellness_id'), code: g('code') ?? '', bezeichnung: g('bezeichnung') ?? '', dauerMin: ganz(f.get('dauer_min')) || undefined, preis: g('preis') ?? '' }, wer);
        return nach('/rezepte/wellness', 'Wellness-Leistung gespeichert.');
      }
      // Konfiguration (W80) – ohne Patient
      if (aktion === 'textbaustein_speichern') {
        await textbausteinSpeichern(db, { id: g('textbaustein_id'), kurzname: g('kurzname') ?? '', text: g('text') ?? '', wirkung: g('wirkung'), automatisch: g('automatisch') }, wer);
        return nach('/konfiguration', 'Textbaustein gespeichert.');
      }
      if (aktion === 'textbaustein_aktiv') {
        await textbausteinAktiv(db, g('textbaustein_id') ?? '', f.get('aktiv') === '1', wer);
        return nach('/konfiguration', f.get('aktiv') === '1' ? 'Textbaustein wieder im Angebot.' : 'Textbaustein ausgeblendet – auf bestehenden Rechnungen bleibt er.');
      }
      if (aktion === 'einstellung') {
        const schluessel = g('schluessel') ?? '';
        await einstellungSetzen(db, schluessel, schluessel === 'kleinunternehmer' ? (f.has('wert_ja') ? 'ja' : 'nein') : (g('wert') ?? '').trim(), wer);
        return nach('/konfiguration', 'Einstellung gespeichert.');
      }
      // Terminarten der Online-Anfrage (W94) – ohne Patient
      if (aktion === 'terminart_speichern') {
        const tid = await terminartSpeichern(db, { id: g('terminart_id'), sektion: g('sektion'), kurz: g('kurz') ?? '', lang: g('lang'), dauerMin: ganz(f.get('dauer_min')), leistungNummer: g('leistung_nummer') }, wer);
        return nach(`/konfiguration/terminarten#ta-${tid}`, g('terminart_id') ? 'Terminart gespeichert.' : 'Terminart angelegt – noch inaktiv.');
      }
      if (aktion === 'terminart_aktiv') {
        const tid = g('terminart_id') ?? '';
        await terminartAktiv(db, tid, f.get('aktiv') === '1', wer);
        return nach(`/konfiguration/terminarten#ta-${tid}`, f.get('aktiv') === '1' ? 'Aktiv – steht jetzt im Dropdown der Online-Anfrage.' : 'Inaktiv – nicht mehr im Dropdown.');
      }
      if (aktion === 'wellness_aktiv') {
        await wellnessAktiv(db, g('wellness_id') ?? '', f.get('aktiv') === '1');
        return nach('/rezepte/wellness', f.get('aktiv') === '1' ? 'Leistung wieder anbietbar.' : 'Leistung ausgeblendet – bestehende Serien bleiben.');
      }
      if (!istId(id)) throw new KarteiFehler('Unbekannter Patient');
      const fallSeite = (fallId: string) => `/patienten/${id}/faelle/${fallId}`;
      switch (aktion) {
        case 'fall_anlegen': {
          const grundlage = g('grundlage') ?? 'verordnung';
          const fallId = await fallAnlegen(db, t, id, { grundlage, bezeichnung: g('bezeichnung'), anlass: g('anlass'), diagnoseArzt: g('diagnose_arzt'), wellnessLeistungId: g('wellness_id'), phase: 'anfrage' }, wer);
          return nach(fallSeite(fallId), 'Fall angelegt – er steht auf der Pinnwand unter „Anfrage“.');
        }
        case 'phase': {
          const nachPhase = g('nach') as Phase;
          if (!PHASEN.includes(nachPhase)) throw new KarteiFehler('Unbekannte Phase');
          await phaseSetzen(db, id, g('fall_id') ?? '', nachPhase, wer, g('grund'));
          return nach(g('zurueck')?.startsWith('/pinnwand') ? g('zurueck')! : fallSeite(g('fall_id') ?? ''), `Verschoben nach „${PHASEN_NAMEN[nachPhase]}“.`);
        }
        case 'anamnese_erfassen':
          await anamneseErfassen(db, t, id, g('fall_id') ?? '', { erhobenAm: g('erhoben_am'), art: g('art'), beschwerden: g('beschwerden'), vorgeschichte: g('vorgeschichte'), medikamente: g('medikamente'), allergien: g('allergien'), risiken: g('risiken'), sonstiges: g('sonstiges') }, wer);
          return nach(`${fallSeite(g('fall_id') ?? '')}#anamnese`, 'Anamnese gespeichert.');
        case 'befund_erfassen':
          await befundErfassen(db, t, id, g('fall_id') ?? '', { erhobenAm: g('erhoben_am'), art: g('art') ?? '', text: g('text'), messwerte: g('messwerte') }, wer);
          return nach(`${fallSeite(g('fall_id') ?? '')}#befunde`, 'Befund gespeichert.');
        case 'erklaerung_erfassen':
          await erklaerungErfassen(db, t, id, { fallId: g('fall_id'), art: g('art') ?? '', am: g('am'), form: g('form'), inhalt: g('inhalt'), fassung: g('fassung'), gueltigBis: g('gueltig_bis') }, wer);
          return nach(g('fall_id') ? `${fallSeite(g('fall_id')!)}#erklaerungen` : seite, 'Erklärung gespeichert.');
        case 'erklaerung_widerrufen':
          await erklaerungWiderrufen(db, id, g('erklaerung_id') ?? '', g('grund') ?? '', wer);
          return nach(g('fall_id') ? `${fallSeite(g('fall_id')!)}#erklaerungen` : seite, 'Erklärung widerrufen.');
        case 'stammdaten':
          await stammdatenSpeichern(db, t, id, {
            anrede: g('anrede'), titel: g('titel'), vorname: g('vorname') ?? '', nachname: g('nachname') ?? '', geburtsname: g('geburtsname'), geburtsdatum: g('geburtsdatum'),
            patientSeit: g('patient_seit'), ansprache: g('ansprache'), besonderheiten: g('besonderheiten'), sprache: g('sprache'), kommunikationshilfe: g('kommunikationshilfe'),
            berufBelastung: g('beruf_belastung'), notiz: g('notiz'), preislisteId: g('preisliste_id'), rechnungsversand: g('rechnungsversand'),
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
        case 'termin_anlegen': {
          const terminId = await terminAnlegen(db, id, { datum: g('datum') ?? '', zeit: g('zeit') ?? '', dauerMin: ganz(f.get('dauer_min'), 30), art: g('art'), verordnungId: g('verordnung_id'), fallId: g('fall_id'), terminartId: g('terminart_id') }, wer);
          return nach(`${seite}#termine`, `Termin angelegt.${await spiegeln(terminId, wer)}`);
        }
        case 'termin_status':
          await terminStatus(db, id, g('termin_id') ?? '', g('status') ?? '', wer);
          return nach(`${seite}#termine`, `Termin geändert.${await spiegeln(g('termin_id') ?? '', wer)}`);
        case 'verordnung_anlegen': {
          const art = g('art') ?? 'erst';
          await verordnungAnlegen(db, t, id, {
            ausgestelltAm: g('ausgestellt_am') ?? '', arzt: g('arzt'), massnahme: g('massnahme') ?? '', leistungNummer: g('leistung_nummer'), anzahl: ganz(f.get('anzahl')),
            frequenz: g('frequenz'), diagnose: g('diagnose'), gueltigBis: g('gueltig_bis'), fallId: g('fall_id') || undefined,
            art, langzeit: f.has('langzeit'), vorgaengerId: art === 'erst' ? undefined : g('vorgaenger_id') || undefined, notiz: g('notiz'),
          }, wer);
          return nach(`${seite}#rezepte`, art === 'korrektur' ? 'Korrektur angelegt – das alte Rezept gilt als ersetzt, seine Haken zählen weiter.' : 'Rezept angelegt.');
        }
        case 'zweitschrift':
          await zweitschriftVermerken(db, id, g('verordnung_id') ?? '', g('datum'), wer);
          return nach(`${seite}#rezepte`, 'Zweitschrift vermerkt – kein neues Kontingent.');
        case 'verordnung_abbrechen':
          await verordnungAbbrechen(db, id, g('verordnung_id') ?? '', g('grund') ?? '', wer);
          return nach(`${seite}#rezepte`, 'Rezept abgebrochen. Die Abschlussrechnung kommt mit der Abrechnung (Prompt 14).');
        case 'serie_anlegen': {
          const grundlage = g('grundlage') === 'praevention' ? 'praevention' : 'direktzugang';
          await fallAnlegen(db, t, id, { grundlage, bezeichnung: g('bezeichnung'), anlass: g('anlass'), begonnenAm: g('begonnen_am'), wellnessLeistungId: g('wellness_id') }, wer);
          return nach(`${seite}#rezepte`, grundlage === 'praevention' ? 'Wellness-Serie angelegt.' : 'Behandlungsserie ohne Rezept angelegt.');
        }
        case 'serie_abschliessen':
          await serieAbschliessen(db, id, g('fall_id') ?? '', wer);
          return nach(`${seite}#rezepte`, 'Serie abgeschlossen.');
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
        // Rechnungen (W79, W81)
        case 'rechnung_neu': {
          const rid = await rechnungAnlegen(db, id, { steuerklasse: g('steuerklasse') === 'wellness_19' ? 'wellness_19' : 'heilbehandlung_steuerfrei', fallId: g('fall_id') }, wer);
          return nach(`/patienten/${id}/rechnungen/${rid}`, 'Rechnungsentwurf angelegt.');
        }
        case 'rechnung_position_hinzufuegen':
          await positionHinzufuegen(db, id, g('rechnung_id') ?? '', { nummer: g('nummer'), wellnessId: g('wellness_id'), bezeichnung: g('bezeichnung'), anzahl: ganz(f.get('anzahl'), 1), einzelpreis: g('einzelpreis'), datum: g('datum') }, wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Position hinzugefügt.');
        case 'rechnung_position_aendern':
          await positionAendern(db, id, g('rechnung_id') ?? '', g('position_id') ?? '', { datum: g('datum'), bezeichnung: g('bezeichnung'), anzahl: ganz(f.get('anzahl'), 1), einzelpreis: g('einzelpreis') }, wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Position geändert.');
        case 'rechnung_position_loeschen':
          await positionLoeschen(db, id, g('rechnung_id') ?? '', g('position_id') ?? '', wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Position entfernt.');
        case 'rechnung_baustein_hinzufuegen':
          await bausteinHinzufuegen(db, id, g('rechnung_id') ?? '', g('textbaustein_id') ?? '', wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Text hinzugefügt.');
        case 'rechnung_baustein_aendern':
          await bausteinAendern(db, id, g('rechnung_id') ?? '', g('baustein_id') ?? '', g('text') ?? '', wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Text übernommen.');
        case 'rechnung_baustein_entfernen':
          await bausteinEntfernen(db, id, g('rechnung_id') ?? '', g('baustein_id') ?? '', wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, 'Text entfernt.');
        case 'rechnung_status': {
          const a = g('status_aktion') as Parameters<typeof rechnungStatus>[3];
          if (!['fertig', 'zurueck', 'in_lexware', 'versendet', 'bezahlt', 'storno'].includes(a)) throw new KarteiFehler('Unbekannte Aktion');
          const meldung = await rechnungStatus(db, id, g('rechnung_id') ?? '', a, { versandArt: g('versand_art'), grund: g('grund'), nummer: g('nummer'), datum: g('datum') }, wer);
          return nach(`/patienten/${id}/rechnungen/${g('rechnung_id')}`, meldung);
        }
        // Nachrichten (W90, W91)
        case 'mail_entwurf': {
          const e = await mailEntwurf(db, t, q.graph, id, {
            vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined, rechnungId: g('rechnung_id') || undefined, freitext: g('freitext'),
            anhangRechnungen: f.getAll('anhang_rechnung'), anhangDokumente: f.getAll('anhang_dokument'),
          }, wer);
          return nach(`${seite}#verlauf`, `Entwurf liegt im Postfach – in Outlook unter „Entwürfe“ prüfen und senden.${e.anhaenge ? ` ${e.anhaenge} Anhang dabei.` : ''}${e.hinweise.length ? ` ${e.hinweise.join(' ')}` : ''}`);
        }
        case 'whatsapp_senden': {
          if (!q.whatsapp) throw new KarteiFehler('WhatsApp-Versand ist nicht eingerichtet – der WhatsApp-Knopf öffnet die Nachricht auf dem Handy');
          await whatsappSenden(db, t, q.whatsapp, id, { vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined, rechnungId: g('rechnung_id') || undefined, freitext: g('freitext') }, wer);
          return nach(`${seite}#verlauf`, 'WhatsApp-Nachricht gesendet und im Verlauf vermerkt.');
        }
        case 'whatsapp_vermerken':
          await whatsappVermerken(db, t, id, { vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined }, wer);
          return nach(`${seite}#verlauf`, 'WhatsApp vermerkt.');
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
