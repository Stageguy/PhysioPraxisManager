/**
 * Kalenderseite (W82, W112, W116): Termine der Kartei als Tag oder Woche, dazu Outlook-Termine im Öffnungsfenster
 * (Patient mit Nummer = Kachel, sonst grauer Block mit Link), die Öffnungszeiten je Tag und – in der Tagesansicht –
 * die freien Zeiten (grün) mit Stift und Absage je Termin. Die Monatsansicht steht in ./terminplan.ts.
 * Namen nur mit „namen=1“ (sonst Initialen wie im Cockpit).
 */
import type { TerminKalender } from '../kartei/patienten.ts';
import type { KalenderBlock } from '../kartei/outlook-termine.ts';
import type { Luecke } from '../kartei/terminplan.ts';
import { wochentag, type Oeffnungszeit } from '../anfragen/slots.ts';
import { zeitText } from '../format.ts';
import { datumBerlin, tagPlus, wocheUm, zeitBerlin, ZONE } from '../zeit.ts';
import { sektionLegende, sektionMarke } from './bausteine.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';
import { kalenderLink, terminZiel, type Kontext } from './terminplan.ts';

const TAG_KURZ = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: 'short', day: '2-digit', month: '2-digit' });
const TAG_LANG = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const tagText = (tag: string, lang = false) => (lang ? TAG_LANG : TAG_KURZ).format(new Date(`${tag}T12:00:00Z`));

export interface KalenderSeiteDaten {
  tag: string;
  ansicht: 'tag' | 'woche';
  termine: TerminKalender[];
  namenZeigen: boolean;
  heute: string;
  freieTage?: Record<string, string>;
  /** Outlook-Termine im Öffnungsfenster, die nicht aus der Kartei stammen (W112) */
  bloecke?: KalenderBlock[];
  oeffnungszeiten?: Oeffnungszeit[];
  postfach?: boolean;
  fehler?: string;
  /** Freie Zeiten des Tages (W116c) – nur in der Tagesansicht */
  luecken?: Luecke[];
  /** Termin für diesen Patienten anlegen: freie Zeiten führen direkt ins Formular */
  patient?: Kontext | null;
}

const blockHtml = (b: KalenderBlock): string => {
  const zeit = `<b>${zeitText(b.beginn)}–${zeitText(b.ende)}</b>`;
  if (b.art === 'patient') {
    return `<a class="kal-termin outlook-patient" href="/patienten/${b.patientId}#termine" data-hilfe="kalender.outlook-patient">${zeit}<span>${esc(b.patientennummer ?? '')}</span><span class="rz-marken"><span class="marke">Outlook · kommt in die Kartei</span></span></a>`;
  }
  const inhalt = `${zeit}<span>${b.reserviert ? 'Reserviert · Terminanfrage' : 'Geblockt · Outlook'}</span>`;
  return b.webLink
    ? `<a class="kal-termin block" href="${esc(b.webLink)}" target="_blank" rel="noopener" data-hilfe="kalender.block">${inhalt}</a>`
    : `<div class="kal-termin block" data-hilfe="kalender.block">${inhalt}</div>`;
};

