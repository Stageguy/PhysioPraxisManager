/**
 * Kartei-Dienst für den Praxisdienst: Seitendaten und Aktionen (W63–W68, W73–W74). Schreibt nur in
 * die eigene Datenbank – in Test und Produktion gleichermaßen erlaubt (die Testdatenbank enthält nur
 * erfundene Patienten, N28). Die Aktionen aus Formularen stehen je Fachgebiet in `aktionen/` (A32).
 */
import type { Db } from '../db/index.ts';
import { istId } from '../db/werte.ts';
import { terminSpiegeln } from './kalender.ts';
import {
  akte, bestaetigungBild, dublettenPaare, gespraechsgruende, KarteiFehler, kontaktverlauf, offeneFaelle, patientenListe, patientLesen, rechnungen, serien, terminLesen, termine, termineZeitraum, verknuepfteElemente,
  type DubletteGrund, type Verknuepft, verordnungen,
  wellnessLeistungen, type Fall, type Gespraechsgrund, type Patient, type PatientKurz, type RechnungKurz, type Serie, type TerminDetail, type TerminKalender, type TerminKurz,
  type VerlaufEintrag, type VerordnungKurz, type WellnessLeistung,
} from './patienten.ts';
import { fallDetails, pinnwand, type FallDetails, type Spalte } from './pinnwand.ts';
import { einstellungen, textbausteine, type Textbaustein } from './konfiguration.ts';
import { rechnungLesen, rechnungPdf, type Rechnung } from './rechnungen.ts';
import { listen as preislistenListen, type Preisliste } from '../preise/preislisten.ts';
import { steuerfreieUmsaetze, type SteuerListe } from './steuer.ts';
import { dokumente, whatsappAngebote, whatsappEingang, type DokumentKurz, type WhatsAppAngebot, rechnungsversandPruefen } from './nachrichten.ts';
import { akteExport } from './akte-export.ts';
import { terminarten, type Terminart } from './terminarten.ts';
import { kundenAbgleich, kundenAbweichungen, type Abweichung, type LexwareKundeStand } from './lexware-kunden.ts';
import type { LexwareKunde } from '../lexware/kunden.ts';
import { bankverbindung, girocodeDataUri } from '../rechnungen/girocode.ts';
import { freieTageDaten, freieTageZeitraum, type FreieTageDaten } from './freie-tage.ts';
import { regelzeiten, type Regelzeit } from './regelzeiten.ts';
import { rezeptTermineDaten, type RezeptTermineDaten } from './rezept-termine.ts';
import { outlookBloecke, type KalenderBlock } from './outlook-termine.ts';
import { freieWoche, monatsPlan, type MonatsPlan, type TagesPlan, type WochenSuche } from './terminplan.ts';
import { schnelltermin, schnellPatientFinden, type Schnelltermin } from './schnelltermin.ts';
import { nummernKonflikt, type NummernKonflikt } from './lexware-rechnungen.ts';
import { slotRegeln } from '../anfragen/dienst.ts';
import type { Oeffnungszeit } from '../anfragen/slots.ts';
import type { EingehendeNachricht } from '../whatsapp/schnittstelle.ts';
import { praxisName } from '../praxis.ts';
import { aktionAusfuehren, type DienstQuellen } from './aktionen/index.ts';

/** Was die Kalenderseite neben den Kartei-Terminen zeigt (W112): Outlook-Blöcke im Öffnungsfenster und die Öffnungszeiten */
export interface KalenderUmfeld {
  bloecke: KalenderBlock[];
  oeffnungszeiten: Oeffnungszeit[];
  postfach: boolean;
  fehler?: string;
  /** Ziel der Rückfahrt nach einem Hausbesuch (W113c): Praxisadresse aus der Konfiguration, sonst der Praxisname */
  praxisAdresse: string;
}

/** GiroCode für offene Rechnungen aus Lexware (W102) – nur mit hinterlegter Bankverbindung und Rechnungsnummer */
async function girocodeFuer(db: Db, r: Rechnung): Promise<string | null> {
  if (!['in_lexware', 'gesendet'].includes(r.status) || !r.nummer || !(r.betrag > 0)) return null;
  const bank = await bankverbindung(db);
  return bank ? girocodeDataUri({ bank, betrag: r.betrag, verwendungszweck: r.nummer }) : null;
}

