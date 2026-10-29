/**
 * Patientenseiten (W63–W68): Liste mit Kacheln, Patient (Kontaktwege, Adress-Kacheln, Kontaktverlauf
 * mit Anruf und Gesprächsgrund, Termine, Rezepte, Rechnungen, Stammdaten), Akte (§ 630f) und die
 * „+“-Aktionen Termin, Behandlung, Rezept. Für das Handy gebaut: Anrufen, WhatsApp und Mail sind
 * echte Links (tel:, wa.me, mailto:), /praxis.js vermerkt den Anruf im Verlauf.
 */
import type { AkteDaten, LexwareKundenDaten, NeuAktionDaten, PatientSeiteDaten } from '../kartei/dienst.ts';
import type { KundeStand, LexwareKundeStand } from '../kartei/lexware-kunden.ts';
import { kundenName, type LexwareKunde } from '../lexware/kunden.ts';
import { BESTAETIGUNG_TEXT, VERORDNUNG_ARTEN, type Adresse, type Kontakt, type Patient, type PatientKurz, type RechnungKurz, type TerminDetail } from '../kartei/patienten.ts';
import { ADRESSE_TYP_TEXT, ADRESSE_TYPEN } from '../kartei/hausbesuche.ts';
import { VORLAGEN } from '../nachrichten/vorlagen.ts';
import { SEKTION_REIHE, SEKTIONEN, type Terminart } from '../kartei/terminarten.ts';
import { rezeptKachel, serieKachel, serienPlus } from './rezepte.ts';
import { esc, seite } from './layout.ts';
import { datumText, datumZeitText, euroText, zeitText } from '../format.ts';
import { datumBerlin, heuteBerlin, zeitBerlin } from '../zeit.ts';
import { formular, karteiFormular as form, meldungen, PLUS_ZEICHEN, plusKachel, plusMenue, stift, type Rahmen } from './bausteine.ts';
import { symbol, type Symbol } from './symbole.ts';





export const name = (p: Pick<PatientKurz, 'vorname' | 'nachname' | 'titel'>) => `${p.titel ? `${p.titel} ` : ''}${p.vorname} ${p.nachname}`;
const KONTAKT_SYMBOL: Record<string, Symbol> = { mobil: 'telefon', telefon: 'telefon', whatsapp: 'whatsapp', email: 'email', sonstige: 'anfrage' };
const KONTAKT_NAME: Record<string, string> = { mobil: 'Mobil', telefon: 'Telefon', whatsapp: 'WhatsApp', email: 'E-Mail', sonstige: 'Sonstiges' };
const GRUNDLAGE: Record<string, string> = { verordnung: 'ärztliche Verordnung', direktzugang: 'Direktzugang (sektorale Heilpraktikererlaubnis)', praevention: 'Prävention / Wellness' };
const TERMIN_STATUS: Record<string, string> = { vorgeschlagen: 'vorgeschlagen', bestaetigt: 'bestätigt', erledigt: 'erledigt', verschoben: 'verschoben', abgesagt_patient: 'abgesagt (Patient)', abgesagt_praxis: 'abgesagt (Praxis)', nicht_erschienen: 'nicht erschienen' };
const VERLAUF_ART: Record<string, [Symbol, string]> = {
  anruf_ausgehend: ['telefon', 'Anruf'], anruf_eingehend: ['telefon', 'Anruf (eingehend)'], email: ['email', 'E-Mail'], whatsapp: ['whatsapp', 'WhatsApp'], sms: ['anfrage', 'SMS'],
  brief: ['brief', 'Brief'], persoenlich: ['patient', 'Persönlich'], notiz: ['protokoll', 'Notiz'],
};

/** Link, der am Handy anruft bzw. WhatsApp oder Mail öffnet – /praxis.js vermerkt ihn im Verlauf (W67) */
function kontaktLink(p: Pick<PatientKurz, 'id'>, k: Kontakt | null, art: 'telefon' | 'whatsapp' | 'email', o: { klein?: boolean } = {}): string {
  const text = { telefon: 'Anrufen', whatsapp: 'WhatsApp', email: 'E-Mail' }[art];
  if (!k) return `<span class="pat-kontakt fehlt" data-hilfe="kachel.${art}" title="kein Eintrag">${symbol(KONTAKT_SYMBOL[art]!, { groesse: 18 })}<span>${o.klein ? '' : `${text}: –`}</span></span>`;
  const href = art === 'email' ? `mailto:${esc(k.normiert)}` : art === 'whatsapp' ? `https://wa.me/${esc(k.normiert.replace(/^\+/, ''))}` : `tel:${esc(k.normiert)}`;
  return `<a class="pat-kontakt" href="${href}"${art === 'whatsapp' ? ' target="_blank" rel="noopener"' : ''} data-hilfe="kachel.${art}" data-anruf="${p.id}" data-kontakt="${k.id}" title="${esc(KONTAKT_NAME[k.art] ?? '')}${k.bezeichnung ? ` (${esc(k.bezeichnung)})` : ''}">
    ${symbol(KONTAKT_SYMBOL[art]!, { groesse: 18 })}<span>${o.klein ? text : esc(k.wert)}</span></a>`;
}

const standChip = (p: PatientKurz) =>
  p.rechnungsstand === 'rot' ? `<span class="chip preset0" data-hilfe="kachel.status" tabindex="0">Rechnung im Verzug</span>`
    : p.rechnungsstand === 'gelb' ? `<span class="chip preset3" data-hilfe="kachel.status" tabindex="0">Rechnung überfällig</span>` : '';

function patientMenue(p: Pick<PatientKurz, 'id'>): string {
  return `<details class="plus" data-hilfe="kachel.plus"><summary aria-label="Neue Aktivität">${PLUS_ZEICHEN}</summary><div class="plus-menue">
    <a href="/kalender?ansicht=monat&patient=${p.id}" data-hilfe="plus.termin">${symbol('kalender', { groesse: 18 })} Neuer Termin</a>
    <a href="/patienten/${p.id}/neu/behandlung" data-hilfe="plus.behandlung">${symbol('protokoll', { groesse: 18 })} Neue Behandlung</a>
    <a href="/patienten/${p.id}/neu/rezept" data-hilfe="plus.rezept">${symbol('rezept', { groesse: 18 })} Neues Rezept</a>
    <a href="/patienten/${p.id}/neu/direktzugang" data-hilfe="plus.direktzugang">${symbol('freigabe', { groesse: 18 })} Behandlung ohne Rezept</a>
    <a href="/patienten/${p.id}/neu/wellness" data-hilfe="plus.wellness">${symbol('wellness', { groesse: 18 })} Wellness</a>
    <a href="/patienten/${p.id}#rechnungen" data-hilfe="plus.rechnung">${symbol('rechnung', { groesse: 18 })} Neue Rechnung</a>
  </div></details>`;
}

/** Die Patientenkachel (W64) */
export function kachel(p: PatientKurz, o: { kopf?: boolean } = {}): string {
  const termin = p.naechsterTermin
    ? `<a href="/patienten/${p.id}#termine" data-hilfe="kachel.termin">${datumZeitText(p.naechsterTermin.beginn, { jahr: true })} <span class="marke${p.naechsterTermin.rezept ? ' jetzt' : ''}">${p.naechsterTermin.rezept ? 'Rezept' : 'Individual'}</span></a>`
    : '<span class="hint">keiner geplant</span>';
  const behandlung = p.letzteBehandlung
    ? `<a href="/patienten/${p.id}/akte#b-${p.letzteBehandlung.id}" data-hilfe="kachel.behandlung">${datumText(p.letzteBehandlung.datum)} · Verlauf</a>`
    : '<span class="hint">noch keine</span>';
  return `<article class="pat ${p.rechnungsstand}${o.kopf ? ' kopf' : ''}" data-hilfe="patienten.kachel" id="p-${p.id}">
    <header class="pat-kopf">
      ${o.kopf ? `<h1>${esc(name(p))}</h1>` : `<a class="pat-name" href="/patienten/${p.id}"><b>${esc(name(p))}</b></a>`}
      <span class="pat-nr">${esc(p.patientennummer)}</span>
      ${patientMenue(p)}
    </header>
    ${p.ansprache || p.besonderheiten ? `<p class="pat-hinweise">${p.ansprache ? `<span class="marke">${esc(p.ansprache)}</span> ` : ''}${p.besonderheiten ? `<span class="marke warn-marke">${esc(p.besonderheiten)}</span>` : ''}</p>` : ''}
    <div class="pat-kontakte">${kontaktLink(p, p.telefon, 'telefon')}${kontaktLink(p, p.whatsapp, 'whatsapp', { klein: true })}${kontaktLink(p, p.email, 'email', { klein: true })}</div>
    ${stift(`/patienten/${p.id}/bearbeiten`, o.kopf ? 'patient.stammdaten' : 'kachel.stift', { fenster: 'Stammdaten bearbeiten', text: 'Stammdaten bearbeiten' })}
    <dl class="liste-dl klein">
      <dt>Patient seit</dt><dd>${datumText(p.patientSeit)}</dd>
      <dt>Letzte Behandlung</dt><dd>${behandlung}</dd>
      <dt>Nächster Termin</dt><dd>${termin}</dd>
    </dl>
    <p class="pat-fuss">${standChip(p)}${p.offeneAnrufe ? `<a class="chip preset7" href="/patienten/${p.id}#verlauf" data-hilfe="kachel.offen">${p.offeneAnrufe} Gespräch${p.offeneAnrufe > 1 ? 'e' : ''} ohne Grund</a>` : ''}${p.status !== 'aktiv' ? `<span class="chip preset12">${esc(p.status)}</span>` : ''}</p>
  </article>`;
}