export function kalenderSeite(d: KalenderSeiteDaten, o: { wer: string; fassung: string; skriptInline?: string }): string {
  const tage = d.ansicht === 'woche' ? wocheUm(d.tag) : [d.tag];
  const mit = { namen: d.namenZeigen ? '1' : undefined, patient: d.patient?.id };
  const link = (tag: string, ansicht = d.ansicht) => kalenderLink({ tag, ansicht, ...mit });
  const name = (t: TerminKalender) => (d.namenZeigen ? `${t.vorname} ${t.nachname}` : `${t.vorname[0]}. ${t.nachname[0]}.`);
  const marken = (t: TerminKalender) => `<span class="rz-marken">${t.leistung ? `<span class="marke jetzt" data-hilfe="termine.leistung">${esc(t.leistung)}</span>` : ''}<span class="marke">${t.rezept ? 'Rezept' : t.art === 'erstgespraech' ? 'Erstgespräch' : 'Individual'}</span>${t.imKalender ? '' : '<span class="marke">nicht im Kalender</span>'}${t.status === 'vorgeschlagen' ? '<span class="marke">vorgeschlagen</span>' : ''}</span>`;
  const klasse = (t: TerminKalender) => `kal-termin${t.sektion ? ` sek-${t.sektion}` : t.rezept ? ' rezept' : ''}${t.status === 'erledigt' ? ' erledigt' : ''}`;
  // Tagesansicht: Kachel mit Stift und Absage (W116c); Wochenansicht: die Kachel ist der Link zum Patienten
  const terminHtml = (t: TerminKalender) => d.ansicht === 'tag'
    ? `<div class="${klasse(t)}" data-hilfe="kalender.termin">
        <b>${sektionMarke(t.sektion)}${zeitText(t.beginn)}–${zeitText(t.ende)}</b><span><a href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin-patient">${esc(name(t))}</a> <span class="hint">${esc(t.patientennummer)}</span></span>
        ${marken(t)}${t.status === 'bestaetigt' || t.status === 'vorgeschlagen' ? `<span class="kal-aktionen"><a href="/patienten/${t.patientId}/termine/${t.id}/bearbeiten" data-fenster="Termin bearbeiten" data-hilfe="kalender.termin-stift">${symbol('stift', { groesse: 14 })} bearbeiten</a><a href="/patienten/${t.patientId}/termine/${t.id}/absagen" data-fenster="Termin absagen" data-hilfe="kalender.termin-absagen">${symbol('kreuz', { groesse: 14 })} absagen</a></span>` : ''}
      </div>`
    : `<a class="${klasse(t)}" href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin">
        <b>${sektionMarke(t.sektion)}${zeitText(t.beginn)}–${zeitText(t.ende)}</b><span>${esc(name(t))} <span class="hint">${esc(t.patientennummer)}</span></span>
        ${marken(t)}
      </a>`;
  const lueckeHtml = (l: Luecke) => `<a class="kal-termin luecke" href="${terminZiel(d.patient ?? null, datumBerlin(l.beginn), zeitBerlin(l.beginn), Math.min(60, l.minuten))}"${d.patient ? ' data-fenster="Neuer Termin"' : ''} data-hilfe="kalender.luecke"><b>${zeitText(l.beginn)}–${zeitText(l.ende)}</b><span>frei · ${l.minuten} Min.${d.patient ? ` – Termin für ${esc(d.patient.name)}` : ''}</span></a>`;
  const spalten = tage.map((tag) => {
    const des = d.termine.filter((t) => datumBerlin(t.beginn) === tag);
    const bloecke = (d.bloecke ?? []).filter((b) => datumBerlin(b.beginn) === tag);
    const luecken = d.ansicht === 'tag' ? (d.luecken ?? []).filter((l) => datumBerlin(l.beginn) === tag) : [];
    const eintraege = [
      ...des.map((t) => ({ beginn: t.beginn, html: terminHtml(t) })),
      ...bloecke.map((b) => ({ beginn: b.beginn, html: blockHtml(b) })),
      ...luecken.map((l) => ({ beginn: l.beginn, html: lueckeHtml(l) })),
    ].sort((a, b) => a.beginn.localeCompare(b.beginn));
    const oeff = d.oeffnungszeiten?.filter((f) => f.tag === wochentag(tag));
    return `<section class="kal-tag${tag === d.heute ? ' heute' : ''}${oeff && !oeff.length ? ' zu' : ''}" data-hilfe="kalender.tag"><h2><a href="${link(tag, 'tag')}">${esc(tagText(tag, d.ansicht === 'tag'))}</a> <span class="pw-zahl">${des.length}</span>${d.freieTage?.[tag] ? ` <span class="chip preset12" data-hilfe="kalender.frei" tabindex="0">${esc(d.freieTage[tag])}</span>` : ''}</h2>
      ${oeff ? `<p class="kal-oeff" data-hilfe="kalender.oeffnung">${oeff.length ? oeff.map((f) => `${f.von}–${f.bis}`).join(', ') : 'geschlossen'}</p>` : ''}
      ${eintraege.length ? eintraege.map((e) => e.html).join('') : '<p class="pw-leer">frei</p>'}
    </section>`;
  }).join('');
  const schritt = d.ansicht === 'woche' ? 7 : 1;
  return seite({
    titel: 'Kalender', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<header class="kopf pw-titel"><h1>${symbol('kalender', { groesse: 26 })} ${d.patient ? 'Neuer Termin' : 'Kalender'} <span class="hint">${d.ansicht === 'woche' ? `Woche ab ${esc(tagText(tage[0]!, true))}` : esc(tagText(d.tag, true))}</span></h1>
<div class="knopfreihe">
  <a class="knopf klein" href="${link(tagPlus(d.tag, -schritt))}" data-hilfe="kalender.zurueck">‹ zurück</a>
  <a class="knopf klein" href="${link(d.heute)}" data-hilfe="kalender.heute">Heute</a>
  <a class="knopf klein" href="${link(tagPlus(d.tag, schritt))}" data-hilfe="kalender.weiter">weiter ›</a>
  <a class="knopf klein${d.ansicht === 'tag' ? ' primaer' : ''}" href="${link(d.tag, 'tag')}" data-hilfe="kalender.ansicht-tag">Tag</a>
  <a class="knopf klein${d.ansicht === 'woche' ? ' primaer' : ''}" href="${link(d.tag, 'woche')}" data-hilfe="kalender.ansicht-woche">Woche</a>
  <a class="knopf klein" href="${kalenderLink({ ansicht: 'monat', monat: d.tag.slice(0, 7), ...mit })}" data-hilfe="kalender.ansicht-monat">Monat</a>
  <a class="knopf klein" href="${kalenderLink({ tag: d.tag, ansicht: d.ansicht, patient: d.patient?.id, namen: d.namenZeigen ? undefined : '1' })}" data-hilfe="kalender.namen">${symbol(d.namenZeigen ? 'schloss' : 'auge', { groesse: 16 })} ${d.namenZeigen ? 'Nur Initialen' : 'Namen zeigen'}</a>
</div></header>
${sektionLegende()}
${d.patient ? `<p class="meldung ok" data-hilfe="kalender.patient-kontext">${symbol('patient', { groesse: 18 })}<span>Termin für <b>${esc(d.patient.name)}</b>: eine freie Zeit (grün) anklicken. <a href="/patienten/${d.patient.id}#termine">Abbrechen</a></span></p>` : ''}
${d.fehler ? `<p class="warn">${esc(d.fehler)}</p>` : ''}
<p class="hint">Termine aus der Kartei. Was im Kalender des Postfachs innerhalb der Öffnungszeiten steht, erscheint als grauer Block (Link öffnet Outlook); Praxis-Termine mit Patientennummer übernimmt der Abgleich in die Kartei.${d.ansicht === 'tag' ? ' Grün: freie Zeiten – ein Klick legt dort einen Termin an.' : ''} Öffnungszeiten und Pausen: Konfiguration.${d.postfach === false ? ' Kein Postfach verbunden – Outlook-Termine fehlen.' : ''}</p>
<div class="kal ${d.ansicht}">${spalten}</div>`,
  });
}
