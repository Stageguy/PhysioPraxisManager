/**
 * Kalenderseite (W82, W112, W116): Termine der Kartei als Tag oder Woche, dazu Outlook-Termine im Öffnungsfenster
 * (Patient mit Nummer = Kachel, sonst grauer Block mit Link), die Öffnungszeiten je Tag und – in der Tagesansicht –
 * die freien Zeiten (grün) mit Stift und Absage je Termin. Die Monatsansicht steht in ./terminplan.ts.
 * Namen nur mit „namen=1“ (sonst Initialen wie im Cockpit).
 */
import type { TerminKalender } from '../kartei/patienten.ts';
import type { KalenderBlock } from '../kartei/outlook-termine.ts';
import { DAUERN, type Luecke } from '../kartei/terminplan.ts';
import type { MittagspauseTag } from '../kartei/mittagspause.ts';
import { wochentag, type Oeffnungszeit } from '../anfragen/slots.ts';
import { datumText, zeitText } from '../format.ts';
import { datumBerlin, tagPlus, wocheUm, zeitBerlin, ZONE } from '../zeit.ts';
import { karteiFormular as form, sektionLegende, sektionMarke } from './bausteine.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';
import { routeHtml } from './cockpit.ts';
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
  /** Standarddauer (Konfiguration) – Vorbelegung beim Klick in eine Lücke, höchstens so lang wie die Lücke */
  dauerMin?: number;
  /** Termin für diesen Patienten anlegen: freie Zeiten führen direkt ins Formular */
  patient?: Kontext | null;
  /** Ziel der Rückfahrt nach einem Hausbesuch (W113c) */
  praxisAdresse?: string;
  /** Mittagspause je Tag (W126): blauer Block, antippen ändert die Dauer für den Tag */
  pausen?: MittagspauseTag[];
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
  const marken = (t: TerminKalender) => `<span class="rz-marken">${t.leistung ? `<span class="marke jetzt" data-hilfe="termine.leistung">${esc(t.leistung)}</span>` : ''}<span class="marke">${t.rezept ? 'Rezept' : t.art === 'erstgespraech' ? 'Erstgespräch' : 'Individual'}</span>${t.behandlungsort === 'hausbesuch' ? `<span class="marke hausbesuch" data-hilfe="kalender.hausbesuch">${symbol('haus', { groesse: 12 })} Hausbesuch${t.ort ? ` · ${esc(t.ort)}` : ''}</span>` : ''}${t.imKalender ? '' : '<span class="marke">nicht im Kalender</span>'}${t.status === 'vorgeschlagen' ? '<span class="marke">vorgeschlagen</span>' : ''}</span>`;
  // Fahrt vor und nach einem Hausbesuch (W113) – geschätzt aus der Konfiguration, am Termin änderbar; mit Wegbeschreibung zum Ziel
  const fahrtHtml = (t: TerminKalender, wann: 'vor' | 'nach', ziel: string | null) => {
    const min = wann === 'vor' ? t.fahrtVorMin : t.fahrtNachMin;
    const beginn = wann === 'vor' ? new Date(Date.parse(t.beginn) - min * 60_000).toISOString() : t.ende;
    const ende = wann === 'vor' ? t.beginn : new Date(Date.parse(t.ende) + min * 60_000).toISOString();
    return { beginn, html: `<div class="kal-termin fahrt" data-hilfe="kalender.fahrt"><b>${symbol('auto', { groesse: 14 })} ${zeitText(beginn)}–${zeitText(ende)}</b><span>Fahrt ${wann === 'vor' ? 'zum Hausbesuch' : 'zurück'} · ${min} Min.${ziel ? ` · ${routeHtml(ziel, 'kalender.route', { klein: true })}` : ''}</span></div>` };
  };
  // Ziel der Rückfahrt: der nächste Hausbesuch des Tages, sonst die Praxis
  const fahrten = (liste: TerminKalender[]) => liste.flatMap((t, i) => {
    const naechster = liste[i + 1];
    const zurueck = naechster?.behandlungsort === 'hausbesuch' && naechster.adresse ? naechster.adresse : d.praxisAdresse ?? null;
    return [...(t.fahrtVorMin > 0 ? [fahrtHtml(t, 'vor', t.adresse)] : []), ...(t.fahrtNachMin > 0 ? [fahrtHtml(t, 'nach', zurueck)] : [])];
  });
  const klasse = (t: TerminKalender) => `kal-termin${t.sektion ? ` sek-${t.sektion}` : t.rezept ? ' rezept' : ''}${t.status === 'erledigt' ? ' erledigt' : ''}`;
  // Tagesansicht: Kachel mit Stift und Absage (W116c); Wochenansicht: die Kachel ist der Link zum Patienten
  const terminHtml = (t: TerminKalender) => d.ansicht === 'tag'
    ? `<div class="${klasse(t)}" data-hilfe="kalender.termin">
        <b>${sektionMarke(t.sektion)}${zeitText(t.beginn)}–${zeitText(t.ende)}</b><span><a href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin-patient">${esc(name(t))}</a> <span class="hint">${esc(t.patientennummer)}</span></span>
        ${marken(t)}${t.status === 'bestaetigt' || t.status === 'vorgeschlagen' ? `<span class="kal-aktionen"><a href="/patienten/${t.patientId}/termine/${t.id}/bearbeiten" data-fenster="Termin bearbeiten" data-hilfe="kalender.termin-stift">${symbol('stift', { groesse: 14 })} bearbeiten</a><a href="/patienten/${t.patientId}/termine/${t.id}/absagen" data-fenster="Termin absagen" data-hilfe="kalender.termin-absagen">${symbol('kreuz', { groesse: 14 })} absagen</a>${t.behandlungsort === 'hausbesuch' && t.adresse ? `<span class="hint">${routeHtml(t.adresse, 'kalender.route', { klein: true })}</span>` : ''}</span>` : ''}
      </div>`
    : `<a class="${klasse(t)}" href="/patienten/${t.patientId}#termine" data-hilfe="kalender.termin">
        <b>${sektionMarke(t.sektion)}${zeitText(t.beginn)}–${zeitText(t.ende)}</b><span>${esc(name(t))} <span class="hint">${esc(t.patientennummer)}</span></span>
        ${marken(t)}
      </a>`;
  const lueckeHtml = (l: Luecke) => `<a class="kal-termin luecke" href="${terminZiel(d.patient ?? null, datumBerlin(l.beginn), zeitBerlin(l.beginn), Math.min(l.minuten, d.dauerMin ?? 30))}"${d.patient ? ' data-fenster="Neuer Termin"' : ''} data-hilfe="kalender.luecke"><b>${zeitText(l.beginn)}–${zeitText(l.ende)}</b><span>frei · ${l.minuten} Min.${d.patient ? ` – Termin für ${esc(d.patient.name)}` : ''}</span></a>`;
  // Mittagspause (W126): blauer Block an der Stelle im Tag; antippen öffnet das Mini-Popup mit der Dauer für diesen Tag
  const pauseHtml = (p: MittagspauseTag, tag: string) => `<details class="plus-kachel pause-feld"><summary class="kal-termin pause" data-hilfe="kalender.mittagspause">
        <b>${p.pause ? `${zeitText(p.pause.beginn)}–${zeitText(p.pause.ende)}` : 'Mittagspause'}</b><span>${p.pause ? `Mittagspause · ${p.pause.minuten} Min.` : p.minuten ? `keine Mittagspause möglich (${p.minuten} Min. eingestellt, kein Platz)` : 'heute keine Mittagspause'}${p.eigen ? ' <span class="hint">· für diesen Tag gesetzt</span>' : ''} <span class="hint">· antippen zum Ändern</span></span>
      </summary>
      <div class="plus-popup" role="dialog" aria-label="Mittagspause"><header><b>Mittagspause am ${datumText(tag)}</b><button type="button" class="knopf klein plus-schliessen" data-hilfe="kachel.popup-schliessen">Fertig</button></header>
      ${form('mittagspause_tag', `<input type="hidden" name="datum" value="${tag}">
        <label>Dauer in Minuten <span class="hint">(0 = keine)</span><input type="number" name="minuten" value="${p.minuten}" min="0" max="240" step="5" inputmode="numeric" class="kurz" required data-hilfe="kalender.mittagspause-minuten"></label>
        <div class="knopfreihe"><button class="knopf primaer" data-hilfe="kalender.mittagspause-speichern">Für diesen Tag speichern</button>${p.eigen ? `<button class="knopf" name="standard" value="1" data-hilfe="kalender.mittagspause-standard">Zurück auf Standard</button>` : ''}</div>`, { zurueck: link(tag), klasse: 'formular' })}
      </div></details>`;
  const spalten = tage.map((tag) => {
    const des = d.termine.filter((t) => datumBerlin(t.beginn) === tag);
    const bloecke = (d.bloecke ?? []).filter((b) => datumBerlin(b.beginn) === tag);
    // Lücken, in die kein kürzester Termin passt (unter 20 Minuten), sind keine Angebote und bleiben weg
    const luecken = d.ansicht === 'tag' ? (d.luecken ?? []).filter((l) => datumBerlin(l.beginn) === tag && l.minuten >= DAUERN[0]) : [];
    const eintraege = [
      ...des.map((t) => ({ beginn: t.beginn, html: terminHtml(t) })),
      ...fahrten(des.filter((t) => t.status === 'bestaetigt' || t.status === 'vorgeschlagen')),
      ...bloecke.map((b) => ({ beginn: b.beginn, html: blockHtml(b) })),
      ...luecken.map((l) => ({ beginn: l.beginn, html: lueckeHtml(l) })),
    ].sort((a, b) => a.beginn.localeCompare(b.beginn));
    const oeff = d.oeffnungszeiten?.filter((f) => f.tag === wochentag(tag));
    // Die Pause an ihrer Stelle im Ablauf; ohne Platz oder mit 0 Minuten als Zeile oben, damit sie sich setzen lässt
    const pt = (d.pausen ?? []).find((x) => x.datum === tag);
    if (pt && (oeff === undefined || oeff.length)) {
      if (pt.pause) eintraege.splice(eintraege.findIndex((e) => e.beginn > pt.pause!.beginn) === -1 ? eintraege.length : eintraege.findIndex((e) => e.beginn > pt.pause!.beginn), 0, { beginn: pt.pause.beginn, html: pauseHtml(pt, tag) });
      else eintraege.unshift({ beginn: '', html: pauseHtml(pt, tag) });
    }
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