// ── Liste ───────────────────────────────────────────────────────────────────
export function listeSeite(d: { patienten: PatientKurz[]; suche: string; archiv?: boolean; lexware?: boolean }, o: Rahmen): string {
  const leer = d.suche ? `<p class="leer">Niemand passt zu „${esc(d.suche)}“.</p>` : d.archiv ? '<p class="leer">Das Archiv ist leer.</p>' : '<p class="leer">Noch keine Patienten – über „+“ den ersten anlegen.</p>';
  return seite({
    titel: d.archiv ? 'Patienten – Archiv' : 'Patienten', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<h1>${symbol('patient', { groesse: 26 })} ${d.archiv ? 'Patienten – Archiv' : 'Patienten'}</h1>${meldungen(o)}
<form method="get" action="${d.archiv ? '/patienten/archiv' : '/patienten'}" class="filter patienten-filter">
  <label class="suche">Suchen<input type="search" name="suche" value="${esc(d.suche)}" placeholder="Name, Nummer, Telefon oder Mail" data-hilfe="patienten.suche" autocomplete="off"></label>
  <button class="knopf">Suchen</button>
  ${d.archiv ? '<a class="knopf" href="/patienten">Aktive Patienten</a>' : `<a class="knopf" href="/patienten/archiv" data-hilfe="patienten.archiv">${symbol('archiv', { groesse: 18 })} Archiv</a>${d.lexware ? `
  <a class="knopf" href="/patienten/lexware" data-hilfe="patienten.lexware">${symbol('euro', { groesse: 18 })} Aus Lexware</a>` : ''}`}
</form>
<div class="pat-raster">${d.archiv ? '' : plusKachel({ text: 'Neuer Patient', hilfe: 'patienten.neu', href: '/patienten/neu' })}${d.patienten.map((p) => kachel(p)).join('')}</div>${d.patienten.length ? '' : leer}`,
  });
}

// ── Aus Lexware (W99) ───────────────────────────────────────────────────────
const STAND_TITEL: Record<KundeStand, string> = { neu: 'Noch nicht in der Kartei', vermutet: 'Wahrscheinlich schon Patient', verknuepft: 'Verknüpft' };

/** Kundenkachel: wie die Patientenkachel, aber ohne Links in die Kartei – es gibt noch keinen Patienten */
function lexwareKachel(k: LexwareKundeStand): string {
  const a = k.adresse;
  const adresse = a ? [a.zusatz, [a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).map((t) => esc(t!)).join(', ') : '<span class="hint">keine</span>';
  const kontakt = (s: Symbol, wert: string | null, titel: string) => wert
    ? `<span class="pat-kontakt" title="${titel}">${symbol(s, { groesse: 18 })}<span>${esc(wert)}</span></span>`
    : `<span class="pat-kontakt fehlt" title="${titel}: kein Eintrag">${symbol(s, { groesse: 18 })}<span>–</span></span>`;
  const marken = [
    k.art === 'firma' ? '<span class="marke">Firma</span>' : '',
    k.art === 'firma' && k.vorname ? `<span class="marke">als Person: ${esc(k.vorname)} ${esc(k.nachname)}?</span>` : '',
    k.notiz ? '<span class="marke">Notiz in Lexware</span>' : '',
    k.archiviert ? '<span class="marke warn-marke">in Lexware archiviert</span>' : '',
  ].filter(Boolean).join(' ');
  const neuLink = (text: string, klasse = 'knopf primaer') => `<a class="${klasse}" href="/patienten/neu?lexware=${esc(k.nummer)}" data-hilfe="lexware.anlegen">${text}</a>`;
  const patient = (p: NonNullable<LexwareKundeStand['patient']>) => `${esc(p.name)} (${esc(p.patientennummer)}${p.status !== 'aktiv' ? `, ${esc(p.status)}` : ''})`;
  const auswahl = k.stand === 'neu'
    ? `<label class="lx-auswahl" title="${k.vorname ? 'für die Sammelübernahme auswählen' : 'Firma ohne Personenname – bitte einzeln anlegen'}"><input type="checkbox" name="kunde" value="${esc(k.nummer)}"${k.vorname ? '' : ' disabled'} data-hilfe="lexware.auswahl"></label>`
    : '';
  const aktionen = k.stand === 'neu'
    ? neuLink('Als Patient anlegen')
    : k.stand === 'vermutet'
      ? `${form('lexware_zuordnen', `<input type="hidden" name="kundennummer" value="${esc(k.nummer)}"><input type="hidden" name="kontakt_id" value="${esc(k.id)}"><button class="knopf primaer" data-hilfe="lexware.zuordnen">Zuordnen: ${patient(k.patient!)}</button>`, { id: k.patient!.id, zurueck: '/patienten/lexware' })} ${neuLink('Als neuen Patienten anlegen', 'knopf')}`
      : `<a class="knopf" href="/patienten/${k.patient!.id}" data-hilfe="lexware.patient">${symbol('patient', { groesse: 18 })} ${patient(k.patient!)}</a> ${form('lexware_loesen', '<button class="knopf" data-hilfe="lexware.loesen">Verknüpfung lösen</button>', { id: k.patient!.id, zurueck: '/patienten/lexware' })}`;
  return `<article class="pat lexware ${k.stand}" data-hilfe="lexware.kachel" id="lx-${esc(k.nummer)}">
    <header class="pat-kopf">${auswahl}<span class="pat-name"><b>${esc(kundenName(k))}</b></span><span class="pat-nr">Lexware ${esc(k.nummer)}</span></header>
    ${marken ? `<p class="pat-hinweise">${marken}</p>` : ''}
    <div class="pat-kontakte">${kontakt('telefon', k.telefon, 'Telefon')}${kontakt('email', k.email, 'E-Mail')}</div>
    <dl class="liste-dl klein"><dt>Rechnungsadresse</dt><dd>${adresse}</dd>${k.anrede ? `<dt>Anrede</dt><dd>${esc(k.anrede)}</dd>` : ''}</dl>
    <p class="pat-fuss">${aktionen}</p>
  </article>`;
}

export function lexwareKundenSeite(d: LexwareKundenDaten, o: Rahmen): string {
  const je = (s: KundeStand) => d.kunden.filter((k) => k.stand === s);
  // Sammelübernahme (W99b): die Gruppe „neu“ ist ein Formular, die Haken in den Kacheln gehören dazu
  const gruppen = (['neu', 'vermutet', 'verknuepft'] as const).filter((s) => je(s).length)
    .map((s) => s === 'neu'
      ? `<section class="pat-abschnitt" id="lexware-neu"><form method="post" action="/patienten/aktion" class="lx-mehrere"><input type="hidden" name="aktion" value="lexware_anlegen_mehrere"><input type="hidden" name="zurueck" value="/patienten/lexware">
  <h2>${STAND_TITEL.neu} <span class="hint">(${je('neu').length})</span><button class="knopf klein" data-hilfe="lexware.anlegen-mehrere">${symbol('patient', { groesse: 16 })} Ausgewählte als Patienten anlegen</button></h2>
  <div class="pat-raster">${je('neu').map(lexwareKachel).join('')}</div></form></section>`
      : `<section class="pat-abschnitt" id="lexware-${s}"><h2>${STAND_TITEL[s]} <span class="hint">(${je(s).length})</span></h2><div class="pat-raster">${je(s).map(lexwareKachel).join('')}</div></section>`).join('');
  const leer = d.fehler ? '' : d.suche ? `<p class="leer">Kein Lexware-Kunde passt zu „${esc(d.suche)}“.</p>` : '<p class="leer">Lexware kennt noch keine Kunden.</p>';
  const zahl = d.kunden.length;
  return seite({
    titel: 'Patienten – aus Lexware', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/patienten">Patienten</a> › Aus Lexware</p><h1>${symbol('euro', { groesse: 26 })} Kunden aus Lexware</h1>${meldungen(o)}
${d.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(d.fehler)}</p>` : ''}
<form method="get" action="/patienten/lexware" class="filter patienten-filter">
  <label class="suche">Suchen<input type="search" name="suche" value="${esc(d.suche)}" placeholder="Name, Firma, Kundennummer, Ort oder Mail" data-hilfe="lexware.suche" autocomplete="off"></label>
  <button class="knopf">Suchen</button>
  <a class="knopf" href="/patienten/lexware?neu=1" data-hilfe="lexware.neuladen">Neu laden</a>
  <a class="knopf" href="/patienten">Alle Patienten</a>
</form>
<p class="hint">${d.stand ? `${zahl} Kunde${zahl === 1 ? '' : 'n'}${d.suche ? ' passend' : ' in Lexware'} · Stand ${esc(datumZeitText(d.stand))}` : 'Kein Stand'} · ${je('verknuepft').length} verknüpft · ${je('vermutet').length} wahrscheinlich bekannt · ${je('neu').length} noch nicht in der Kartei${d.attrappe ? ' · <b>erfundene Kunden</b> (Testumgebung ohne Lexware-Schlüssel)' : ''}. Nur lesend – ein Patient entsteht erst über „Als Patient anlegen“.</p>
${gruppen || leer}`,
  });
}

/** Lexware-Kunde → Felder für „Neuer Patient“ (Mobil oder Festnetz nach der Vorwahl) */
export function vorbelegungAusLexware(k: LexwareKunde): Vorbelegung {
  const ziffern = (k.telefon ?? '').replace(/[^\d+]/g, '');
  const mobil = /^(\+49|0049|0)1[5-7]/.test(ziffern);
  return {
    lexwareKundennummer: k.nummer, lexwareKontaktId: k.id, lexwareName: kundenName(k), firma: k.art === 'firma',
    anrede: k.anrede ?? '', vorname: k.vorname, nachname: k.nachname, email: k.email ?? '',
    mobil: mobil ? k.telefon! : '', telefon: !mobil && k.telefon ? k.telefon : '',
    strasse: k.adresse?.strasse ?? '', hausnummer: k.adresse?.hausnummer ?? '', plz: k.adresse?.plz ?? '', ort: k.adresse?.ort ?? '',
  };
}

// ── Neu ─────────────────────────────────────────────────────────────────────
export interface Vorbelegung {
  /** Terminanfrage, der der neue Patient zugeordnet wird (A15) */
  anfrageId?: string;
  anrede?: string;
  vorname?: string;
  nachname?: string;
  email?: string;
  mobil?: string;
  telefon?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  /** Lexware-Kunde, den der neue Patient tragen soll (W99) */
  lexwareKundennummer?: string;
  lexwareKontaktId?: string;
  lexwareName?: string;
  /** In Lexware eine Firma – Vor- und Nachname sind geraten */
  firma?: boolean;
}

/** Felder der Person – dieselben für „Neuer Patient“ und „Stammdaten bearbeiten“ (W115) */
function personFelder(v: Partial<Pick<Patient, 'anrede' | 'titel' | 'vorname' | 'nachname' | 'geburtsname' | 'geburtsdatum' | 'patientSeit' | 'sprache' | 'ansprache' | 'besonderheiten' | 'kommunikationshilfe' | 'berufBelastung' | 'notiz'>>, neu: boolean): string {
  const feld = (label: string, attr: string, wert: string | null | undefined, typ = 'text', extra = '') => `<label>${label}<input type="${typ}" name="${attr}" value="${esc(wert ?? '')}"${extra}></label>`;
  return `<fieldset><legend>Person</legend>
    <div class="zwei">${feld('Anrede', 'anrede', v.anrede, 'text', ' maxlength="40" placeholder="Frau / Herr / –"')}${feld('Titel', 'titel', v.titel, 'text', ' maxlength="40"')}</div>
    <div class="zwei">${feld('Vorname', 'vorname', v.vorname, 'text', ' required maxlength="80" autocomplete="off"')}${feld('Nachname', 'nachname', v.nachname, 'text', ' required maxlength="80" autocomplete="off"')}</div>
    <div class="zwei">${feld('Geburtsname', 'geburtsname', v.geburtsname, 'text', ' maxlength="80"')}${feld('Geburtsdatum', 'geburtsdatum', v.geburtsdatum, 'date')}</div>
    <div class="zwei">${feld('Patient seit', 'patient_seit', v.patientSeit ?? (neu ? heuteBerlin() : ''), 'date')}${feld('Sprache', 'sprache', v.sprache, 'text', ' maxlength="40"')}</div>
    ${feld('Ansprache (nur auf Wunsch, z. B. Pronomen)', 'ansprache', v.ansprache, 'text', ' maxlength="120"')}
    ${feld('Besonderheiten für die Kachel', 'besonderheiten', v.besonderheiten, 'text', ' maxlength="200" placeholder="z. B. Hörgerät, kommt mit Begleitung"')}
    ${feld('Unterstützung bei der Verständigung', 'kommunikationshilfe', v.kommunikationshilfe, 'text', ' maxlength="200"')}
    <label>Beruf und Belastung im Alltag<textarea name="beruf_belastung" rows="2">${esc(v.berufBelastung ?? '')}</textarea></label>
    <label>Notiz<textarea name="notiz" rows="2">${esc(v.notiz ?? '')}</textarea></label>
  </fieldset>`;
}

export function neuSeite(o: Rahmen & { vorbelegung?: Vorbelegung }): string {
  const v = o.vorbelegung ?? {};
  const zurueck = v.lexwareKundennummer ? `/patienten/neu?lexware=${esc(v.lexwareKundennummer)}` : '/patienten/neu';
  const oben = `${meldungen(o)}${v.anfrageId ? `<p class="meldung ok">${symbol('anfrage', { groesse: 18 })} Aus <a href="/anfragen/${esc(v.anfrageId)}">Terminanfrage ${esc(v.anfrageId)}</a> – nach dem Anlegen ist der Patient der Anfrage zugeordnet.</p>` : ''}${v.lexwareKundennummer ? `<p class="meldung ok">${symbol('euro', { groesse: 18 })} Aus <a href="/patienten/lexware#lx-${esc(v.lexwareKundennummer)}">Lexware-Kunde ${esc(v.lexwareKundennummer)}</a> „${esc(v.lexwareName ?? '')}“ – bitte prüfen und ergänzen; nach dem Anlegen ist der Patient mit dem Kunden verknüpft.${v.firma ? ' In Lexware ist das eine Firma – Vor- und Nachname sind geraten.' : ''}</p>` : ''}`;
  return seite({
    titel: 'Neuer Patient', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }], titel: 'Neuer Patient', symbol: 'patient', aktion: 'anlegen', zurueck, abbrechen: '/patienten',
      hilfe: 'patient.neu.formular', knopf: 'Patient anlegen', knopfHilfe: 'patient.anlegen', oben,
      felder: `${v.anfrageId ? `<input type="hidden" name="anfrage_id" value="${esc(v.anfrageId)}">` : ''}${v.lexwareKundennummer ? `<input type="hidden" name="lexware_kundennummer" value="${esc(v.lexwareKundennummer)}"><input type="hidden" name="lexware_kontakt_id" value="${esc(v.lexwareKontaktId ?? '')}">` : ''}
  ${personFelder({ anrede: v.anrede, vorname: v.vorname, nachname: v.nachname }, true)}
  <fieldset><legend>Kontaktwege</legend>
    <label>Mobil<input name="mobil" inputmode="tel" placeholder="0151 …" value="${esc(v.mobil ?? '')}"></label>
    <label class="haken"><input type="checkbox" name="whatsapp_wie_mobil" value="1" checked> WhatsApp unter der Mobilnummer</label>
    <label>Telefon (Festnetz)<input name="telefon" inputmode="tel" value="${esc(v.telefon ?? '')}"></label>
    <label>E-Mail<input name="email" type="email" value="${esc(v.email ?? '')}"></label>
  </fieldset>
  <fieldset><legend>Adresse (wird Rechnungsadresse)</legend>
    <div class="zwei"><label>Straße<input name="strasse" value="${esc(v.strasse ?? '')}"></label><label>Nr.<input name="hausnummer" class="kurz" value="${esc(v.hausnummer ?? '')}"></label></div>
    <div class="zwei"><label>PLZ<input name="plz" inputmode="numeric" class="kurz" value="${esc(v.plz ?? '')}"></label><label>Ort<input name="ort" value="${esc(v.ort ?? '')}"></label></div>
  </fieldset>`,
    }),
  });
}

/** Stammdaten bearbeiten – dasselbe Formular wie „Neuer Patient“, dazu Abrechnung und Archiv (W115) */
export function bearbeitenSeite(d: { patient: Patient; preislisten: PatientSeiteDaten['preislisten'] }, o: Rahmen): string {
  const p = d.patient;
  const standard = d.preislisten.find((l) => l.standard);
  return seite({
    titel: `Stammdaten – ${name(p)}`, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }, { href: `/patienten/${p.id}`, text: name(p) }], titel: 'Stammdaten bearbeiten', symbol: 'patient', aktion: 'stammdaten', id: p.id,
      zurueck: `/patienten/${p.id}/bearbeiten`, abbrechen: `/patienten/${p.id}`, hilfe: 'patient.bearbeiten.formular', knopf: 'Speichern', knopfHilfe: 'patient.speichern', oben: meldungen(o),
      felder: `${personFelder(p, false)}
  <fieldset><legend>Abrechnung</legend>
    <div class="zwei"><label>Preisliste<select name="preisliste_id" data-hilfe="patient.preisliste"><option value=""${!p.preisliste ? ' selected' : ''}>Standard${standard ? ` (zurzeit „${esc(standard.name)}“)` : ''}</option>${d.preislisten.map((l) => `<option value="${l.id}"${p.preisliste?.id === l.id ? ' selected' : ''}>${esc(l.name)}${l.standard ? ' – Standard' : ''}</option>`).join('')}${p.preisliste && !d.preislisten.some((l) => l.id === p.preisliste!.id) ? `<option value="${p.preisliste.id}" selected>${esc(p.preisliste.name)} (nicht mehr aktiv – es gilt der Standard)</option>` : ''}</select><span class="hint">${p.preislisteGilt ? `Es gilt: ${esc(p.preislisteGilt.name)}${p.preislisteGilt.standard && !p.preisliste ? ' (Standard)' : ''}` : 'Keine Standard-Preisliste – bitte unter Preislisten eine setzen'}</span></label>
      <label>Rechnungen erhält der Patient<select name="rechnungsversand" data-hilfe="patient.rechnungsversand"><option value="email"${p.rechnungsversand === 'email' ? ' selected' : ''}>per Mail</option><option value="post"${p.rechnungsversand === 'post' ? ' selected' : ''}>per Post (drucken)</option><option value="beides"${p.rechnungsversand === 'beides' ? ' selected' : ''}>per Mail und Post</option></select></label></div>
    <p class="hint">Nummer ${esc(p.patientennummer)} · Abrechnung ${esc(p.abrechnungsmodus)}${p.lexwareKundennummer ? ` · Lexware ${esc(p.lexwareKundennummer)}` : ''}${p.exchangeKontaktId ? ' · im Postfach als Kontakt' : ' · noch nicht als Kontakt im Postfach'}</p>
  </fieldset>`,
      weitere: p.status === 'archiviert'
        ? `<button class="knopf" name="aktion" value="reaktivieren" data-hilfe="patient.reaktivieren">Wieder aktiv</button>`
        : `<button class="knopf warnend" name="aktion" value="archivieren" data-hilfe="patient.archivieren">Archivieren</button>`,
    }),
  });
}

/** Adresse anlegen oder bearbeiten – ein Formular (W115) */
export function adresseFormularSeite(p: Patient, a: Adresse | undefined, o: Rahmen): string {
  const titel = a ? 'Adresse bearbeiten' : 'Neue Adresse';
  const wert = (s: string | null | undefined) => esc(s ?? '');
  return seite({
    titel, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }, { href: `/patienten/${p.id}`, text: name(p) }], titel, symbol: 'ordner', aktion: 'adresse_speichern', id: p.id,
      zurueck: a ? `/patienten/${p.id}/adressen/${a.id}` : `/patienten/${p.id}/adressen/neu`, abbrechen: `/patienten/${p.id}#adressen`,
      hilfe: 'adresse.formular', knopf: 'Adresse speichern', knopfHilfe: 'adresse.speichern', oben: meldungen(o),
      felder: `${a ? `<input type="hidden" name="adresse_id" value="${a.id}">` : ''}
  <div class="zwei"><label>Bezeichnung<input name="bezeichnung" value="${wert(a?.bezeichnung)}" placeholder="Zuhause, Arbeit, Eltern …" maxlength="40"></label><label>Zusatz (c/o …)<input name="zusatz" value="${wert(a?.zusatz)}"></label></div>
  <div class="zwei"><label>Straße<input name="strasse" value="${wert(a?.strasse)}"></label><label>Nr.<input name="hausnummer" class="kurz" value="${wert(a?.hausnummer)}"></label></div>
  <div class="zwei"><label>PLZ<input name="plz" class="kurz" inputmode="numeric" value="${wert(a?.plz)}"></label><label>Ort<input name="ort" value="${wert(a?.ort)}"></label></div>
  <div class="zwei"><label>Land<input name="land" value="${esc(a?.land ?? 'DE')}" maxlength="2" class="kurz"></label>
  <label>Art der Adresse<select name="typ" data-hilfe="adresse.typ">${ADRESSE_TYPEN.map((x) => `<option value="${x}"${(a?.typ ?? 'rechnung') === x ? ' selected' : ''}>${esc(ADRESSE_TYP_TEXT[x])}</option>`).join('')}</select></label></div>
  <label class="haken"><input type="checkbox" name="rechnungsadresse" value="1"${a?.rechnungsadresse ? ' checked' : ''}> Rechnungsadresse</label>`,
      hinweis: 'Die erste Adresse eines Patienten ist automatisch Rechnungsadresse. Eine Hausbesuchadresse lässt sich am Termin als Behandlungsort wählen (W113).',
    }),
  });
}

