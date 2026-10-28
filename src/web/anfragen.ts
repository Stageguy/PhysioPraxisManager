/**
 * Terminanfragen (A15): Liste als Kacheln (neu zuerst), Anfrage mit Wortlaut, erkannten Zeitwünschen,
 * Patient, Vorschlägen (reserviert, Antwort als Entwurf) und Bestätigung. Von Hand lassen sich
 * Telefon- und WhatsApp-Anfragen eintragen.
 */
import type { AnfrageSeiteDaten, AnfragenFilter } from '../anfragen/dienst.ts';
import { ANLIEGEN_TEXT, QUELLE_TEXT, STATUS_TEXT, type Anfrage } from '../anfragen/anfragen.ts';
import { datumText, datumZeitText } from '../format.ts';
import { heuteBerlin } from '../zeit.ts';
import { aktionsFormular, chip, formular, meldungen, plusKachel, sektionMarke, type Rahmen } from './bausteine.ts';
import type { Terminart } from '../kartei/terminarten.ts';
import { terminartOptionen } from './patienten.ts';
import { esc, seite } from './layout.ts';
import { symbol, type Symbol } from './symbole.ts';

const QUELLE_SYMBOL: Record<string, Symbol> = { mail: 'email', website: 'website', buchung: 'buchung', whatsapp: 'whatsapp', telefon: 'telefon', hand: 'protokoll' };
const TAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const form = (aktion: string, inhalt: string, o: { id?: string; zurueck: string; klasse?: string }) => aktionsFormular('/anfragen/aktion', aktion, inhalt, o);

const statusChip = (a: Anfrage) => chip(STATUS_TEXT[a.status][0], STATUS_TEXT[a.status][1]);

function kachel(a: Anfrage): string {
  return `<a class="an-kachel ${a.status}" href="/anfragen/${a.id}" data-hilfe="anfragen.kachel">
    <header>${symbol(QUELLE_SYMBOL[a.quelle] ?? 'anfrage', { groesse: 18 })}<b>${esc(a.absenderName ?? a.absenderAdresse ?? a.absenderTelefon ?? 'ohne Absender')}</b>${statusChip(a)}</header>
    <span class="hint">${esc(QUELLE_TEXT[a.quelle])} · ${esc(ANLIEGEN_TEXT[a.anliegen])} · ${datumZeitText(a.eingegangenAm, { jahr: true })}</span>
    ${a.terminart ? `<span>${sektionMarke(a.terminart.sektion)}<b>${esc(a.terminart.code)}</b> ${esc(a.terminart.kurz)}</span>` : ''}
    ${a.betreff ? `<span class="an-betreff">${esc(a.betreff)}</span>` : ''}
    <span class="pat-fuss">${a.patient ? `<span class="marke jetzt">${esc(a.patient.patientennummer)} ${esc(a.patient.name)}</span>` : '<span class="marke warn-marke">Patient unbekannt</span>'}${a.vorschlaege.length ? `<span class="marke">${a.vorschlaege.length} Vorschläge</span>` : ''}${a.terminId ? '<span class="marke jetzt">Termin</span>' : ''}</span>
  </a>`;
}

