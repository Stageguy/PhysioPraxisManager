/**
 * Kalenderseite (W82, W112): alle Termine der Kartei als Tag oder Woche, dazu Outlook-Termine im Öffnungsfenster
 * (Patient mit Nummer = Kachel, sonst grauer Block mit Link) und die Öffnungszeiten je Tag. Erreichbar über das
 * Kalender-Symbol bei „Heute im Blick“. Namen nur mit „namen=1“ (sonst Initialen wie im Cockpit).
 */
import type { TerminKalender } from '../kartei/patienten.ts';
import type { KalenderBlock } from '../kartei/outlook-termine.ts';
import { wochentag, type Oeffnungszeit } from '../anfragen/slots.ts';
import { zeitText } from '../format.ts';
import { datumBerlin, tagPlus, wocheUm, ZONE } from '../zeit.ts';
import { sektionLegende, sektionMarke } from './bausteine.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

const tagText = (tag: string, lang = false) => new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: lang ? 'long' : 'short', day: '2-digit', month: '2-digit', ...(lang ? { year: 'numeric' } : {}) }).format(new Date(`${tag}T12:00:00Z`));

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
  const link = (tag: string, ansicht = d.ansicht) => `/kalender?tag=${tag}&ansicht=${ansicht}${d.namenZeigen ? '&namen=1' : ''}`;
  const name = (t: TerminKalender) => (d.namenZeigen ? `${t.vorname} ${t.nachname}` : `${t.vorname[0]}. ${t.nachname[0]}.`);
  const terminHtml = (t: TerminKalender) => `<a class="kal-termin${t.sektion ? ` sek-${t.sektion}` : t.rezept ? ' rezept' : ''}${t.status === 'erledigt' ? ' erledigt' : ''}" href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin">
        <b>${sektionMarke(t.sektion)}${zeitText(t.beginn)}–${zeitText(t.ende)}</b><span>${esc(name(t))} <span class="hint">${esc(t.patientennummer)}</span></span>
        <span class="rz-marken">${t.leistung ? `<span class="marke jetzt" data-hilfe="termine.leistung">${esc(t.leistung)}</span>` : ''}<span class="marke">${t.rezept ? 'Rezept' : t.art === 'erstgespraech' ? 'Erstgespräch' : 'Individual'}</span>${t.imKalender ? '' : '<span class="marke">nicht im Kalender</span>'}${t.status === 'vorgeschlagen' ? '<span class="marke">vorgeschlagen</span>' : ''}</span>
      </a>`;
  const spalten = tage.map((tag) => {
    const des = d.termine.filter((t) => datumBerlin(t.beginn) === tag);
    const bloecke = (d.bloecke ?? []).filter((b) => datumBerlin(b.beginn) === tag);
    const eintraege = [...des.map((t) => ({ beginn: t.beginn, html: terminHtml(t) })), ...bloecke.map((b) => ({ beginn: b.beginn, html: blockHtml(b) }))].sort((a, b) => a.beginn.localeCompare(b.beginn));
    const oeff = d.oeffnungszeiten?.filter((f) => f.tag === wochentag(tag));
    return `<section class="kal-tag${tag === d.heute ? ' heute' : ''}${oeff && !oeff.length ? ' zu' : ''}" data-hilfe="kalender.tag"><h2><a href="${link(tag, 'tag')}">${esc(tagText(tag, d.ansicht === 'tag'))}</a> <span class="pw-zahl">${des.length}</span>${d.freieTage?.[tag] ? ` <span class="chip preset12" data-hilfe="kalender.frei" tabindex="0">${esc(d.freieTage[tag])}</span>` : ''}</h2>
      ${oeff ? `<p class="kal-oeff" data-hilfe="kalender.oeffnung">${oeff.length ? oeff.map((f) => `${f.von}–${f.bis}`).join(', ') : 'geschlossen'}</p>` : ''}
      ${eintraege.length ? eintraege.map((e) => e.html).join('') : '<p class="pw-leer">frei</p>'}
    </section>`;
  }).join('');
  const schritt = d.ansicht === 'woche' ? 7 : 1;
  return seite({
    titel: 'Kalender', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<header class="kopf pw-titel"><h1>${symbol('kalender', { groesse: 26 })} Kalender <span class="hint">${d.ansicht === 'woche' ? `Woche ab ${esc(tagText(tage[0]!, true))}` : esc(tagText(d.tag, true))}</span></h1>
<div class="knopfreihe">
  <a class="knopf klein" href="${link(tagPlus(d.tag, -schritt))}" data-hilfe="kalender.zurueck">‹ zurück</a>
  <a class="knopf klein" href="${link(d.heute)}" data-hilfe="kalender.heute">Heute</a>
  <a class="knopf klein" href="${link(tagPlus(d.tag, schritt))}" data-hilfe="kalender.weiter">weiter ›</a>
  <a class="knopf klein${d.ansicht === 'tag' ? ' primaer' : ''}" href="${link(d.tag, 'tag')}" data-hilfe="kalender.ansicht-tag">Tag</a>
  <a class="knopf klein${d.ansicht === 'woche' ? ' primaer' : ''}" href="${link(d.tag, 'woche')}" data-hilfe="kalender.ansicht-woche">Woche</a>
  <a class="knopf klein" href="/kalender?tag=${d.tag}&ansicht=${d.ansicht}${d.namenZeigen ? '' : '&namen=1'}" data-hilfe="kalender.namen">${symbol(d.namenZeigen ? 'schloss' : 'auge', { groesse: 16 })} ${d.namenZeigen ? 'Nur Initialen' : 'Namen zeigen'}</a>
</div></header>
${sektionLegende()}
${d.fehler ? `<p class="warn">${esc(d.fehler)}</p>` : ''}
<p class="hint">Termine aus der Kartei. Was im Kalender des Postfachs innerhalb der Öffnungszeiten steht, erscheint als grauer Block (Link öffnet Outlook); Praxis-Termine mit Patientennummer übernimmt der Abgleich in die Kartei. Öffnungszeiten und Pausen: Konfiguration.${d.postfach === false ? ' Kein Postfach verbunden – Outlook-Termine fehlen.' : ''}</p>
<div class="kal ${d.ansicht}">${spalten}</div>`,
  });
}