/**
 * Behandlungsort wählen (W113): Praxis, eine Hausbesuchadresse des Patienten oder – gibt es noch keine – die
 * Rechnungsadresse als Hausbesuchadresse übernehmen (legt sie beim Speichern an). Auch im Rezept-Serienformular.
 */
export function behandlungsortFeld(p: Pick<Patient, 'id' | 'adressen'>, gewaehlt: string, hilfe = 'termin.behandlungsort'): string {
  // Kurz halten: lange Optionstexte machen das Auswahlfeld am Handy breiter als die Seite (WebKit)
  const adr = (a: Adresse) => `${a.bezeichnung ?? [a.strasse, a.hausnummer].filter(Boolean).join(' ') ?? 'Adresse'} (${a.ort ?? a.plz ?? '–'})`;
  const haus = p.adressen.filter((a) => a.typ === 'hausbesuch' || `adresse:${a.id}` === gewaehlt);
  const rechnung = p.adressen.find((a) => a.rechnungsadresse) ?? p.adressen[0];
  const opt = (wert: string, text: string, aus = false) => `<option value="${wert}"${wert === gewaehlt ? ' selected' : ''}${aus ? ' disabled' : ''}>${esc(text)}</option>`;
  return `<label>Behandlungsort<select name="behandlungsort" data-hilfe="${hilfe}">${opt('praxis', 'Praxis')}${haus.map((a) => opt(`adresse:${a.id}`, `Hausbesuch: ${adr(a)}`)).join('')}${!haus.length && rechnung ? opt('rechnung_kopieren', `Hausbesuch: Rechnungsadresse übernehmen (${rechnung.ort ?? rechnung.plz ?? '–'})`) : ''}${p.adressen.length ? '' : opt('keine', 'Hausbesuch: zuerst eine Adresse anlegen', true)}</select></label>`;
}

