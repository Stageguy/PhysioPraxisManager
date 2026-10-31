/**
 * Terminkalender zum Buchen (W116): Monatsansicht mit Zählern, Suche „Nächster freier Termin mit …“, Tageskästen mit
 * Rahmenfarbe (frei / teilweise / voll), Hover mit allen Terminen, Lücken und geblockten Zeiten. Dazu die Formularseiten
 * „Termin anlegen“ aus dem Kalender (Patient wählen) und „Termin absagen“ (W115-Aufbau).
 */
import type { KalenderBlock } from '../kartei/outlook-termine.ts';
import type { Patient, PatientKurz, TerminDetail, TerminKalender } from '../kartei/patienten.ts';
import type { Terminart } from '../kartei/terminarten.ts';
import { DAUERN, type Luecke, type MonatsPlan, type TagesPlan, type WochenSuche } from '../kartei/terminplan.ts';
import { WOCHENTAG_KURZ } from '../kartei/freie-tage.ts';
import { wochentag } from '../anfragen/slots.ts';
import { datumText, datumZeitText, zeitText } from '../format.ts';
import { datumBerlin, tagPlus, zeitBerlin } from '../zeit.ts';
import { formular, meldungen, sektionLegende, type Rahmen } from './bausteine.ts';
import { esc, seite } from './layout.ts';
import { name, terminartOptionen } from './patienten.ts';
import { symbol } from './symbole.ts';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const dauerVon = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

export interface Kontext { id: string; name: string }

/** Adresse der Kalenderseite mit den Parametern, die über alle Ansichten mitlaufen (Patient, Namen) */
export function kalenderLink(p: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  return `/kalender?${s.toString()}`;
}

/** Wohin ein Klick auf eine freie Zeit führt: mit Patient direkt ins Terminformular, sonst zur Patientenwahl */
export const terminZiel = (patient: Kontext | null, datum: string, zeit: string, dauer: number): string =>
  patient ? `/patienten/${patient.id}/neu/termin?datum=${datum}&zeit=${zeit}&dauer_min=${dauer}` : `/kalender/termin?datum=${datum}&zeit=${zeit}&dauer_min=${dauer}`;

export interface MonatSeiteDaten { plan: MonatsPlan; suche?: WochenSuche; woche: string; patient: Kontext | null; namenZeigen: boolean }

