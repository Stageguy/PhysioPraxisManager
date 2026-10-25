/**
 * Kalenderseite (W82): alle Termine der Kartei als Tag oder Woche. Erreichbar über das Kalender-Symbol
 * bei „Heute im Blick“. Namen nur mit „namen=1“ (sonst Initialen wie im Cockpit).
 */
import type { TerminKalender } from '../kartei/patienten.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

const ZONE = 'Europe/Berlin';
const zeit = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const tagBerlin = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(iso));
const tagText = (tag: string, lang = false) => new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: lang ? 'long' : 'short', day: '2-digit', month: '2-digit', ...(lang ? { year: 'numeric' } : {}) }).format(new Date(`${tag}T12:00:00Z`));

/** Tage der Woche (Mo–So), die `tag` enthält */
export function wocheUm(tag: string): string[] {
  const d = new Date(`${tag}T12:00:00Z`);
  const mo = new Date(d);
  mo.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mo); x.setUTCDate(mo.getUTCDate() + i); return x.toISOString().slice(0, 10); });
}
export const tagPlus = (tag: string, n: number) => { const d = new Date(`${tag}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function kalenderSeite(d: { tag: string; ansicht: 'tag' | 'woche'; termine: TerminKalender[]; namenZeigen: boolean; heute: string }, o: { wer: string; fassung: string; skriptInline?: string }): string {
  const tage = d.ansicht === 'woche' ? wocheUm(d.tag) : [d.tag];
  const link = (tag: string, ansicht = d.ansicht) => `/kalender?tag=${tag}&ansicht=${ansicht}${d.namenZeigen ? '&namen=1' : ''}`;
  const name = (t: TerminKalender) => (d.namenZeigen ? `${t.vorname} ${t.nachname}` : `${t.vorname[0]}. ${t.nachname[0]}.`);
  const spalten = tage.map((tag) => {
    const des = d.termine.filter((t) => tagBerlin(t.beginn) === tag);
    return `<section class="kal-tag${tag === d.heute ? ' heute' : ''}" data-hilfe="kalender.tag"><h2><a href="${link(tag, 'tag')}">${esc(tagText(tag, d.ansicht === 'tag'))}</a> <span class="pw-zahl">${des.length}</span></h2>
      ${des.length ? des.map((t) => `<a class="kal-termin${t.rezept ? ' rezept' : ''}${t.status === 'erledigt' ? ' erledigt' : ''}" href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin">
        <b>${zeit(t.beginn)}–${zeit(t.ende)}</b><span>${esc(name(t))} <span class="hint">${esc(t.patientennummer)}</span></span>
        <span class="rz-marken">${t.leistung ? `<span class="marke jetzt" data-hilfe="termine.leistung">${esc(t.leistung)}</span>` : ''}<span class="marke">${t.rezept ? 'Rezept' : t.art === 'erstgespraech' ? 'Erstgespräch' : 'Individual'}</span>${t.imKalender ? '' : '<span class="marke warn-marke">nicht im Kalender</span>'}</span></a>`).join('') : '<p class="pw-leer">frei</p>'}
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
<p class="hint">Termine aus der Kartei. Privates und von Hand im Postfach Eingetragenes steht hier nicht – es zählt aber als belegt, sobald die Kollisionsprüfung kommt (E27).</p>
<div class="kal ${d.ansicht}">${spalten}</div>`,
  });
}