/** Neue Rechnung: Leistungsgruppe wählen, der Entwurf entsteht beim Anlegen (W115) */
export function rechnungNeuSeite(p: Patient, o: Rahmen): string {
  return seite({
    titel: 'Neue Rechnung', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }, { href: `/patienten/${p.id}`, text: name(p) }], titel: 'Neue Rechnung', symbol: 'euro', aktion: 'rechnung_neu', id: p.id,
      zurueck: `/patienten/${p.id}/neu/rechnung`, abbrechen: `/patienten/${p.id}#rechnungen`, hilfe: 'rechnung.neu.formular', knopf: 'Rechnungsentwurf anlegen', knopfHilfe: 'rechnung.neu.anlegen', oben: meldungen(o),
      felder: `<fieldset data-hilfe="rechnung.neu.art"><legend>Leistungsgruppe</legend>
    <label class="haken"><input type="radio" name="steuerklasse" value="heilbehandlung_steuerfrei" checked> Heilbehandlung – steuerfrei (§ 4 Nr. 14 UStG)</label>
    <label class="haken"><input type="radio" name="steuerklasse" value="wellness_19"> Wellness – 19 % Umsatzsteuer (bzw. Kleinunternehmer § 19 UStG)</label>
  </fieldset>`,
      hinweis: 'Rezepte und Serien legen ihren Entwurf selbst an – hier für Einzelleistungen. Eine Leistungsgruppe je Rechnung; Positionen kommen auf der Rechnungsseite dazu.',
    }),
  });
}

// ── Patient ─────────────────────────────────────────────────────────────────
function adresseKachel(p: Patient, a: Adresse): string {
  const zeilen = [a.zusatz ?? '', [a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' '), a.land !== 'DE' ? a.land : ''].filter(Boolean);
  return `<article class="adr${a.rechnungsadresse ? ' aktiv' : ''}" data-hilfe="adresse.kachel">
    <b>${esc(a.bezeichnung ?? 'Adresse')}</b>${a.typ !== 'rechnung' ? `<span class="rz-marken"><span class="marke hausbesuch" data-hilfe="adresse.typ" tabindex="0">${a.typ === 'hausbesuch' ? symbol('haus', { groesse: 12 }) : ''} ${esc(ADRESSE_TYP_TEXT[a.typ])}</span></span>` : ''}
    <p>${zeilen.map((z) => esc(z)).join('<br>')}</p>
    ${stift(`/patienten/${p.id}/adressen/${a.id}`, 'adresse.bearbeiten', { fenster: 'Adresse bearbeiten', text: 'Adresse bearbeiten' })}
    ${form('rechnungsadresse', `<label class="pk-aktiv" data-hilfe="adresse.rechnungsadresse"><input type="radio" name="adresse_id" value="${a.id}"${a.rechnungsadresse ? ' checked' : ''} data-auto-senden> Rechnungsadresse</label><button class="knopf klein nur-ohne-js">setzen</button>`, { id: p.id, zurueck: `/patienten/${p.id}`, klasse: 'adr-fuss' })}
    ${form('adresse_loeschen', `<input type="hidden" name="adresse_id" value="${a.id}"><button class="knopf klein warnend" data-hilfe="adresse.loeschen">entfernen</button>`, { id: p.id, zurueck: `/patienten/${p.id}` })}
  </article>`;
}