export function monatSeite(d: MonatSeiteDaten, o: Rahmen): string {
  const { plan } = d;
  const monatParam = `${plan.jahr}-${String(plan.monat).padStart(2, '0')}`;
  const basis = { ansicht: 'monat', patient: d.patient?.id, namen: d.namenZeigen ? '1' : undefined };
  const vor = plan.monat === 1 ? `${plan.jahr - 1}-12` : `${plan.jahr}-${String(plan.monat - 1).padStart(2, '0')}`;
  const nach = plan.monat === 12 ? `${plan.jahr + 1}-01` : `${plan.jahr}-${String(plan.monat + 1).padStart(2, '0')}`;
  const sucheParam = d.suche ? { suche: String(d.suche.dauer), woche: d.suche.wochenstart } : {};
  const kurz = (t: TerminKalender) => (d.namenZeigen ? `${t.vorname} ${t.nachname}` : `${t.vorname[0]}. ${t.nachname[0]}.`);
  const eintrag = (t: TerminKalender) => `<span class="mk-e sek-${t.sektion ?? 'rezept'}${t.status === 'erledigt' ? ' erledigt' : ''}"><small>${zeitText(t.beginn)}–${zeitText(t.ende)} (${dauerVon(t.beginn, t.ende)})</small> ${esc(kurz(t))}${t.behandlungsort === 'hausbesuch' ? ` ${symbol('haus', { groesse: 11, titel: 'Hausbesuch' })}` : ''}</span>`;
  // Fahrten zu und von Hausbesuchen (W113) nur im Hover – die Kästen bleiben übersichtlich
  const fahrtEintraege = (t: TerminKalender) => [
    ...(t.fahrtVorMin > 0 ? [{ beginn: new Date(Date.parse(t.beginn) - t.fahrtVorMin * 60_000).toISOString(), html: `<span class="mk-e fahrt"><small>${zeitText(new Date(Date.parse(t.beginn) - t.fahrtVorMin * 60_000).toISOString())}–${zeitText(t.beginn)} (${t.fahrtVorMin})</small> Fahrt</span>` }] : []),
    ...(t.fahrtNachMin > 0 ? [{ beginn: t.ende, html: `<span class="mk-e fahrt"><small>${zeitText(t.ende)}–${zeitText(new Date(Date.parse(t.ende) + t.fahrtNachMin * 60_000).toISOString())} (${t.fahrtNachMin})</small> Fahrt</span>` }] : []),
  ];
  const blockEintrag = (b: KalenderBlock) => `<span class="mk-e block"><small>${zeitText(b.beginn)}–${zeitText(b.ende)} (${dauerVon(b.beginn, b.ende)})</small> ${b.reserviert ? 'reserviert' : b.art === 'patient' ? esc(b.patientennummer ?? 'Patient') : 'geblockt'}</span>`;
  const lueckeEintrag = (l: Luecke) => `<span class="mk-e luecke"><small>${zeitText(l.beginn)}–${zeitText(l.ende)} (${l.minuten})</small> frei</span>`;
  // Tageskasten (W125): sichtbar nur Termine und Blöcke (bis sechs, sonst fünf plus „Mehr ›“). Beim Überfahren immer der ganze
  // Tag: die Öffnungszeit als Rahmen, dazwischen Termine, Blöcke, Fahrten und die freien Zeiten (grün) vom Tagesbeginn bis zum Tagesende
  const zelle = (tp: TagesPlan) => {
    const alle = [...tp.termine.map((t) => ({ beginn: t.beginn, html: eintrag(t) })), ...tp.bloecke.map((b) => ({ beginn: b.beginn, html: blockEintrag(b) }))].sort((a, b) => a.beginn.localeCompare(b.beginn));
    const ueberlauf = alle.length > 6;
    const sichtbar = ueberlauf ? alle.slice(0, 5) : alle;
    const hover = [...alle, ...tp.termine.flatMap(fahrtEintraege), ...tp.luecken.filter((l) => l.minuten >= DAUERN[0]).map((l) => ({ beginn: l.beginn, html: lueckeEintrag(l) }))].sort((a, b) => a.beginn.localeCompare(b.beginn));
    // Erste Zeile: Bilanz des Tages – freie Minuten (Lücken in der Öffnungszeit, heute ab jetzt) und gebuchte Minuten (Termine ohne Fahrten)
    const freiMin = tp.luecken.reduce((n, l) => n + l.minuten, 0);
    const gebuchtMin = tp.termine.reduce((n, t) => n + dauerVon(t.beginn, t.ende), 0);
    const bilanz = `<span class="mk-e bilanz"><b class="frei">${freiMin} Min. frei</b> · <b>${gebuchtMin} Min. gebucht</b></span>`;
    const rahmen = tp.oeffnung.length ? `<span class="mk-e rahmen"><small>${tp.oeffnung.map((f) => `${esc(f.von)}–${esc(f.bis)}`).join(' · ')}</small> Öffnung</span>` : '<span class="mk-e rahmen">geschlossen</span>';
    return `<a class="mk-tag stand-${tp.stand}${tp.datum === plan.heute ? ' heute' : ''}" href="${kalenderLink({ ...basis, ansicht: 'tag', tag: tp.datum })}" data-hilfe="kalender.monat-tag">
      <span class="mk-kopf"><b>${Number(tp.datum.slice(8))}</b>${tp.freierTag ? `<small class="mk-frei">${esc(tp.freierTag)}</small>` : ''}${tp.termine.length ? `<small class="mk-zahl">${tp.termine.length}</small>` : ''}</span>
      ${sichtbar.map((x) => x.html).join('')}${ueberlauf ? '<span class="mk-e mehr">Mehr ›</span>' : ''}
      <span class="mk-mehr">${bilanz}${rahmen}${hover.map((x) => x.html).join('')}</span>
    </a>`;
  };
  // Raster: vom Montag vor dem 1. bis zum Sonntag nach dem Monatsende
  const erster = `${monatParam}-01`;
  const letzter = plan.tage[plan.tage.length - 1]!.datum;
  const zellen: string[] = [];
  for (let t = tagPlus(erster, 1 - wochentag(erster)), ende = tagPlus(letzter, 7 - wochentag(letzter)); t <= ende; t = tagPlus(t, 1)) {
    const tp = plan.tage.find((x) => x.datum === t);
    zellen.push(tp ? zelle(tp) : '<div class="mk-tag fremd"></div>');
  }
  const zaehler = plan.frei.map((f) => `<span class="mk-zaehler"><b>${f.anzahl}</b> × ${f.dauer} Min.</span>`).join('');
  const panel = d.suche ? `<section class="mk-panel" data-hilfe="kalender.suche.ergebnis" tabindex="0"><header><b>Freie Zeiten für ${d.suche.dauer} Minuten</b><span class="hint">Woche ab ${datumText(d.suche.wochenstart)}</span>
      <a class="knopf klein" href="${kalenderLink({ ...basis, monat: monatParam, suche: String(d.suche.dauer), woche: tagPlus(d.suche.wochenstart, -7) })}" data-hilfe="kalender.suche.woche" aria-label="Woche zurück">‹</a>
      <a class="knopf klein" href="${kalenderLink({ ...basis, monat: monatParam, suche: String(d.suche.dauer), woche: tagPlus(d.suche.wochenstart, 7) })}" data-hilfe="kalender.suche.woche" aria-label="Woche weiter">›</a></header>
    <div class="mk-woche">${d.suche.tage.map((t) => `<div class="mk-wtag"><b>${WOCHENTAG_KURZ[wochentag(t.datum) - 1]} ${datumText(t.datum).slice(0, 6)}</b>${t.zeiten.length
    ? t.zeiten.map((z) => `<a class="mk-zeit" href="${terminZiel(d.patient, datumBerlin(z), zeitBerlin(z), d.suche!.dauer)}"${d.patient ? ' data-fenster="Neuer Termin"' : ''} data-hilfe="kalender.suche.zeit">${zeitText(z)}</a>`).join('')
    : '<span class="hint">–</span>'}</div>`).join('')}</div></section>` : '';
  return seite({
    titel: 'Kalender – Monat', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<header class="kopf pw-titel"><h1>${symbol('kalender', { groesse: 26 })} ${d.patient ? 'Neuer Termin' : 'Kalender'} <span class="hint">${MONATE[plan.monat - 1]} ${plan.jahr}</span></h1>
<div class="knopfreihe">
  <a class="knopf klein" href="${kalenderLink({ ...basis, monat: vor, ...sucheParam })}" data-hilfe="kalender.zurueck">‹ zurück</a>
  <a class="knopf klein" href="${kalenderLink({ ...basis, monat: plan.heute.slice(0, 7), ...sucheParam })}" data-hilfe="kalender.heute">Heute</a>
  <a class="knopf klein" href="${kalenderLink({ ...basis, monat: nach, ...sucheParam })}" data-hilfe="kalender.weiter">weiter ›</a>
  <a class="knopf klein" href="${kalenderLink({ ...basis, ansicht: 'tag', tag: plan.heute })}" data-hilfe="kalender.ansicht-tag">Tag</a>
  <a class="knopf klein" href="${kalenderLink({ ...basis, ansicht: 'woche', tag: plan.heute })}" data-hilfe="kalender.ansicht-woche">Woche</a>
  <a class="knopf klein primaer" href="${kalenderLink({ ...basis, monat: monatParam })}" data-hilfe="kalender.ansicht-monat">Monat</a>
</div></header>${meldungen(o)}
${d.patient ? `<p class="meldung ok" data-hilfe="kalender.patient-kontext">${symbol('patient', { groesse: 18 })}<span>Termin für <b>${esc(d.patient.name)}</b>: eine freie Zeit anklicken – im Suchfenster oder in der Tagesansicht. <a href="/patienten/${d.patient.id}#termine">Abbrechen</a></span></p>` : ''}
${plan.fehler ? `<p class="warn">${esc(plan.fehler)}</p>` : ''}
<div class="mk-kopfzeile"><span class="hint">Frei bis Monatsende:</span><span class="mk-zaehler-reihe" data-hilfe="kalender.frei-zaehler" tabindex="0">${zaehler}</span>
  <span class="mk-legende" data-hilfe="kalender.legende" tabindex="0">${sektionLegende()}<span class="mk-l frei">frei</span><span class="mk-l teilweise">noch Platz</span><span class="mk-l voll">voll</span><span class="mk-l luecke">Lücke</span><span class="mk-l block">geblockt</span></span>
  <a class="knopf klein mk-namen" href="${kalenderLink({ ...basis, monat: monatParam, namen: d.namenZeigen ? undefined : '1', ...sucheParam })}" data-hilfe="kalender.namen">${symbol(d.namenZeigen ? 'schloss' : 'auge', { groesse: 16 })} ${d.namenZeigen ? 'Nur Kürzel' : 'Namen einblenden'}</a></div>
<form method="get" action="/kalender" class="filter mk-suche" data-hilfe="kalender.suche"><input type="hidden" name="ansicht" value="monat"><input type="hidden" name="monat" value="${monatParam}">${d.patient ? `<input type="hidden" name="patient" value="${d.patient.id}">` : ''}${d.namenZeigen ? '<input type="hidden" name="namen" value="1">' : ''}<input type="hidden" name="woche" value="${d.woche}">
  <label>Nächster freier Termin mit<select name="suche" data-hilfe="kalender.suche.dauer" data-auto-senden><option value="">– Dauer wählen –</option>${DAUERN.map((x) => `<option value="${x}"${d.suche?.dauer === x ? ' selected' : ''}>${x} Minuten</option>`).join('')}</select></label>
  <button class="knopf klein nur-ohne-js">suchen</button>
</form>
${panel}
<div class="mk-wochentage">${WOCHENTAG_KURZ.map((w) => `<span class="mk-wt">${w}</span>`).join('')}</div>
<div class="mk">${zellen.join('')}</div>
<p class="hint">Rahmen: grün = noch nichts belegt, gelb = noch Platz, rot = voll, grau = geschlossen. Überfahren zeigt alle Termine, Lücken (grün) und geblockte Zeiten; Klick öffnet den Tag. Pause nach jedem Termin: ${plan.pufferMin} Min. (Konfiguration, je Terminart änderbar).</p>`,
  });
}

/** Termin aus dem Kalender anlegen, wenn kein Patient vorgewählt ist: erst den Patienten wählen (W116e) */
export function terminWahlSeite(d: { patienten: PatientKurz[]; terminarten: Terminart[]; vorbelegung: { datum?: string; zeit?: string; dauerMin?: number } }, o: Rahmen): string {
  const v = d.vorbelegung;
  const zurueckTag = kalenderLink({ ansicht: 'tag', tag: v.datum });
  return seite({
    titel: 'Termin anlegen', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/kalender?ansicht=monat', text: 'Kalender' }], titel: 'Termin anlegen', symbol: 'kalender', aktion: 'termin_anlegen', zurueck: '/kalender/termin', abbrechen: zurueckTag,
      hilfe: 'termin.wahl.formular', knopf: 'Termin anlegen', knopfHilfe: 'termin.anlegen', oben: meldungen(o),
      felder: `<label>Patient<select name="id" required data-hilfe="termin.wahl.patient"><option value="">bitte wählen …</option>${d.patienten.map((p) => `<option value="${p.id}">${esc(`${p.nachname}, ${p.vorname}`)} (${esc(p.patientennummer)})</option>`).join('')}</select></label>
  <p class="hint">Noch nicht in der Kartei? Erst unter <a href="/patienten/neu">Patienten › „+“</a> anlegen.</p>
  <div class="zwei"><label>Datum<input type="date" name="datum" required value="${esc(v.datum ?? '')}"></label><label>Uhrzeit<input type="time" name="zeit" required value="${esc(v.zeit ?? '')}"></label></div>
  <div class="zwei"><label>Dauer (Minuten)<input type="number" name="dauer_min" value="${v.dauerMin ?? 30}" min="5" step="5"></label>
    <label>Art<select name="art"><option value="behandlung">Behandlung</option><option value="erstgespraech">Erstgespräch</option><option value="sonstige">Sonstiges</option></select></label></div>
  <label>Terminart <span class="hint">(Farbe und Symbol im Kalender)</span><select name="terminart_id" data-hilfe="termin.terminart"><option value="">– aus Rezept bzw. Fall –</option>${terminartOptionen(d.terminarten)}</select></label>`,
      hinweis: 'Ein Rezept lässt sich auf der Patientenseite zuordnen (Stift am Termin). Der Termin wird in den Kalender des Postfachs gespiegelt.',
    }),
  });
}

/** Termin absagen (W116c): Grund wählen; danach fragt die Patientenseite nach der Nachricht – nichts geht automatisch raus */
export function terminAbsagenSeite(d: { patient: Patient; termin: TerminDetail }, o: Rahmen): string {
  const p = d.patient;
  const t = d.termin;
  const wahl = (wert: string, text: string, hinweis: string, aktiv = false) => `<label class="haken"><input type="radio" name="status" value="${wert}"${aktiv ? ' checked' : ''}> ${text} <span class="hint">${hinweis}</span></label>`;
  return seite({
    titel: 'Termin absagen', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/patienten', text: 'Patienten' }, { href: `/patienten/${p.id}`, text: name(p) }], titel: 'Termin absagen', symbol: 'kreuz', aktion: 'termin_absagen', id: p.id,
      zurueck: `/patienten/${p.id}/termine/${t.id}/absagen`, abbrechen: kalenderLink({ ansicht: 'tag', tag: datumBerlin(t.beginn) }),
      hilfe: 'termin.absagen.formular', knopf: 'Termin absagen', knopfHilfe: 'termin.absagen.speichern', oben: meldungen(o),
      felder: `<input type="hidden" name="termin_id" value="${t.id}">
  <p><b>${esc(datumZeitText(t.beginn, { wochentag: true, jahr: true }))}–${zeitText(t.ende)}</b> · ${esc(name(p))}</p>
  <fieldset data-hilfe="termin.absagen.grund"><legend>Grund</legend>
    ${wahl('abgesagt_praxis', 'Praxis sagt ab', '– Lilli verschiebt oder streicht', true)}
    ${wahl('abgesagt_patient', 'Patient sagt ab', '– rechtzeitig')}
    ${wahl('nicht_erschienen', 'Nicht erschienen', '– ohne Absage (Ausfallgebühr nach Konfiguration)')}
  </fieldset>`,
      hinweis: 'Der Termin verschwindet aus Kalender und Kartei-Vorschau, bleibt aber mit Status in der Akte. Danach öffnet sich die Patientenseite mit vorgewählter Nachricht „Absage mit Ersatztermin“ – per WhatsApp vom Handy oder als Mail-Entwurf, nie automatisch.',
    }),
  });
}