export function anfragenSeite(d: { anfragen: Anfrage[]; filter: AnfragenFilter; stand: { neu: number; vorgeschlagen: number }; terminarten: Terminart[] }, o: Rahmen): string {
  const filter = (f: AnfragenFilter, text: string) => `<a class="knopf klein${d.filter === f ? ' primaer' : ''}" href="/anfragen?filter=${f}" data-hilfe="anfragen.filter">${text}</a>`;
  return seite({
    titel: 'Terminanfragen', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/">Cockpit</a> › Terminanfragen</p>
<h1>${symbol('anfrage', { groesse: 26 })} Terminanfragen <span class="hint">${d.stand.neu} neu · ${d.stand.vorgeschlagen} mit Vorschlag</span></h1>${meldungen(o)}
<div class="knopfreihe">${filter('offen', 'Offen')}${filter('bestaetigt', 'Termin steht')}${filter('erledigt', 'Erledigt')}${filter('alle', 'Alle')}</div>
<div class="an-raster">${plusKachel({ text: 'Anfrage von Hand', hilfe: 'anfragen.neu', href: '/anfragen/neu' })}${d.anfragen.map(kachel).join('')}</div>
${d.anfragen.length ? '' : '<p class="leer">Keine Anfragen in dieser Auswahl. Mails landen hier aus dem Ordner „Terminanfragen“ des Postfachs; Telefon und WhatsApp trägt man über „+“ ein.</p>'}`,
  });
}

/** Anfrage von Hand (Telefon, WhatsApp, persönlich) – Formularseite nach W115, öffnet aus der „+“-Kachel im Seitenfenster */
export function anfrageNeuSeite(d: { terminarten: Terminart[] }, o: Rahmen): string {
  return seite({
    titel: 'Anfrage von Hand', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      action: '/anfragen/aktion', pfad: [{ href: '/', text: 'Cockpit' }, { href: '/anfragen', text: 'Terminanfragen' }], titel: 'Anfrage von Hand', symbol: 'telefon', aktion: 'neu',
      zurueck: '/anfragen/neu', abbrechen: '/anfragen', hilfe: 'anfragen.neu.formular', knopf: 'Anfrage anlegen', knopfHilfe: 'anfragen.neu.anlegen', oben: meldungen(o),
      felder: `<div class="zwei"><label>Weg<select name="quelle" data-hilfe="anfragen.neu.quelle"><option value="telefon">Telefon</option><option value="whatsapp">WhatsApp</option><option value="hand">persönlich / sonstiges</option></select></label>
    <label>Anliegen<select name="anliegen">${Object.entries(ANLIEGEN_TEXT).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label></div>
    <div class="zwei"><label>Name<input name="name" maxlength="120" required></label><label>Telefon<input name="telefon" inputmode="tel"></label></div>
    <label>E-Mail<input name="email" type="email"></label>
    <label>Terminart<select name="terminart_id" data-hilfe="anfragen.neu.terminart"><option value="">– noch offen –</option>${terminartOptionen(d.terminarten)}</select></label>
    <label>Wunsch und Anliegen <span class="hint">(z. B. „dienstags vormittags, Rezept liegt vor“)</span><textarea name="text" rows="3" maxlength="2000"></textarea></label>`,
      hinweis: 'Ist Mailadresse oder Nummer in der Kartei bekannt, wird der Patient gleich zugeordnet.',
    }),
  });
}

export function anfrageSeite(d: AnfrageSeiteDaten, o: Rahmen): string {
  const a = d.anfrage;
  const zurueck = `/anfragen/${a.id}`;
  const offen = a.status === 'neu' || a.status === 'vorgeschlagen';
  const erkannt = [
    ...(a.erkannt.wochentage ?? []).map((t) => TAGE[t] ?? ''), ...(a.erkannt.tageszeiten ?? []),
    ...(a.erkannt.daten ?? []).map((x) => datumText(x)), ...(a.erkannt.uhrzeiten ?? []).map((x) => `${x} Uhr`),
  ].filter(Boolean);
  const [vorname, ...rest] = (a.absenderName ?? '').split(' ');
  const neuerPatient = `/patienten/neu?anfrage=${a.id}&vorname=${encodeURIComponent(rest.length ? vorname! : '')}&nachname=${encodeURIComponent(rest.length ? rest.join(' ') : (vorname ?? ''))}&email=${encodeURIComponent(a.absenderAdresse ?? '')}&mobil=${encodeURIComponent(a.absenderTelefon ?? '')}`;
  const patient = a.patient
    ? `<p><a class="knopf" href="/patienten/${a.patient.id}" data-hilfe="anfrage.patient">${symbol('patient', { groesse: 18 })} ${esc(a.patient.name)} <span class="hint">${esc(a.patient.patientennummer)}</span></a></p>`
    : `<p class="hint">Kein Patient zugeordnet – die Adresse bzw. Nummer ist in der Kartei unbekannt.</p>
      ${offen ? form('zuordnen', `<label>Bestehenden Patienten wählen<select name="patient_id" data-hilfe="anfrage.zuordnen" required><option value="">…</option>${d.patienten.map((p) => `<option value="${p.id}">${esc(`${p.nachname}, ${p.vorname}`)} (${esc(p.patientennummer)})</option>`).join('')}</select></label><button class="knopf klein">Zuordnen</button>`, { id: a.id, zurueck, klasse: 'formular zeile' }) : ''}
      ${offen ? `<p><a class="knopf klein" href="${neuerPatient}" data-hilfe="anfrage.neuer-patient">${symbol('patient', { groesse: 16 })} Neuen Patienten anlegen</a></p>` : ''}`;
  const vorschlaege = a.vorschlaege.length
    ? `${a.quelle === 'buchung' ? '<p class="hint" data-hilfe="anfrage.buchung" tabindex="0">Vom Patienten auf der Buchungsseite gewählt – im Praxiskalender reserviert, bis Sie bestätigen oder abschließen.</p>' : ''}<ol class="an-vorschlaege" data-hilfe="anfrage.vorschlag">${a.vorschlaege.map((v, i) => `<li><b>${datumZeitText(v.beginn, { jahr: true })}</b> <span class="hint">bis ${datumZeitText(v.ende).slice(-5)} Uhr${v.exchangeEventId ? ' · reserviert' : ''}</span>
        ${offen && a.patient ? form('bestaetigen', `<input type="hidden" name="wahl" value="${i}"><button class="knopf klein primaer" data-hilfe="anfrage.bestaetigen">Diesen Termin bestätigen</button>`, { id: a.id, zurueck }) : ''}</li>`).join('')}</ol>
      ${a.antwortWeblink ? `<p><a class="knopf klein" href="${esc(a.antwortWeblink)}" target="_blank" rel="noopener" data-hilfe="anfrage.antwort">${symbol('email', { groesse: 16 })} Antwort-Entwurf in Outlook öffnen</a></p>` : ''}`
    : '<p class="hint">Noch keine Vorschläge.</p>';
  const vorschlagen = offen ? form('vorschlagen', `<div class="zwei"><label>Dauer in Minuten<input name="dauer_min" inputmode="numeric" class="kurz" value="${a.dauerMin ?? a.terminart?.dauerMin ?? d.regeln.dauerMin}" data-hilfe="anfrage.dauer"></label>
      <label>Ab<input type="date" name="ab" value="${heuteBerlin()}" data-hilfe="anfrage.ab"></label></div>
      <div class="zwei"><label>Zeitraum in Tagen<input name="tage" inputmode="numeric" class="kurz" value="14"></label>
      <label class="haken"><input type="checkbox" name="ohne_wunsch" value="1"> Zeitwünsche nicht beachten</label></div>
      <div class="knopfreihe"><button class="knopf primaer" data-hilfe="anfrage.vorschlagen">${symbol('kalender', { groesse: 18 })} Drei Zeiten vorschlagen</button></div>
      <p class="hint">Öffnungszeiten: ${esc(d.regeln.oeffnungszeiten)} (ändern unter Konfiguration). ${d.postfach ? 'Die Zeiten werden im Praxiskalender reserviert, die Antwort liegt danach als Entwurf im Postfach.' : 'Ohne Postfach: nur berechnen, keine Reservierung, kein Entwurf.'}</p>`, { id: a.id, zurueck, klasse: 'formular' }) : '';
  const status = offen
    ? `<div class="knopfreihe" data-hilfe="anfrage.status">${form('erledigt', '<button class="knopf klein">Erledigt</button>', { id: a.id, zurueck })}${form('absagen', '<button class="knopf klein">Abgesagt</button>', { id: a.id, zurueck })}${form('verwerfen', '<button class="knopf klein warnend">Verwerfen (keine Anfrage)</button>', { id: a.id, zurueck })}</div>`
    : `<div class="knopfreihe" data-hilfe="anfrage.status">${a.terminId && a.patient ? `<a class="knopf klein" href="/patienten/${a.patient.id}#termine" data-hilfe="anfrage.termin">${symbol('kalender', { groesse: 16 })} Zum Termin</a>` : ''}${form('wieder_oeffnen', '<button class="knopf klein">Wieder öffnen</button>', { id: a.id, zurueck })}</div>`;
  return seite({
    titel: `Anfrage ${a.id}`, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/">Cockpit</a> › <a href="/anfragen">Terminanfragen</a> › Anfrage ${a.id}</p>
<h1>${symbol(QUELLE_SYMBOL[a.quelle] ?? 'anfrage', { groesse: 26 })} ${esc(a.absenderName ?? a.absenderAdresse ?? a.absenderTelefon ?? 'Anfrage')} ${statusChip(a)}</h1>${meldungen(o)}
<p class="hint">${esc(QUELLE_TEXT[a.quelle])} · ${esc(ANLIEGEN_TEXT[a.anliegen])} · eingegangen ${datumZeitText(a.eingegangenAm, { jahr: true })}${a.absenderAdresse ? ` · ${esc(a.absenderAdresse)}` : ''}${a.absenderTelefon ? ` · ${esc(a.absenderTelefon)}` : ''}</p>
<div class="an-spalten">
<section class="tafel" data-hilfe="anfrage.text"><h2>${symbol('protokoll')} Wortlaut${a.betreff ? ` <span class="hint">${esc(a.betreff)}</span>` : ''}</h2>
  ${a.text ? `<pre class="an-text">${esc(a.text)}</pre>` : '<p class="hint">Kein Text.</p>'}
  <p data-hilfe="anfrage.erkannt" tabindex="0">Erkannte Wünsche: ${erkannt.length ? erkannt.map((x) => `<span class="marke jetzt">${esc(x)}</span>`).join(' ') : '<span class="hint">keine</span>'}</p>
</section>
<section class="tafel"><h2>${symbol('patient')} Patient</h2>${patient}
  <h3>${a.terminart ? sektionMarke(a.terminart.sektion) : ''}Terminart</h3>
  ${offen ? form('terminart', `<select name="terminart_id" data-hilfe="anfrage.terminart" data-auto-senden><option value="">– noch offen –</option>${terminartOptionen(d.terminarten, a.terminart?.id)}</select><button class="knopf klein nur-ohne-js">setzen</button>`, { id: a.id, zurueck, klasse: 'formular zeile' }) : `<p>${a.terminart ? `${esc(a.terminart.code)} – ${esc(a.terminart.kurz)}` : '<span class="hint">keine</span>'}</p>`}
</section>
</div>
<section class="tafel" id="vorschlaege"><h2>${symbol('kalender')} Terminvorschläge</h2>${vorschlaege}${vorschlagen}</section>
<section class="tafel"><h2>${symbol('haken')} Abschluss</h2>${status}
  ${form('notiz', `<label>Notiz<input name="notiz" value="${esc(a.notiz ?? '')}" maxlength="500" data-hilfe="anfrage.notiz"></label><button class="knopf klein">Speichern</button>`, { id: a.id, zurueck, klasse: 'formular zeile' })}
</section>`,
  });
}