export function patientSeite(d: PatientSeiteDaten, o: Rahmen & { vorwahl?: { vorlage?: string; termin?: string } }): string {
  const p = d.patient;
  const zurueck = `/patienten/${p.id}`;
  const offene = d.verlauf.filter((v) => v.offen);
  const gruende = (feld = 'grund') => d.gruende.map((g) => `<label class="wahl-chip"><input type="radio" name="${feld}" value="${esc(g.code)}" required> ${esc(g.bezeichnung)}</label>`).join('');
  const offenBox = offene.map((v) => `<div class="hinweis-muster" data-hilfe="verlauf.offen">
    <p><b>${esc(VERLAUF_ART[v.art]?.[1] ?? v.art)} ${datumZeitText(v.am, { jahr: true })}</b>${v.kontakt ? ` · ${esc(v.kontakt.wert)}` : ''} – worum ging es?${v.notiz ? `<br><span class="hint">${esc(v.notiz)}</span>` : ''}</p>
    ${form('verlauf_abschliessen', `<input type="hidden" name="eintrag_id" value="${v.id}"><div class="chips" data-hilfe="verlauf.grund">${gruende()}</div>
      <label class="notiz">Notiz (optional)<input name="notiz" maxlength="500"></label>
      <div class="knopfreihe"><button class="knopf primaer">Eintragen</button></div>`, { id: p.id, zurueck, klasse: 'formular' })}
    ${form('verlauf_verwerfen', `<input type="hidden" name="eintrag_id" value="${v.id}"><button class="knopf klein" data-hilfe="verlauf.verwerfen">kein Gespräch – verwerfen</button>`, { id: p.id, zurueck })}
  </div>`).join('');
  const verlauf = d.verlauf.filter((v) => !v.offen).map((v) => {
    const [sym, text] = VERLAUF_ART[v.art] ?? ['protokoll', v.art];
    return `<li><span class="kanal-sym">${symbol(sym, { groesse: 18 })}</span><span><b>${v.grund ? esc(v.grund.bezeichnung) : esc(text)}</b> <span class="hint">${esc(text)} · ${datumZeitText(v.am, { jahr: true })}${v.kontakt ? ` · ${esc(v.kontakt.wert)}` : ''}${v.link ? ` · <a href="${esc(v.link)}" target="_blank" rel="noopener" data-hilfe="verlauf.oeffnen">in Outlook öffnen</a>` : ''}</span>${v.notiz ? `<br>${esc(v.notiz)}` : ''}</span></li>`;
  }).join('');
  const waTermin = (terminId: string) => d.whatsapp.filter((w) => w.terminId === terminId).map((w) =>
    `<a class="marke wa" href="${esc(w.link)}" target="_blank" rel="noopener" data-whatsapp="${p.id}" data-vorlage="${w.code}" data-termin="${w.terminId}" data-hilfe="termin.whatsapp">${symbol('whatsapp', { groesse: 12 })} ${esc(w.name)}</a>`).join('');
  const kontakte = p.kontakte.map((k) => `<li>
      <span class="kanal-sym">${symbol(KONTAKT_SYMBOL[k.art]!, { groesse: 18 })}</span>
      <span><b>${esc(k.wert)}</b> <span class="hint">${esc(KONTAKT_NAME[k.art] ?? k.art)}${k.bezeichnung ? ` · ${esc(k.bezeichnung)}` : ''}${k.primaer ? ' · primär' : ''}</span></span>
      <span class="rechts">${k.primaer ? '' : form('kontakt_speichern', `<input type="hidden" name="kontakt_id" value="${k.id}"><input type="hidden" name="art" value="${k.art}"><input type="hidden" name="wert" value="${esc(k.wert)}"><input type="hidden" name="bezeichnung" value="${esc(k.bezeichnung ?? '')}"><input type="hidden" name="primaer" value="1"><button class="knopf klein" data-hilfe="kontakt.primaer">primär</button>`, { id: p.id, zurueck })}
        ${form('kontakt_loeschen', `<input type="hidden" name="kontakt_id" value="${k.id}"><button class="knopf klein warnend" data-hilfe="kontakt.loeschen">entfernen</button>`, { id: p.id, zurueck })}</span>
    </li>`).join('');
  // Termin-Kachel (W114): Auskunft im Körper, alle Aktionen (WhatsApp-Texte, Status ändern) im „+“ oben rechts
  const termine = d.termine.map((t) => {
    const offen = t.status === 'bestaetigt' || t.status === 'vorgeschlagen';
    const menue = offen ? plusMenue(`${waTermin(t.id)}${form('termin_status', `<input type="hidden" name="termin_id" value="${t.id}"><select name="status" data-hilfe="termin.status" data-auto-senden><option value="">ändern …</option><option value="abgesagt_patient">abgesagt (Patient)</option><option value="abgesagt_praxis">abgesagt (Praxis)</option><option value="nicht_erschienen">nicht erschienen</option></select><button class="knopf klein nur-ohne-js">ok</button>`, { id: p.id, zurueck })}`, 'termin.plus', { klein: true, label: 'Aktionen zum Termin' }) : '';
    return `<article class="tk${t.verordnungId ? ' rezept' : ''}${offen ? ' mit-plus' : ''}" data-hilfe="termine.kachel">
    <b>${datumZeitText(t.beginn, { jahr: true })}</b><span class="hint">bis ${zeitText(t.ende)} · ${esc(t.art)}</span>
    <span class="pat-fuss"><span class="marke${t.verordnungId ? ' jetzt' : ''}">${t.verordnungId ? 'Rezept' : 'Individual'}</span>${t.behandlungsort === 'hausbesuch' ? `<span class="marke hausbesuch" data-hilfe="termin.hausbesuch" tabindex="0">${symbol('haus', { groesse: 12 })} Hausbesuch${t.ort ? ` · ${esc(t.ort)}` : ''}</span>` : ''}<span class="chip ${t.status === 'bestaetigt' ? 'preset4' : 'preset12'}">${esc(TERMIN_STATUS[t.status] ?? t.status)}</span>${t.imKalender ? `<span class="marke" data-hilfe="termin.kalender" tabindex="0">${symbol('kalender', { groesse: 12 })} Kalender</span>` : ''}</span>
    ${menue}${offen ? stift(`/patienten/${p.id}/termine/${t.id}/bearbeiten`, 'termin.bearbeiten', { fenster: 'Termin bearbeiten', text: 'Termin bearbeiten' }) : ''}
  </article>`;
  }).join('');
  const ART: Record<string, string> = { einzel: 'Einzelrechnung', zwischenrechnung: 'Zwischenrechnung', abschlussrechnung: 'Abschlussrechnung', monat: 'Monatsrechnung', ausfall: 'Ausfallgebühr' };
  /** Rechnungskachel: aus dem PPM → Rechnungsseite; aus Lexware (W103) → die Datei selbst */
  const rechnungKachel = (r: RechnungKurz) => {
    const verzug = r.status === 'gesendet' && r.faelligAm && r.faelligAm < heuteBerlin();
    const lexware = r.quelle === 'lexware';
    const ziel = lexware && r.pdf ? `/patienten/${p.id}/rechnungen/${r.id}/pdf` : `/patienten/${p.id}/rechnungen/${r.id}`;
    return `<a class="rk-pat ${verzug ? (r.gemahnt ? 'rot' : 'gelb') : ''}${lexware ? ' lexware' : ''}" href="${ziel}"${lexware && r.pdf ? ` data-pdf="${esc(r.nummer ?? r.dateiName ?? 'Rechnung')}"` : ''} data-hilfe="${lexware ? 'patient.rechnung.lexware' : 'patient.rechnung'}">
      <header>${symbol(lexware ? 'rechnung' : 'euro', { groesse: 18 })}<b>${esc(r.nummer ?? `${ART[r.art] ?? r.art} (Entwurf)`)}</b><span class="chip ${verzug ? (r.gemahnt ? 'preset0' : 'preset3') : r.statusFarbe}">${verzug ? (r.gemahnt ? 'gemahnt' : 'überfällig') : esc(r.statusText)}</span></header>
      <span class="rk-pat-betrag">${euroText(r.betrag)}</span>
      <dl class="liste-dl klein">${lexware
        ? `<dt>Datei</dt><dd>${r.pdf ? esc(r.dateiName ?? `Rechnung-${r.nummer ?? r.id}.pdf`) : '<span class="hint">keine Datei</span>'}</dd>`
        : `<dt>Gruppe</dt><dd>${r.steuerklasse === 'wellness_19' ? 'Wellness' : 'Heilbehandlung'} · ${r.positionen} Pos.</dd>`}<dt>Datum</dt><dd>${r.datum ? datumText(r.datum) : '–'}</dd>${r.faelligAm ? `<dt>Fällig</dt><dd>${datumText(r.faelligAm)}</dd>` : ''}${r.bezahltAm ? `<dt>Bezahlt</dt><dd>${datumText(r.bezahltAm)}</dd>` : ''}${r.zahlungen.map((z) => `<dt>Zahlung</dt><dd>${z.datum ? datumText(z.datum) : '–'} · ${euroText(z.betrag)} · ${esc(z.art)}</dd>`).join('')}${r.storniertAm ? `<dt>Storniert</dt><dd>${datumText(r.storniertAm)}</dd>` : ''}${r.versandArt ? `<dt>Versand</dt><dd>${{ email: 'per Mail', post: 'per Post', beides: 'Mail + Post' }[r.versandArt] ?? r.versandArt}</dd>` : ''}</dl>
      ${r.lexwareAbweichung ? `<span class="fk-warn">${symbol('warnung', { groesse: 14 })} ${esc(r.lexwareAbweichung)}</span>` : ''}${lexware ? `<span class="marke">${symbol('rechnung', { groesse: 12 })} aus Lexware${r.lexwareStatus ? ` · ${esc(r.lexwareStatus)}` : ''}</span>` : r.pdf ? `<span class="marke">${symbol('rechnung', { groesse: 12 })} PDF</span>` : ''}
    </a>`;
  };
  // Nach Jahr gruppiert (W103/W104): Entwürfe zuerst, dann die Jahre absteigend (so sortiert die Kartei); Entwürfe und das
  // neueste Jahr sind aufgeklappt, ältere Jahre nur eine Zeile mit der Anzahl
  const jahrVon = (r: RechnungKurz) => (r.status === 'entwurf' ? 'Entwürfe' : (r.datum ?? '').slice(0, 4) || 'ohne Datum');
  const jahre = [...new Set(d.rechnungen.map(jahrVon))];
  const neuestesJahr = jahre.find((j) => j !== 'Entwürfe');
  // „+“-Kachel (W114) vorn in der ersten (aufgeklappten) Gruppe – ohne Rechnungen ein eigenes Raster
  const rechnungPlus = plusKachel({ text: 'Neue Rechnung', hilfe: 'rechnung.neu', href: `/patienten/${p.id}/neu/rechnung` });
  const rechnungen = jahre.length ? jahre.map((j, i) => {
    const liste = d.rechnungen.filter((r) => jahrVon(r) === j);
    return `<details class="rk-jahr"${j === 'Entwürfe' || j === neuestesJahr ? ' open' : ''}><summary data-hilfe="patient.rechnung.jahr"><b>${esc(j)}</b> <span class="hint">Anz. Rechnungen: ${liste.length}</span></summary><div class="rk-pat-raster">${i === 0 ? rechnungPlus : ''}${liste.map(rechnungKachel).join('')}</div></details>`;
  }).join('') : `<div class="rk-pat-raster">${rechnungPlus}</div>`;
  const legende = `<span class="rk-legende" data-hilfe="patient.rechnung.legende" tabindex="0"><span><i></i> aus dem PPM</span><span><i class="lexware"></i> aus Lexware</span><span><i class="gelb"></i> überfällig</span><span><i class="rot"></i> gemahnt</span></span>`;
  const bezugspersonen = p.bezugspersonen.map((b) => `<li><span>${symbol('patient', { groesse: 18 })}</span><span><b>${esc(b.name)}</b> <span class="hint">${esc(b.rolle)}${b.beziehung ? ` · ${esc(b.beziehung)}` : ''}${b.berechtigungsgrund ? ` · ${esc(b.berechtigungsgrund)}` : ''}${b.telefon ? ` · ${esc(b.telefon)}` : ''}</span></span></li>`).join('');
  return seite({
    titel: name(p), aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/patienten">Patienten</a> › ${esc(name(p))}</p>${meldungen(o)}
${kachel(p, { kopf: true })}
<div class="knopfreihe pat-aktionen">
  <a class="knopf primaer" href="/patienten/${p.id}/akte" data-hilfe="patient.akte">${symbol('protokoll', { groesse: 18 })} Akte / Behandlungsverlauf</a>
  <a class="knopf" href="/patienten/${p.id}/neu/behandlung" data-hilfe="plus.behandlung">${symbol('haken', { groesse: 18 })} Behandlung erfassen</a>
  <a class="knopf" href="/patienten/${p.id}/bearbeiten" data-fenster="Stammdaten bearbeiten" data-hilfe="patient.stammdaten">${symbol('patient', { groesse: 18 })} Stammdaten bearbeiten</a>
  ${form('anruf', `<input type="hidden" name="kontakt_id" value="${p.telefon?.id ?? ''}"><button class="knopf" data-hilfe="verlauf.anruf-vermerken">${symbol('telefon', { groesse: 18 })} Anruf vermerken</button>`, { id: p.id, zurueck })}
</div>
<p class="hint pat-stand" data-hilfe="patient.stand" tabindex="0">Nummer ${esc(p.patientennummer)} · Abrechnung ${esc(p.abrechnungsmodus)}${p.lexwareKundennummer ? ` · Lexware ${esc(p.lexwareKundennummer)}` : ''} · Preisliste: ${p.preislisteGilt ? `Es gilt: ${esc(p.preislisteGilt.name)}${p.preislisteGilt.standard && !p.preisliste ? ' (Standard)' : ''}` : 'keine Standard-Preisliste – bitte unter Preislisten eine setzen'}${p.exchangeKontaktId ? ' · im Postfach als Kontakt' : ''}</p>

${offenBox}

<section class="pat-abschnitt" id="rezepte"><h2>${symbol('rezept')} Rezepte und Behandlungsserien</h2>
  <div class="rz-raster">${serienPlus(p.id)}${d.verordnungen.map((v) => rezeptKachel(v, { zurueck })).join('')}${d.serien.map((s) => serieKachel(s, { zurueck })).join('')}</div>
  ${d.verordnungen.length || d.serien.length ? '' : '<p class="leer">Kein Rezept und keine Serie hinterlegt – über „+“ anlegen.</p>'}
</section>

<section class="pat-abschnitt" id="termine"><h2>${symbol('kalender')} Termine</h2>
  <div class="tk-raster">${plusKachel({ text: 'Neuer Termin', hilfe: 'plus.termin', href: `/kalender?ansicht=monat&patient=${p.id}`, seite: true })}${termine}</div>
  ${termine ? '' : '<p class="leer">Keine kommenden Termine.</p>'}
</section>

<section class="pat-abschnitt" id="rechnungen"><h2>${symbol('euro')} Rechnungen ${legende}</h2>
  ${rechnungen}${jahre.length ? '' : '<p class="leer">Noch keine Rechnung – Rezepte und Serien legen ihren Entwurf selbst an.</p>'}
  ${d.lexwareRechnungen ? `<p>${form('lexware_rechnungen', `<button class="knopf klein" data-hilfe="patient.lexware_rechnungen">${symbol('rechnung', { groesse: 16 })} Rechnungen und Zahlungen aus Lexware prüfen</button>`, { id: p.id, zurueck: `${zurueck}#rechnungen` })} <span class="hint">Lexware kennt diesen Patienten als Kunden – neue Rechnungen kommen als Kacheln, bezahlte bekommen Zahldatum und Zahlungsposten.</span></p>` : ''}
  ${d.lexwareAbgleich?.abweichungen.length ? `<div class="hinweis-muster lx-abgleich" data-hilfe="patient.lexware-abgleich" tabindex="0"><p><b>Lexware-Kunde ${esc(d.lexwareAbgleich.nummer)}:</b> ${d.lexwareAbgleich.abweichungen.length} Feld${d.lexwareAbgleich.abweichungen.length === 1 ? '' : 'er'} weicht ab – der PPM-Wert bleibt, bis du den Lexware-Wert übernimmst.</p><ul class="lx-abweichungen">${d.lexwareAbgleich.abweichungen.map((a) => `<li><b>${esc(a.titel)}</b>: hier „${esc(a.ppm ?? '–')}“ · Lexware „${esc(a.lexware)}“ ${form('lexware_uebernehmen', `<input type="hidden" name="feld" value="${a.feld}"><button class="knopf klein" data-hilfe="patient.lexware-uebernehmen">Lexware-Wert übernehmen</button>`, { id: p.id, zurueck: `${zurueck}#rechnungen` })}</li>`).join('')}</ul></div>` : ''}
  ${d.lexwareKundeAnlegbar ? `<p>${form('lexware_kunde_anlegen', `<button class="knopf klein" data-hilfe="patient.lexware-kunde">${symbol('euro', { groesse: 16 })} In Lexware als Kunde anlegen</button>`, { id: p.id, zurueck: `${zurueck}#rechnungen` })} <span class="hint">Noch kein Lexware-Kunde – nötig, bevor eine Rechnung nach Lexware geht (passiert sonst beim ersten „Nach Lexware“ von selbst).</span></p>` : ''}
</section>

<section class="pat-abschnitt" id="nachricht"><h2>${symbol('email')} Nachricht an ${esc(p.vorname)} <span class="hint">WhatsApp vom Handy · Mail-Entwurf für Outlook</span></h2>
  ${d.whatsapp.length
    ? `<div class="knopfreihe wa-knoepfe" data-hilfe="nachricht.whatsapp">${d.whatsapp.filter((w) => !w.terminId).map((w) => `<a class="knopf klein" href="${esc(w.link)}" target="_blank" rel="noopener" data-whatsapp="${p.id}" data-vorlage="${w.code}">${symbol('whatsapp', { groesse: 16 })} ${esc(w.name)}</a>`).join('')}</div>
  <p class="hint">Terminbestätigung und -erinnerung stehen oben an jedem Termin. Der Knopf öffnet WhatsApp mit fertigem Text – Sie lesen, ändern und senden selbst. Keine Gesundheitsangaben (Leitplanke 9).</p>`
    : '<p class="hint">Keine WhatsApp-Nummer hinterlegt – unten unter Kontaktwege eintragen, dann erscheinen hier die WhatsApp-Knöpfe.</p>'}
  ${p.email ? `<form method="post" action="/patienten/aktion" class="formular nachricht"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="zurueck" value="${zurueck}">
    <div class="zwei"><label>Vorlage<select name="vorlage" data-hilfe="nachricht.vorlage">${VORLAGEN.filter((v) => v.kanaele.includes('email')).map((v) => `<option value="${v.code}"${o.vorwahl?.vorlage === v.code ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label>Termin <span class="hint">(Bestätigung, Erinnerung, Absage)</span><select name="termin_id" data-hilfe="nachricht.termin"><option value="">–</option>${d.termine.map((t) => `<option value="${t.id}"${o.vorwahl?.termin === t.id ? ' selected' : ''}>${esc(datumZeitText(t.beginn, { jahr: true }))}${t.status.startsWith('abgesagt') ? ' (abgesagt)' : ''}</option>`).join('')}</select></label></div>
    <div class="zwei"><label>Rechnung <span class="hint">(Zusenden, Erinnerung)</span><select name="rechnung_id" data-hilfe="nachricht.rechnung"><option value="">–</option>${d.rechnungen.filter((r) => r.nummer).map((r) => `<option value="${r.id}">${esc(r.nummer!)} · ${euroText(r.betrag)}</option>`).join('')}</select></label>
    <label>Text <span class="hint">(bei Freier Text, Terminvorschlag, Ersatztermin)</span><textarea name="freitext" rows="3" maxlength="2000" data-hilfe="nachricht.text"></textarea></label></div>
    <fieldset class="anhaenge" data-hilfe="nachricht.anhang"><legend>Anhänge</legend>
      ${d.rechnungen.filter((r) => r.pdf).map((r) => `<label class="haken"><input type="checkbox" name="anhang_rechnung" value="${r.id}"> Rechnung ${esc(r.nummer ?? r.id)} (PDF)</label>`).join('')}
      ${d.dokumente.map((x) => `<label class="haken"><input type="checkbox" name="anhang_dokument" value="${x.id}"> ${esc(x.titel)} <span class="hint">${esc(x.art)}${x.datum ? ` · ${datumText(x.datum)}` : ''}</span></label>`).join('')}
      ${d.rechnungen.some((r) => r.pdf) || d.dokumente.length ? '' : '<span class="hint">Noch nichts anhängbar – Rechnungs-PDFs kommen aus Lexware, Unterlagen aus der Akte.</span>'}
    </fieldset>
    <div class="knopfreihe"><button class="knopf primaer" name="aktion" value="mail_entwurf" data-hilfe="nachricht.mail">${symbol('email', { groesse: 18 })} Entwurf in Outlook anlegen</button>
    ${d.whatsappCloud && p.whatsapp ? `<button class="knopf" name="aktion" value="whatsapp_senden" data-hilfe="nachricht.whatsapp-senden">${symbol('whatsapp', { groesse: 18 })} Per WhatsApp senden</button>` : ''}</div>
    <p class="hint">Der Entwurf landet an ${esc(p.email.wert)} im Postfach der Praxis (Outlook, Apple Mail: „Entwürfe“) – gesendet wird dort von Hand.</p>
  </form>` : '<p class="hint">Keine Mailadresse hinterlegt – unten unter Kontaktwege eintragen, dann lässt sich hier ein Mail-Entwurf anlegen.</p>'}
</section>

<section class="pat-abschnitt" id="kontakte"><h2>${symbol('anfrage')} Kontaktwege</h2>
  <ul class="kanaele">${kontakte || '<li class="hint">noch keiner</li>'}</ul>
  ${form('kontakt_speichern', `<label>Art<select name="art">${Object.entries(KONTAKT_NAME).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label>Nummer bzw. Adresse<input name="wert" required></label><label>Bezeichnung<input name="bezeichnung" placeholder="privat, Arbeit …" maxlength="40"></label>
    <label class="haken"><input type="checkbox" name="primaer" value="1"> als primär (auf der Kachel)</label>
    <button class="knopf" data-hilfe="kontakt.neu">Kontakt hinzufügen</button>`, { id: p.id, zurueck, klasse: 'formular zeile' })}
</section>

<section class="pat-abschnitt" id="adressen"><h2>${symbol('ordner')} Adressen</h2>
  <div class="adr-raster">${plusKachel({ text: 'Neue Adresse', hilfe: 'adresse.neu', href: `/patienten/${p.id}/adressen/neu` })}${p.adressen.map((a) => adresseKachel(p, a)).join('')}
  </div>
</section>

${bezugspersonen ? `<section class="pat-abschnitt"><h2>${symbol('patient')} Bezugspersonen</h2><ul class="kanaele" data-hilfe="bezugspersonen.liste">${bezugspersonen}</ul></section>` : ''}

<section class="pat-abschnitt" id="verlauf"><h2>${symbol('telefon')} Kontaktverlauf <span class="hint">${d.verlauf.length} Einträge</span></h2>
  ${verlauf ? `<div class="verlauf-fenster" data-hilfe="verlauf.liste" tabindex="0"><ul class="kanaele">${verlauf}</ul></div>` : '<p class="leer">Noch kein Gespräch vermerkt. Ein Tipp auf die Telefonnummer oben legt den ersten Eintrag an.</p>'}
  <details class="mehr-form"><summary class="knopf klein" data-hilfe="verlauf.eintragen">Eintrag von Hand</summary>
  ${form('verlauf_eintragen', `<label>Art<select name="art">${Object.entries(VERLAUF_ART).map(([k, [, t]]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></label>
    <div class="chips">${gruende()}</div><label>Notiz<input name="notiz" maxlength="500"></label><div class="knopfreihe"><button class="knopf primaer">Speichern</button></div>`, { id: p.id, zurueck, klasse: 'formular' })}
  </details>
</section>`,
  });
}

// ── Akte ────────────────────────────────────────────────────────────────────
export function akteSeite(d: AkteDaten, o: Rahmen): string {
  const p = d.patient;
  const faelle = d.faelle.map((f) => `<section class="tafel fall" data-hilfe="akte.fall" tabindex="0">
    <h2>Fall ${f.nummer}${f.bezeichnung ? ` – ${esc(f.bezeichnung)}` : ''} <span class="chip ${f.abgeschlossenAm ? 'preset12' : 'preset4'}">${f.abgeschlossenAm ? 'abgeschlossen' : esc(f.phase)}</span></h2>
    <dl class="liste-dl klein"><dt>Grundlage</dt><dd>${esc(GRUNDLAGE[f.grundlage] ?? f.grundlage)} · ${f.steuerklasse === 'wellness_19' ? '19 % USt' : 'Heilbehandlung, steuerfrei'}</dd>
      ${f.anlass ? `<dt>Anlass</dt><dd>${esc(f.anlass)}</dd>` : ''}${f.diagnoseArzt ? `<dt>Diagnose (ärztlich)</dt><dd>${esc(f.diagnoseArzt)}</dd>` : ''}
      <dt>Zeitraum</dt><dd>${datumText(f.begonnenAm)} – ${f.abgeschlossenAm ? datumText(f.abgeschlossenAm) : 'laufend'}</dd></dl>
    ${f.behandlungen.length ? `<ol class="behandlungen">${f.behandlungen.map((b) => `<li id="b-${b.id}" data-hilfe="akte.behandlung" tabindex="0">
      <div class="b-kopf"><b>${datumText(b.datum)}</b>${b.dauerMin ? ` · ${b.dauerMin} min` : ''} · ${esc(b.behandeltVon)}${b.status === 'ausgefallen' ? ' <span class="chip preset12">ausgefallen</span>' : ''}
        ${b.leistungen.map((l) => `<span class="marke${l.verordnungId ? ' jetzt' : ''}">${esc(l.nummer)} ${esc(l.bezeichnung)}${l.verordnungId ? ' · Rezept ✓' : ''}</span>`).join(' ')}</div>
      ${b.bestaetigung ? `<p class="b-bestaetigung">${symbol('haken', { groesse: 14 })} Bestätigt: ${esc(BESTAETIGUNG_TEXT[b.bestaetigung.art] ?? b.bestaetigung.art)} · ${datumZeitText(b.bestaetigung.zeitpunkt, { jahr: true })}${b.bestaetigung.werName ? ` · ${esc(b.bestaetigung.werName)}` : ''}${b.bestaetigung.bild ? ` · <a href="/patienten/${p.id}/behandlungen/${b.id}/unterschrift.png" data-pdf="Unterschrift ${datumText(b.datum)}" data-hilfe="akte.unterschrift">Unterschrift ansehen</a>` : ''}</p>` : '<p class="b-bestaetigung hint">ohne Bestätigung des Patienten</p>'}
      <dl class="liste-dl klein">${b.massnahmen ? `<dt>Maßnahmen</dt><dd>${esc(b.massnahmen)}</dd>` : ''}${b.verlaufWirkung ? `<dt>Verlauf / Wirkung</dt><dd>${esc(b.verlaufWirkung)}</dd>` : ''}
        ${b.reaktionen ? `<dt>Reaktionen</dt><dd>${esc(b.reaktionen)}</dd>` : ''}${b.uebungen ? `<dt>Übungen / Empfehlungen</dt><dd>${esc(b.uebungen)}</dd>` : ''}</dl>
    </li>`).join('')}</ol>` : '<p class="leer">Noch keine Behandlung in diesem Fall.</p>'}
  </section>`).join('');
  return seite({
    titel: `Akte – ${name(p)}`, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/patienten">Patienten</a> › <a href="/patienten/${p.id}">${esc(name(p))}</a> › Akte</p>
<h1>${symbol('protokoll', { groesse: 26 })} Akte ${esc(name(p))} <span class="hint">${esc(p.patientennummer)}</span></h1>${meldungen(o)}
<p class="hint">Behandlungsdokumentation nach § 630f BGB. Einträge werden nicht geändert oder gelöscht – jedes Öffnen dieser Seite steht im Protokoll.</p>
<div class="knopfreihe"><a class="knopf primaer" href="/patienten/${p.id}/neu/behandlung" data-hilfe="akte.neu">${symbol('haken', { groesse: 18 })} Behandlung erfassen</a>
  <a class="knopf" href="/patienten/${p.id}/akte.pdf" target="_blank" rel="noopener" data-hilfe="akte.pdf">${symbol('rechnung', { groesse: 18 })} Akte als PDF (§ 630g)</a></div>
${faelle || '<p class="leer">Die Akte ist noch leer – mit „Behandlung erfassen“ beginnt der erste Fall.</p>'}`,
  });
}

// ── „+“-Aktionen ────────────────────────────────────────────────────────────
export const kopfzeile = (p: Patient, titel: string, sym: Symbol) =>
  `<p class="hint"><a href="/patienten">Patienten</a> › <a href="/patienten/${p.id}">${esc(name(p))}</a> › ${esc(titel)}</p><h1>${symbol(sym, { groesse: 26 })} ${esc(titel)} <span class="hint">${esc(name(p))}</span></h1>`;

/** Auswahl aller Terminarten, je Sektion eine Gruppe; inaktive sind gekennzeichnet (für Lilli intern wählbar) */
export const terminartOptionen = (arten: Terminart[], gewaehlt?: string | null) => SEKTION_REIHE.map((s) => {
  const liste = arten.filter((a) => a.sektion === s);
  return liste.length ? `<optgroup label="${esc(SEKTIONEN[s].name)}">${liste.map((a) => `<option value="${a.id}"${a.id === gewaehlt ? ' selected' : ''}>${esc(a.code)} – ${esc(a.kurz)} (${a.dauerMin} Min.)${a.aktiv ? '' : ' · nicht online'}</option>`).join('')}</optgroup>` : '';
}).join('');

/** Ein Formular für „Neuer Termin“ und „Termin bearbeiten“ (W115) */
export function terminNeuSeite(d: NeuAktionDaten, o: Rahmen & { termin?: TerminDetail; vorbelegung?: { datum?: string; zeit?: string; dauerMin?: number } }): string {
  const p = d.patient;
  const t = o.termin;
  const v = o.vorbelegung ?? {};
  // Beim Bearbeiten auch das Rezept des Termins anbieten, falls es nicht mehr aktiv ist
  const liste = t?.verordnungId && !d.verordnungen.some((v) => v.id === t.verordnungId) ? [...d.verordnungen, ...d.alleVerordnungen.filter((v) => v.id === t.verordnungId)] : d.verordnungen;
  const rezepte = liste.map((v) => `<option value="${v.id}"${t?.verordnungId === v.id ? ' selected' : ''}>${esc(v.massnahme)} – ${v.abgehakt} von ${v.anzahlVerordnet} (vom ${datumText(v.ausgestelltAm)})</option>`).join('');
  const art = (wert: string, text: string) => `<option value="${wert}"${(t?.art ?? 'behandlung') === wert ? ' selected' : ''}>${text}</option>`;
  const dauer = t ? Math.max(5, Math.round((Date.parse(t.ende) - Date.parse(t.beginn)) / 60_000)) : (v.dauerMin && v.dauerMin > 0 ? v.dauerMin : 30);
  const titel = t ? 'Termin bearbeiten' : 'Neuer Termin';
  return seite({
    titel, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }, { href: `/patienten/${p.id}`, text: name(p) }], titel, symbol: 'kalender', aktion: t ? 'termin_aendern' : 'termin_anlegen', id: p.id,
      zurueck: t ? `/patienten/${p.id}/termine/${t.id}/bearbeiten` : `/patienten/${p.id}/neu/termin`, abbrechen: `/patienten/${p.id}#termine`,
      hilfe: 'termin.formular', knopf: t ? 'Termin speichern' : 'Termin anlegen', knopfHilfe: t ? 'termin.aendern' : 'termin.anlegen', oben: meldungen(o),
      felder: `${t ? `<input type="hidden" name="termin_id" value="${t.id}">` : ''}
  <div class="zwei"><label>Datum<input type="date" name="datum" required value="${t ? datumBerlin(t.beginn) : /^\d{4}-\d{2}-\d{2}$/.test(v.datum ?? '') ? esc(v.datum!) : heuteBerlin()}"></label><label>Uhrzeit<input type="time" name="zeit" required value="${t ? zeitBerlin(t.beginn) : /^\d{2}:\d{2}$/.test(v.zeit ?? '') ? esc(v.zeit!) : ''}"></label></div>
  <div class="zwei"><label>Dauer (Minuten)<input type="number" name="dauer_min" value="${dauer}" min="5" step="5"></label>
    <label>Art<select name="art">${art('behandlung', 'Behandlung')}${art('erstgespraech', 'Erstgespräch')}${art('sonstige', 'Sonstiges')}</select></label></div>
  <label>Rezept<select name="verordnung_id"><option value="">kein Rezept (Individualtermin)</option>${rezepte}</select></label>
  <label>Terminart <span class="hint">(Farbe und Symbol im Kalender)</span><select name="terminart_id" data-hilfe="termin.terminart"><option value="">– aus Rezept bzw. Fall –</option>${terminartOptionen(d.terminarten, t?.terminartId)}</select></label>
  ${behandlungsortFeld(p, t?.behandlungsort === 'hausbesuch' ? (t.adresseId ? `adresse:${t.adresseId}` : 'rechnung_kopieren') : 'praxis')}
  <div class="zwei"><label>Fahrt davor (Minuten) <span class="hint">nur Hausbesuch</span><input type="number" name="fahrt_vor_min" min="0" max="240" step="5" value="${t?.fahrtManuell ? t.fahrtVorMin : ''}" placeholder="${t?.behandlungsort === 'hausbesuch' && !t.fahrtManuell ? `automatisch: ${t.fahrtVorMin}` : 'automatisch'}" data-hilfe="termin.fahrt"></label>
    <label>Fahrt danach (Minuten)<input type="number" name="fahrt_nach_min" min="0" max="240" step="5" value="${t?.fahrtManuell ? t.fahrtNachMin : ''}" placeholder="${t?.behandlungsort === 'hausbesuch' && !t.fahrtManuell ? `automatisch: ${t.fahrtNachMin}` : 'automatisch'}" data-hilfe="termin.fahrt"></label></div>`,
      hinweis: 'Der Termin steht in der Kartei und wird in den Kalender des Postfachs gespiegelt – dort mit Kategorie „Praxis-Termin“, Betreff nur Initialen und Patientennummer (Testumgebung: Kalender „Praxis-Test“). Hausbesuch: Fahrtzeiten leer lassen, dann schätzt der Kalender sie aus der Konfiguration und blockt sie mit.',
    }),
  });
}

export function behandlungNeuSeite(d: NeuAktionDaten, o: Rahmen): string {
  const p = d.patient;
  const faelle = d.faelle.map((f) => `<option value="${f.id}">Fall ${f.nummer}${f.bezeichnung ? ` – ${esc(f.bezeichnung)}` : ''} (${esc(GRUNDLAGE[f.grundlage] ?? f.grundlage)})</option>`).join('');
  const rezepte = d.verordnungen.map((v) => `<option value="${v.id}">${esc(v.massnahme)} – ${v.abgehakt} von ${v.anzahlVerordnet}</option>`).join('');
  const jetztTag = heuteBerlin();
  const termine = d.termine.filter((t) => (t.status === 'bestaetigt' || t.status === 'vorgeschlagen') && t.beginn.slice(0, 10) <= `${jetztTag}T`).slice(0, 5)
    .map((t) => `<option value="${t.id}">${datumZeitText(t.beginn, { jahr: true })}</option>`).join('');
  return seite({
    titel: 'Behandlung erfassen', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: `${kopfzeile(p, 'Behandlung erfassen', 'haken')}${meldungen(o)}
<form method="post" action="/patienten/aktion" class="tafel formular" data-hilfe="behandlung.formular">
  <input type="hidden" name="aktion" value="behandlung_erfassen"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="zurueck" value="/patienten/${p.id}/neu/behandlung">
  <label>Behandlungsfall<select name="fall_id" data-fall-wahl>${faelle}<option value="neu"${faelle ? '' : ' selected'}>neuer Fall …</option></select></label>
  <fieldset data-neuer-fall${faelle ? ' hidden' : ''}><legend>Neuer Fall</legend>
    <label>Grundlage<select name="grundlage"><option value="verordnung">ärztliche Verordnung</option><option value="direktzugang">Direktzugang (Heilpraktikererlaubnis)</option><option value="praevention">Prävention / Wellness (19 %)</option></select></label>
    <label>Kurzbezeichnung<input name="fall_bezeichnung" maxlength="80" placeholder="z. B. Schulter rechts"></label>
    <label>Anlass / Beschwerden<textarea name="anlass" rows="2"></textarea></label>
    <label>Ärztliche Diagnose (wie mitgeteilt)<input name="diagnose_arzt" maxlength="200"></label>
  </fieldset>
  <div class="zwei"><label>Datum<input type="date" name="datum" required value="${jetztTag}"></label><label>Dauer (Minuten)<input type="number" name="dauer_min" min="5" step="5" value="30"></label></div>
  <label>Rezept abhaken<select name="verordnung_id"><option value="">ohne Rezept</option>${rezepte}</select></label>
  <div class="zwei"><label>Leistung (Nr. aus der Preisliste)<input name="leistung_nummer" placeholder="z. B. 21201" maxlength="12"></label>
    <label>Termin<select name="termin_id"><option value="">ohne Termin</option>${termine}</select></label></div>
  <label>Maßnahmen – was wurde gemacht<textarea name="massnahmen" rows="3" required></textarea></label>
  <label>Verlauf / Wirkung<textarea name="verlauf_wirkung" rows="2"></textarea></label>
  <label>Reaktionen, Unverträglichkeiten<textarea name="reaktionen" rows="2"></textarea></label>
  <label>Übungen, Empfehlungen<textarea name="uebungen" rows="2"></textarea></label>
  <fieldset class="bestaetigung" data-hilfe="behandlung.bestaetigung"><legend>Bestätigung des Patienten</legend>
    <div class="wahl-zeile">
      <label class="wahl-chip"><input type="radio" name="bestaetigung" value="unterschrift" checked> Unterschrift am Bildschirm</label>
      <label class="wahl-chip"><input type="radio" name="bestaetigung" value="papier"> auf Papier unterschrieben</label>
      <label class="wahl-chip"><input type="radio" name="bestaetigung" value="muendlich"> mündlich bestätigt</label>
      <label class="wahl-chip"><input type="radio" name="bestaetigung" value="keine"> keine</label>
    </div>
    <div data-unterschrift-box>
      <p class="hint">„Ich bestätige die Behandlung an diesem Tag.“ – der Patient unterschreibt mit dem Finger auf der Fläche:</p>
      <canvas class="unterschrift" data-unterschrift="unterschrift-feld" width="600" height="200" data-hilfe="behandlung.unterschrift" aria-label="Unterschriftsfläche"></canvas>
      <input type="hidden" name="unterschrift" id="unterschrift-feld">
      <button type="button" class="knopf klein" data-unterschrift-loeschen data-hilfe="behandlung.unterschrift-loeschen">Fläche leeren</button>
    </div>
    <label>Bestätigt von <span class="hint">(leer = Patient selbst)</span><input name="bestaetigt_von" maxlength="80" placeholder="z. B. Mutter, Begleitung"></label>
  </fieldset>
  <p class="hint">Der Eintrag ist danach fest (§ 630f BGB). Ein Fehler wird durch einen Folgeeintrag korrigiert, nicht durch Ändern.</p>
  <button class="knopf primaer" data-hilfe="behandlung.speichern">In die Akte eintragen</button>
</form>`,
  });
}

export function rezeptNeuSeite(d: NeuAktionDaten, o: Rahmen & { vorgaenger?: string }): string {
  const p = d.patient;
  const faelle = d.faelle.map((f) => `<option value="${f.id}">Fall ${f.nummer}${f.bezeichnung ? ` – ${esc(f.bezeichnung)}` : ''}</option>`).join('');
  const vorgaenger = d.alleVerordnungen.filter((v) => v.status !== 'ersetzt').map((v) => `<option value="${v.id}"${v.id === o.vorgaenger ? ' selected' : ''}>${esc(v.massnahme)} vom ${datumText(v.ausgestelltAm)} – ${v.abgehakt} von ${v.anzahlVerordnet} (${esc(v.status)})</option>`).join('');
  const arten = Object.entries(VERORDNUNG_ARTEN).map(([k, t]) => `<option value="${k}"${o.vorgaenger && k === 'folge_unveraendert' ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return seite({
    titel: 'Neues Rezept', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: `${kopfzeile(p, 'Neues Rezept', 'rezept')}${meldungen(o)}
<form method="post" action="/patienten/aktion" class="tafel formular" data-hilfe="rezept.formular">
  <input type="hidden" name="aktion" value="verordnung_anlegen"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="zurueck" value="/patienten/${p.id}/neu/rezept">
  <div class="zwei"><label>Rezeptart<select name="art" data-hilfe="rezept.art">${arten}</select></label>
    <label>Vorheriges Rezept (bei Folge, Wiederaufnahme, Korrektur)<select name="vorgaenger_id" data-hilfe="rezept.vorgaenger"><option value="">keins</option>${vorgaenger}</select></label></div>
  <label class="haken"><input type="checkbox" name="langzeit" value="1" data-hilfe="rezept.langzeit"> Langzeitbehandlung (chronische oder länger anhaltende Problematik)</label>
  <p class="hint">Korrektur: ersetzt das gewählte Rezept, die bisherigen Haken zählen weiter – kein neues Kontingent. Zweitschrift: nicht hier, sondern auf der Rezept-Kachel unter „mehr …“ vermerken.</p>
  <div class="zwei"><label>Ausgestellt am<input type="date" name="ausgestellt_am" required value="${heuteBerlin()}"></label><label>Gültig bis<input type="date" name="gueltig_bis"></label></div>
  <label>Verordnende Ärztin / Arzt<input name="arzt" maxlength="120" placeholder="Name, Praxis"></label>
  <div class="zwei"><label>Verordnete Maßnahme<input name="massnahme" required maxlength="120" placeholder="z. B. Manuelle Therapie"></label><label>Nr. in der Preisliste<input name="leistung_nummer" maxlength="12" placeholder="z. B. 21201"></label></div>
  <div class="zwei"><label>Anzahl Behandlungen<input type="number" name="anzahl" required min="1" max="99" value="6"></label><label>Frequenz<input name="frequenz" placeholder="z. B. 2× pro Woche" maxlength="40"></label></div>
  <label>Diagnose laut Rezept<input name="diagnose" maxlength="200"></label>
  <label>Behandlungsfall<select name="fall_id"><option value="">wie der Vorgänger bzw. später zuordnen</option>${faelle}</select></label>
  <label>Notiz<input name="notiz" maxlength="200"></label>
  <p class="hint">Das Foto des Rezepts kommt mit dem Dokumenten-Tresor (W69).</p>
  <button class="knopf primaer" data-hilfe="rezept.anlegen">Rezept anlegen</button>
</form>`,
  });
}