export { KarteiFehler };
export type { DienstQuellen };

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
  /** Lexware angebunden und Patient mit einem Lexware-Kunden verknüpft – Knopf „Rechnungen aus Lexware holen“ (W103) */
  lexwareRechnungen: boolean;
  /** Abweichungen der gemeinsamen Felder zwischen PPM und Lexware-Kunde (W99b) – null ohne Verknüpfung */
  lexwareAbgleich: { nummer: string; abweichungen: Abweichung[] } | null;
  /** Lexware schreibbar und Patient noch kein Kunde – Knopf „In Lexware als Kunde anlegen“ */
  lexwareKundeAnlegbar: boolean;
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

/** Kunden aus Lexware neben der Kartei (W99) */
export interface LexwareKundenDaten {
  kunden: LexwareKundeStand[];
  /** Wann die Kunden gelesen wurden (ISO); leer bei Fehler */
  stand: string;
  /** Erfundene Kunden (Testumgebung) */
  attrappe: boolean;
  suche: string;
  /** Lexware nicht erreichbar – dann ist `kunden` leer */
  fehler?: string;
}

/** Klärungsseite (W119): dieser Patient, seine Verknüpfungen und je Kandidat dasselbe plus die Gründe */
export interface DublettenDaten {
  patient: Patient;
  verknuepft: Verknuepft;
  kandidaten: { patient: Patient; verknuepft: Verknuepft; gruende: DubletteGrund[] }[];
}

