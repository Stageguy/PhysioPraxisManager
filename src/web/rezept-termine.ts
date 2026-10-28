/**
 * Seite „Termine zum Rezept“ (W110): Vorschläge für alle noch offenen Behandlungen eines Rezepts – im Muster
 * (gleiche Wochentage und Uhrzeiten), Dauer aus der Regelbehandlungszeit, Anzahl je Woche aus der Frequenz.
 * Lilli nimmt Haken weg, was nicht passt, und legt den Rest mit einem Klick an.
 */
import type { RezeptTermineDaten } from '../kartei/rezept-termine.ts';
import { WOCHENTAG_KURZ } from '../kartei/freie-tage.ts';
import { wochentag, type Slot } from '../anfragen/slots.ts';
import { datumText, datumZeitText } from '../format.ts';
import { datumBerlin, tagPlus, zeitBerlin } from '../zeit.ts';
import { esc, seite } from './layout.ts';
import { karteiFormular as form, meldungen, type Rahmen } from './bausteine.ts';
import { kopfzeile } from './patienten.ts';
import { symbol } from './symbole.ts';

const TAGESZEITEN: [string, string][] = [['', 'egal'], ['vormittag', 'vormittags (bis 12 Uhr)'], ['nachmittag', 'nachmittags (12–17 Uhr)'], ['abend', 'abends (ab 17 Uhr)']];

const auswahl = (name: string, werte: [string, string][], aktuell: string, hilfe: string) =>
  `<select name="${name}" data-auto-senden data-hilfe="${hilfe}">${werte.map(([w, t]) => `<option value="${w}"${w === aktuell ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

export function rezeptTermineSeite(d: RezeptTermineDaten, o: Rahmen): string {
  const p = d.patient;
  const v = d.verordnung;
  const pfad = `/patienten/${p.id}/rezepte/${v.id}/termine`;
  const wochen = new Map<string, Slot[]>();
  for (const s of d.vorschlaege) {
    const tag = datumBerlin(s.beginn);
    const montag = tagPlus(tag, 1 - wochentag(tag));
    wochen.set(montag, [...(wochen.get(montag) ?? []), s]);
  }
  const zeile = (s: Slot) => {
    const tag = datumBerlin(s.beginn);
    return `<li><label class="haken" data-hilfe="rezept-termine.vorschlag"><input type="checkbox" name="termin" value="${tag}T${zeitBerlin(s.beginn)}" checked> ${WOCHENTAG_KURZ[wochentag(tag) - 1]} ${datumText(tag)} · ${zeitBerlin(s.beginn)}–${zeitBerlin(s.ende)}</label></li>`;
  };
  const liste = d.offen === 0
    ? '<p class="leer">Alle Behandlungen dieses Rezepts sind erledigt oder geplant.</p>'
    : !d.vorschlaege.length
      ? '<p class="leer">Keine freien Zeiten gefunden – Beginn, Öffnungszeiten und freie Tage prüfen.</p>'
      : form('rezept_termine_anlegen', `<input type="hidden" name="verordnung_id" value="${v.id}"><input type="hidden" name="dauer_min" value="${d.dauerMin}">
  ${d.vorschlaege.length < d.offen ? `<p class="warn">Nur ${d.vorschlaege.length} von ${d.offen} Terminen gefunden – die übrigen später planen.</p>` : ''}
  <ul class="tv-wochen">${[...wochen].map(([montag, slots]) => `<li><b>Woche ab ${datumText(montag)}</b><ul>${slots.map(zeile).join('')}</ul></li>`).join('')}</ul>
  <p class="hint">Haken weg = Vorschlag auslassen. Die Termine kommen in die Kartei und in den Kalender des Postfachs – dort nur mit Initialen und Patientennummer.</p>
  <button class="knopf primaer" data-hilfe="rezept-termine.anlegen">${symbol('kalender', { groesse: 18 })} Angehakte Termine anlegen</button>`, { id: p.id, zurueck: pfad, klasse: 'formular' });
  return seite({
    titel: 'Termine zum Rezept', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile(p, 'Termine zum Rezept', 'kalender')}${meldungen(o)}
<div class="tafel">
  <p class="tv-kopf"><span>${symbol('rezept', { groesse: 18 })} <b>${esc(v.massnahme)}</b>${v.leistungNummer ? ` · Nr. ${esc(v.leistungNummer)}` : ''} · vom ${datumText(v.ausgestelltAm)}</span>
    <span>${v.anzahlVerordnet} verordnet · ${v.abgehakt} erledigt · ${d.geplant.length} geplant · <b>${d.offen} offen</b></span>
    <span>Frequenz: ${v.frequenz ? esc(v.frequenz) : '–'}${d.frequenzErkannt ? '' : ' <span class="warn">(nicht erkannt – 2× pro Woche angenommen)</span>'}</span>
    <span>Dauer: <b>${d.dauerMin} Min.</b> – ${esc(d.dauerHerkunft)}</span></p>
  ${d.geplant.length ? `<p class="hint" data-hilfe="rezept-termine.geplant">Schon geplant: ${d.geplant.map((x) => datumZeitText(x.beginn, { wochentag: true })).join(' · ')}</p>` : ''}
</div>
<form method="get" action="${pfad}" class="tafel formular zeile" data-hilfe="rezept-termine.einstellungen">
  <label>Beginn ab<input type="date" name="ab" value="${d.ab}" data-auto-senden data-hilfe="rezept-termine.ab"></label>
  <label>Je Woche${auswahl('pro_woche', [1, 2, 3, 4, 5].map((n) => [String(n), `${n}× pro Woche`]), String(d.proWoche), 'rezept-termine.pro-woche')}</label>
  <label>Tageszeit${auswahl('tageszeit', TAGESZEITEN, d.tageszeit ?? '', 'rezept-termine.tageszeit')}</label>
  <label>Dauer (Minuten)<input type="number" name="dauer_min" value="${d.dauerMin}" min="5" max="240" step="5" class="kurz" data-hilfe="rezept-termine.dauer"></label>
  <button class="knopf klein" data-hilfe="rezept-termine.neu-rechnen">Vorschläge neu rechnen</button>
</form>
${liste}`,
  });
}