export interface KarteiDienst {
  liste(o: { suche?: string; archiv?: boolean; dubletten?: boolean }): Promise<PatientKurz[]>;
  /** Mögliche Dubletten eines Patienten (W119) – undefined, wenn es ihn nicht gibt */
  dubletten(id: string): Promise<DublettenDaten | undefined>;
  /** Wie viele nicht archivierte Patienten eine ungeklärte mögliche Dublette haben */
  dublettenAnzahl(): Promise<number>;
  pinnwand(o: { archiv?: boolean }): Promise<Spalte[]>;
  fall(patientId: string, fallId: string, wer: string): Promise<{ patient: Patient; details: FallDetails; verordnungen: VerordnungKurz[]; termine: TerminKurz[]; rechnungen: RechnungKurz[] } | undefined>;
  patient(id: string): Promise<PatientSeiteDaten | undefined>;
  akte(id: string, wer: string): Promise<AkteDaten | undefined>;
  /** Die ganze Akte als PDF – Einsicht nach § 630g (A19d), jeder Export im Protokoll */
  aktePdf(id: string, wer: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  /** Unterschriftsbild einer Behandlung (W107a), jedes Ansehen im Protokoll */
  unterschrift(patientId: string, behandlungId: string, wer: string): Promise<{ daten: Uint8Array; mime: string } | undefined>;
  neuAktion(id: string): Promise<NeuAktionDaten | undefined>;
  /** Termin bearbeiten (W115): dieselben Daten wie „Neuer Termin“ plus der Termin – nur solange er bestätigt oder vorgeschlagen ist */
  terminBearbeiten(patientId: string, terminId: string): Promise<(NeuAktionDaten & { termin: TerminDetail }) | undefined>;
  /** Terminvorschläge zu einem Rezept (W110): Anzahl offen, Frequenz, Dauer aus der Regelbehandlungszeit */
  rezeptTermine(patientId: string, verordnungId: string, o?: { ab?: string; proWoche?: number; dauerMin?: number; tageszeit?: string }): Promise<RezeptTermineDaten | undefined>;
  rezepte(filter: 'aktiv' | 'alle'): Promise<RezepteDaten>;
  rechnung(patientId: string, rechnungId: string): Promise<{ patient: Patient; rechnung: Rechnung; textbausteine: Textbaustein[]; preislistePositionen: { id: string; nummer: string; bezeichnung: string; preis: number | null }[]; wellness: WellnessLeistung[]; preislisteAktuell: { id: string; name: string } | null; lexware: boolean; postfach: boolean; girocode: string | null; nummernKonflikt: NummernKonflikt | null } | undefined>;
  rechnungPdf(patientId: string, rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  konfiguration(o?: { jahr?: number }): Promise<{ textbausteine: Textbaustein[]; einstellungen: Record<string, string>; freieTage: FreieTageDaten; regelzeiten: Regelzeit[] }>;
  /** Freie Tage eines Zeitraums für die Kalenderseite (Datum → Name) */
  freieTage(von: string, bis: string): Promise<Record<string, string>>;
  kalender(vonIso: string, bisIso: string): Promise<TerminKalender[]>;
  /** Outlook-Blöcke und Öffnungszeiten für die Kalenderseite (W112) – ohne Postfach nur die Öffnungszeiten */
  kalenderUmfeld(vonIso: string, bisIso: string): Promise<KalenderUmfeld>;
  /** Monatsansicht zum Buchen (W116): Tage mit Stand, Lücken, Zähler je Dauer */
  monatsplan(jahr: number, monat: number): Promise<MonatsPlan>;
  /** Freie Anfangszeiten einer Woche für eine Dauer – das Suchfenster */
  freieWoche(o: { dauer: number; wochenstart: string }): Promise<WochenSuche>;
  /** Schnelltermin (W117): die nächsten drei freien Zeiten einer Dauer samt Vorlage und Links; mit Patient (W117b: Kennung, Nummer oder eindeutiger Name) Einladung und Anrede */
  schnelltermin(dauer: number, wer: string, patientWahl?: string): Promise<Schnelltermin>;
  /** Aktive Patienten mit Name und Nummer – für die Wahl im Schnelltermin */
  patientenNamen(): Promise<{ id: string; name: string; patientennummer: string }[]>;
  /** Freigegebene, aktive Preislisten – für „Neuer Patient“ (W115b) */
  preislisten(): Promise<Preisliste[]>;
  /** Ein Tag aus dem Monatsplan – für die Tagesansicht mit Lücken */
  tagesplan(datum: string): Promise<(TagesPlan & { dauerMin: number }) | undefined>;
  steuer(jahr: number, maskiert: boolean): Promise<SteuerListe>;
  wellness(): Promise<WellnessLeistung[]>;
  gruende(): Promise<Gespraechsgrund[]>;
  /** Terminarten der Online-Anfrage (W94) */
  terminarten(): Promise<Terminart[]>;
  /** Adresse der Buchungsseite (W96), falls eingerichtet */
  buchung(): { url: string; oeffentlich: boolean } | undefined;
  /** Eingehende WhatsApp-Nachricht vom Webhook (W90) */
  whatsappEingang(n: EingehendeNachricht): Promise<'zugeordnet' | 'medien' | 'unbekannt'>;
  /** Lexware angebunden (echt oder Attrappe) – dann gibt es „Aus Lexware“ in der Patientenliste (W99) */
  lexwareAngebunden(): boolean;
  /** Kunden aus Lexware, abgeglichen mit der Kartei; undefined ohne Anbindung */
  lexwareKunden(o: { suche?: string; neu?: boolean }): Promise<LexwareKundenDaten | undefined>;
  /** Ein Lexware-Kunde für die Vorbelegung von „Neuer Patient“ */
  lexwareKunde(nummer: string): Promise<LexwareKunde | undefined>;
  aktion(f: URLSearchParams, wer: string): Promise<{ ziel: string; meldung: string }>;
}


export function karteiDienst(q: DienstQuellen): KarteiDienst {
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
  /** Lexware-Kunde zum Patienten (aus dem Zwischenspeicher) – undefined ohne Anbindung, Verknüpfung oder bei Störung */
  const lexwareKundeZu = async (nummer: string | null): Promise<LexwareKunde | undefined> => {
    if (!q.lexware || !nummer) return undefined;
    try { return (await q.lexware.alle()).kunden.find((k) => k.nummer === nummer); } catch (err) { console.warn(`Lexware-Kunde ${nummer}: ${(err as Error).message.slice(0, 160)}`); return undefined; }
  };
  const lexwareAbgleichFuer = async (patient: Patient): Promise<PatientSeiteDaten['lexwareAbgleich']> => {
    const kunde = await lexwareKundeZu(patient.lexwareKundennummer);
    return kunde ? { nummer: kunde.nummer, abweichungen: kundenAbweichungen(patient, kunde) } : null;
  };
  return {
    liste: (o) => patientenListe(db, t, o),
    async dubletten(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      const kandidaten: DublettenDaten['kandidaten'] = [];
      for (const paar of await dublettenPaare(db, { patientId: id })) {
        const andererId = paar.a === id ? paar.b : paar.a;
        const anderer = await patientLesen(db, t, andererId);
        if (anderer) kandidaten.push({ patient: anderer, verknuepft: await verknuepfteElemente(db, andererId), gruende: paar.gruende });
      }
      return { patient, verknuepft: await verknuepfteElemente(db, id), kandidaten };
    },
    dublettenAnzahl: async () => new Set((await dublettenPaare(db)).flatMap((p) => [p.a, p.b])).size,
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
        preislisten: (await preislistenListen(db)).filter((l) => l.status === 'freigegeben' && l.aktiv),
        dokumente: await dokumente(db, t, id), whatsapp: whatsappAngebote(patient, kommende), whatsappCloud: Boolean(q.whatsapp),
        lexwareRechnungen: Boolean(q.lexwareRechnungen && patient.lexwareKundennummer),
        lexwareAbgleich: await lexwareAbgleichFuer(patient),
        lexwareKundeAnlegbar: Boolean(q.lexwareRechnungen) && !patient.lexwareKundennummer,
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
    unterschrift: (patientId, behandlungId, wer) => bestaetigungBild(db, t, patientId, behandlungId, wer),
    async neuAktion(id) {
      const patient = await patientLesen(db, t, id);
      if (!patient) return undefined;
      const alle = await verordnungen(db, { patientId: id });
      return {
        patient, faelle: await offeneFaelle(db, t, id), verordnungen: alle.filter((v) => v.status === 'aktiv'), alleVerordnungen: alle,
        termine: await termine(db, id), wellness: await wellnessLeistungen(db), terminarten: await terminarten(db),
      };
    },
    async terminBearbeiten(patientId, terminId) {
      if (!istId(patientId) || !istId(terminId)) return undefined;
      const daten = await this.neuAktion(patientId);
      const termin = daten && await terminLesen(db, patientId, terminId);
      return daten && termin && ['vorgeschlagen', 'bestaetigt'].includes(termin.status) ? { ...daten, termin } : undefined;
    },
    async rezeptTermine(patientId, verordnungId, o = {}) {
      if (!istId(patientId) || !istId(verordnungId)) return undefined;
      return rezeptTermineDaten(db, q.graph, t, patientId, verordnungId, o);
    },
    async rezepte(filter) {
      return { verordnungen: await verordnungen(db, { nurAktiv: filter === 'aktiv' }), serien: await serien(db, t, { nurOffen: filter === 'aktiv' }), filter };
    },
    wellness: () => wellnessLeistungen(db, { alle: true }),
    async rechnung(patientId, rechnungId) {
      const patient = await patientLesen(db, t, patientId);
      let rechnung = patient ? await rechnungLesen(db, patientId, rechnungId) : undefined;
      // Entwurf in Outlook (W122): beim Öffnen nachsehen, ob Lilli ihn inzwischen gesendet hat
      if (rechnung?.versandEntwurf && q.graph) {
        await rechnungsversandPruefen(db, t, q.graph, 'system', { rechnungId });
        rechnung = await rechnungLesen(db, patientId, rechnungId);
      }
      if (!patient || !rechnung) return undefined;
      const positionen = rechnung.preisliste
        ? (await db.query<{ id: string; nummer: string; bezeichnung: string; preis: string | null }>('SELECT id::text, nummer, bezeichnung, coalesce(eigener_preis, gkv_preis)::text AS preis FROM preisliste_position WHERE preisliste_id = $1 AND uebernehmen ORDER BY reihenfolge', [rechnung.preisliste.id])).rows
          .map((x) => ({ id: x.id, nummer: x.nummer, bezeichnung: x.bezeichnung, preis: x.preis === null ? null : Number(x.preis) }))
        : [];
      return {
        patient, rechnung, textbausteine: await textbausteine(db), preislistePositionen: positionen, wellness: await wellnessLeistungen(db),
        preislisteAktuell: patient.preislisteGilt ? { id: patient.preislisteGilt.id, name: patient.preislisteGilt.name } : null,
        lexware: Boolean(q.lexwareRechnungen), postfach: Boolean(q.graph),
        girocode: await girocodeFuer(db, rechnung),
        nummernKonflikt: await nummernKonflikt(db, rechnungId),
      };
    },
    rechnungPdf: (patientId, rechnungId) => rechnungPdf(db, t, patientId, rechnungId),
    async konfiguration(o = {}) { return { textbausteine: await textbausteine(db, { alle: true }), einstellungen: await einstellungen(db), freieTage: await freieTageDaten(db, o.jahr), regelzeiten: await regelzeiten(db) }; },
    freieTage: (von, bis) => freieTageZeitraum(db, von, bis),
    kalender: (von, bis) => termineZeitraum(db, von, bis),
    monatsplan: (jahr, monat) => monatsPlan(db, q.graph, jahr, monat),
    freieWoche: (o) => freieWoche(db, q.graph, o),
    async schnelltermin(dauer, wer, patientWahl) {
      const patientId = await schnellPatientFinden(db, patientWahl);
      const patient = patientId ? await patientLesen(db, t, patientId) : undefined;
      return schnelltermin(db, q.graph, { dauer, buchungUrl: q.buchung?.url, patient, wer, einladen: q.buchungClient ? (e) => q.buchungClient!.einladungenSenden([e]) : undefined });
    },
    patientenNamen: async () => (await db.query<{ id: string; name: string; patientennummer: string }>(
      "SELECT id::text, vorname || ' ' || nachname AS name, patientennummer FROM patient WHERE status <> 'archiviert' ORDER BY lower(nachname), lower(vorname)",
    )).rows,
    preislisten: async () => (await preislistenListen(db)).filter((l) => l.status === 'freigegeben' && l.aktiv),
    async tagesplan(datum) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return undefined;
      const plan = await monatsPlan(db, q.graph, Number(datum.slice(0, 4)), Number(datum.slice(5, 7)));
      const tag = plan.tage.find((t) => t.datum === datum);
      return tag ? { ...tag, dauerMin: plan.dauerMin } : undefined;
    },
    async kalenderUmfeld(von, bis) {
      const { oeffnungszeiten } = await slotRegeln(db);
      const praxisAdresse = (await einstellungen(db)).praxis_adresse?.trim() || praxisName();
      if (!q.graph) return { bloecke: [], oeffnungszeiten, postfach: false, praxisAdresse };
      try {
        return { bloecke: await outlookBloecke(db, q.graph, von, bis, oeffnungszeiten), oeffnungszeiten, postfach: true, praxisAdresse };
      } catch (err) {
        console.warn(`Kalender: ${(err as Error).message.slice(0, 200)}`);
        return { bloecke: [], oeffnungszeiten, postfach: true, praxisAdresse, fehler: 'Der Kalender des Postfachs war nicht erreichbar – Outlook-Termine fehlen in dieser Ansicht.' };
      }
    },
    steuer: (jahr, maskiert) => steuerfreieUmsaetze(db, { jahr, maskiert }),
    gruende: () => gespraechsgruende(db),
    terminarten: () => terminarten(db),
    buchung: () => q.buchung,
    lexwareAngebunden: () => Boolean(q.lexware),
    async lexwareKunden({ suche = '', neu = false }) {
      if (!q.lexware) return undefined;
      const s = suche.trim().toLowerCase();
      try {
        const { kunden, stand } = await q.lexware.alle({ neu });
        const passend = s ? kunden.filter((k) => [k.vorname, k.nachname, k.firma, k.nummer, k.email, k.adresse?.ort].some((w) => w?.toLowerCase().includes(s))) : kunden;
        return { kunden: await kundenAbgleich(db, passend), stand, attrappe: q.lexware.attrappe, suche };
      } catch (err) {
        console.warn(`Lexware-Kunden: ${(err as Error).message.slice(0, 200)}`);
        return { kunden: [], stand: '', attrappe: q.lexware.attrappe, suche, fehler: `Lexware ist gerade nicht erreichbar – ${(err as Error).message.slice(0, 160)}` };
      }
    },
    async lexwareKunde(nummer) {
      if (!q.lexware || !/^\d{1,12}$/.test(nummer)) return undefined;
      try {
        return (await q.lexware.alle()).kunden.find((k) => k.nummer === nummer);
      } catch (err) {
        console.warn(`Lexware-Kunde ${nummer}: ${(err as Error).message.slice(0, 200)}`);
        return undefined;
      }
    },
    // Aktionen aus Formularen (A32): Tabelle je Fachgebiet in aktionen/, hier nur der Kontext
    aktion: (f, wer) => aktionAusfuehren({
      db, t, q, f, wer, id: f.get('id') ?? '', g: (name) => f.get(name) ?? undefined, seite: `/patienten/${f.get('id') ?? ''}`,
      nach: (ziel, meldung) => ({ ziel, meldung }), spiegeln: (terminId) => spiegeln(terminId, wer), lexwareKundeZu,
    }),
  };
}
