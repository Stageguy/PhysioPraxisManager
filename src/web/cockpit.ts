/**
 * Praxis-Cockpit (/) und Rechnungs-Dashboard (/finanzen/rechnungen).
 *
 * Aufbau (Prompt 10, angepasst): links die beiden Bereiche Finanzen und Patienten mit Kacheln für
 * die Screens, rechts die Übersicht (Rechnungseingang, Terminanfragen, Termine heute), darunter
 * das Änderungsprotokoll der letzten sieben Tage. Was es noch nicht gibt, steht als „kommt später“
 * da – mit Grund, ohne erfundene Zahlen.
 */
import type { CockpitDaten, Quelle, RechnungZeile, Rechnungsstand, Termin } from '../cockpit/daten.ts';
import { esc, seite } from './layout.ts';
import { datumText, datumZeitText, euroText } from '../format.ts';
import { STATUS_TEXT as ANFRAGE_STATUS } from '../anfragen/anfragen.ts';
import { chip, sektionMarke } from './bausteine.ts';
import { symbol, type Symbol } from './symbole.ts';

const QUELLE_SYMBOL: Record<string, Symbol> = { mail: 'email', website: 'website', buchung: 'buchung', whatsapp: 'whatsapp', telefon: 'telefon', hand: 'protokoll' };

// ── Kacheln ─────────────────────────────────────────────────────────────────
export interface Kachel {
  key: string;
  symbol: Symbol;
  titel: string;
  text: string;
  href?: string;
  spaeter?: string;
}

export const FINANZEN: Kachel[] = [
  { key: 'finanzen.rechnungen', symbol: 'rechnung', titel: 'Rechnungs-Dashboard', text: 'Eingegangene Rechnungen, Unklares und Zahlungsstand auf einen Blick.', href: '/finanzen/rechnungen' },
  { key: 'finanzen.freigabe', symbol: 'freigabe', titel: 'Freigabe', text: 'Neue Rechnungen ansehen, freigeben, ablehnen oder zurückstellen.', href: '/finanzen/rechnungen#t-neu' },
  { key: 'finanzen.zahlungen', symbol: 'euro', titel: 'Zahlungen', text: 'Offene Zahlungen an Lieferanten und von Patienten.', spaeter: 'kommt mit Lexware-Tarif XL' },
];

export const PATIENTEN: Kachel[] = [
  { key: 'patienten.kartei', symbol: 'patient', titel: 'Patienten', text: 'Kartei mit Kacheln: anrufen, WhatsApp, Mail, letzte Behandlung, nächster Termin, Akte.', href: '/patienten' },
  { key: 'patienten.anfragen', symbol: 'anfrage', titel: 'Terminanfragen', text: 'Anfragen aus Mail, Website, WhatsApp und Telefon – Patient zuordnen, drei Zeiten vorschlagen, Antwort als Entwurf, Termin bestätigen.', href: '/anfragen' },
  { key: 'patienten.pinnwand', symbol: 'pinnwand', titel: 'Patienten-Pinnwand', text: 'Wer steht in welcher Phase – von der Anfrage bis zur Nachsorge. Karten ziehen, Details, „+“.', href: '/pinnwand' },
  { key: 'patienten.rezepte', symbol: 'rezept', titel: 'Rezepte', text: 'Alle Rezepte und Behandlungsserien als Kacheln, Stempelkarte je Rezept, Wellness-Katalog.', href: '/rezepte' },
  { key: 'patienten.schnellaktionen', symbol: 'blitz', titel: 'Schnellaktionen', text: 'Mit einem Tipp eine fertige Mail als Entwurf.', spaeter: 'kommt mit Prompt 13' },
];

// ── Kanäle der Terminanfragen ───────────────────────────────────────────────
export const KANAELE: { key: string; symbol: Symbol; name: string; stand: string }[] = [
  { key: 'kanal.email', symbol: 'email', name: 'E-Mail', stand: 'Ordner „Terminanfragen“ im Postfach – alle paar Minuten gelesen' },
  { key: 'kanal.website', symbol: 'website', name: 'Website-Formular', stand: 'Formular-Mail mit festen Feldern im selben Ordner (W92)' },
  { key: 'kanal.whatsapp', symbol: 'whatsapp', name: 'WhatsApp', stand: 'von Hand eintragen; mit Cloud API kommen Antworten in den Kontaktverlauf (E8)' },
  { key: 'kanal.telefon', symbol: 'telefon', name: 'Telefon', stand: 'von Hand eintragen – unter Terminanfragen' },
  { key: 'kanal.buchung', symbol: 'buchung', name: 'Online-Buchung', stand: 'eigene Buchungsseite (W96): Patient wählt Terminart, Tag und Uhrzeit – kommt als Anfrage mit reserviertem Wunschtermin' },
];

// ── Status und Protokoll in Worten ──────────────────────────────────────────
const STATUS: Record<string, { text: string; farbe: string }> = {
  eingegangen: { text: 'eingegangen', farbe: 'preset3' },
  wartet_freigabe: { text: 'eingegangen', farbe: 'preset3' },
  klassifiziert: { text: 'unklar', farbe: 'preset1' },
  freigegeben: { text: 'freigegeben', farbe: 'preset4' },
  an_lexware: { text: 'in Lexware', farbe: 'preset7' },
  zahlung_angestossen: { text: 'Zahlung angestoßen', farbe: 'preset5' },
  bezahlt: { text: 'bezahlt', farbe: 'preset19' },
  abgelehnt: { text: 'abgelehnt', farbe: 'preset0' },
  fehler: { text: 'Fehler', farbe: 'preset0' },
};
const statusChip = (z: RechnungZeile) => {
  const s = z.klasse === 'unklar' ? STATUS.klassifiziert! : (STATUS[z.status] ?? { text: z.status, farbe: '' });
  return `<span class="chip ${s.farbe}">${esc(s.text)}</span>`;
};

export function protokollText(aktion: string, d: Record<string, unknown>): { symbol: Symbol; text: string } {
  const lieferant = typeof d.lieferant === 'string' ? ` – ${d.lieferant}` : '';
  const quelle = d.quelle === 'manuell' ? ' (von Hand in Outlook)' : d.quelle === 'altbestand' ? ' (Altbestand)' : d.quelle === 'lexware' ? ' (laut Lexware)' : '';
  switch (aktion) {
    case 'rechnung_abgelegt': return { symbol: 'rechnung', text: `Rechnung eingegangen und abgelegt${lieferant}` };
    case 'rechnung_duplikat': return { symbol: 'rechnung', text: 'Rechnung doppelt erhalten – nicht erneut abgelegt' };
    case 'anhang_unklar': return { symbol: 'warnung', text: 'Unklarer Anhang – bitte anschauen' };
    case 'mail_patient_markiert': return { symbol: 'patient', text: 'Patientenpost erkannt und markiert – nichts abgelegt' };
    case 'mail_fehler': return { symbol: 'kreuz', text: 'Fehler bei einer Mail – der nächste Lauf versucht es erneut' };
    case 'rechnung_bezahlt': return { symbol: 'archiv', text: `Rechnung bezahlt und archiviert${quelle}` };
    case 'zahlung_angestossen': return { symbol: 'euro', text: 'Zahlung angestoßen' };
    default: return { symbol: 'protokoll', text: aktion };
  }
}


function leer<T>(q: Quelle<T>, sonst: (d: T) => string): string {
  if (q.stand === 'ok') return sonst(q.daten);
  return `<p class="leer">${symbol(q.stand === 'fehler' ? 'warnung' : 'schloss', { groesse: 18 })} ${esc(q.hinweis)}</p>`;
}

function kachelHtml(k: Kachel): string {
  const innen = `<span class="kachel-sym">${symbol(k.symbol, { groesse: 28 })}</span>
    <span class="kachel-text"><b>${esc(k.titel)}</b><span>${esc(k.text)}</span>
    ${k.spaeter ? `<span class="marke">${esc(k.spaeter)}</span>` : '<span class="marke jetzt">bereit</span>'}</span>`;
  return k.href
    ? `<a class="kachel" href="${k.href}" data-hilfe="${k.key}">${innen}</a>`
    : `<div class="kachel aus" aria-disabled="true" tabindex="0" data-hilfe="${k.key}">${innen}</div>`;
}

/** Statusbalken des Rechnungswegs – Breiten nach Anzahl, nur wenn es etwas gibt */
function balken(z: Rechnungsstand['zaehler']): string {
  const teile = [
    ['eingegangen', z.eingegangen, 'preset3'], ['unklar', z.unklar, 'preset1'],
    ['Zahlung angestoßen', z.angestossen, 'preset5'], ['bezahlt', z.bezahlt, 'preset19'],
  ] as const;
  const summe = teile.reduce((s, [, n]) => s + n, 0);
  if (!summe) return '<div class="balken leer-balken" role="img" aria-label="noch keine Rechnungen"></div>';
  return `<div class="balken" role="img" aria-label="${teile.map(([t, n]) => `${n} ${t}`).join(', ')}">${teile
    .filter(([, n]) => n)
    .map(([t, n, f]) => `<span class="${f}" style="flex:${n}" title="${n} ${t}"></span>`)
    .join('')}</div>`;
}

const ZAEHLER = [
  ['eingegangen', 'rechnungen.zaehler.eingegangen', 'eingegangen', 'preset3'],
  ['unklar', 'rechnungen.zaehler.unklar', 'unklar', 'preset1'],
  ['angestossen', 'rechnungen.zaehler.angestossen', 'angestoßen', 'preset5'],
  ['bezahlt', 'rechnungen.zaehler.bezahlt', 'bezahlt', 'preset19'],
] as const;

function zaehlerHtml(q: Quelle<Rechnungsstand>): string {
  const z = q.stand === 'ok' ? q.daten.zaehler : undefined;
  return `<div class="zaehler">${ZAEHLER.map(([feld, key, text, farbe]) =>
    `<div class="zahl" data-hilfe="${key}" tabindex="0"><span class="punkt ${farbe}"></span><b>${z ? z[feld] : '–'}</b><span>${text}</span></div>`).join('')}</div>`;
}

/** Tagesleiste: Termine als Blöcke zwischen 7 und 20 Uhr (oder weiter, wenn nötig) */
function tagesleiste(termine: Termin[], jetzt: string | undefined): string {
  const minuten = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const imTag = termine.filter((t) => !t.ganztags);
  const von = Math.min(7 * 60, ...imTag.map((t) => Math.floor(minuten(t.beginn) / 60) * 60));
  const bis = Math.max(20 * 60, ...imTag.map((t) => Math.ceil(minuten(t.ende === '00:00' ? '24:00' : t.ende) / 60) * 60));
  const x = (m: number) => ((m - von) / (bis - von)) * 700 + 10;
  const stunden = [];
  for (let h = von / 60; h <= bis / 60; h++) {
    stunden.push(`<line x1="${x(h * 60)}" y1="8" x2="${x(h * 60)}" y2="44" class="raster"/>${h % 2 === 0 ? `<text x="${x(h * 60)}" y="58" class="std">${h}</text>` : ''}`);
  }
  const bloecke = imTag.map((t) => {
    const a = x(minuten(t.beginn));
    const b = x(minuten(t.ende === '00:00' ? '24:00' : t.ende));
    return `<rect x="${a}" y="12" width="${Math.max(3, b - a)}" height="28" rx="4" class="block${t.frei ? ' frei' : ''}"><title>${esc(`${t.beginn}–${t.ende} ${t.titel}`)}</title></rect>`;
  });
  const linie = jetzt && minuten(jetzt) >= von && minuten(jetzt) <= bis ? `<line x1="${x(minuten(jetzt))}" y1="4" x2="${x(minuten(jetzt))}" y2="48" class="jetzt"/>` : '';
  return `<svg class="tagesleiste" viewBox="0 0 720 62" role="img" aria-label="${imTag.length} Termine heute">${stunden.join('')}${bloecke.join('')}${linie}</svg>`;
}

// ── Cockpit ─────────────────────────────────────────────────────────────────
const HEUTE_FORMAT = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function cockpitSeite(d: CockpitDaten, o: { wer: string; fassung: string; jetzt?: string; skriptInline?: string }): string {
  const heute = HEUTE_FORMAT.format(new Date(`${d.heute}T12:00:00Z`));

  const rechnungen = `<section class="tafel" data-hilfe="uebersicht.rechnungen" aria-labelledby="t-re">
    <h2 id="t-re">${symbol('rechnung')} Neue Rechnungseingänge</h2>
    ${zaehlerHtml(d.rechnungen)}
    ${leer(d.rechnungen, (r) => `${balken(r.zaehler)}
      <p class="hint">Offen (eingegangen, noch nicht bezahlt): <b>${euroText(r.offenerBetrag)}</b></p>
      ${r.neueste.length ? `<ul class="zeilen">${r.neueste.map((z) => `<li><span>${datumText(z.eingang)}</span><b>${esc(z.lieferant ?? 'unbekannt')}</b>
        <span class="rechts">${z.betrag === null ? '' : euroText(z.betrag)} ${statusChip(z)}</span></li>`).join('')}</ul>`
        : '<p class="leer">Noch keine Rechnungen erfasst.</p>'}`)}
    <a class="mehr" href="/finanzen/rechnungen">Zum Rechnungs-Dashboard →</a>
  </section>`;

  const anfragen = `<section class="tafel" data-hilfe="uebersicht.anfragen" aria-labelledby="t-an">
    <h2 id="t-an">${symbol('anfrage')} Terminanfragen</h2>
    ${leer(d.anfragen, (s) => `<div class="zaehler"><div class="zahl"><b>${s.neu}</b><span>neu</span></div><div class="zahl"><b>${s.vorgeschlagen}</b><span>Vorschlag im Entwurf</span></div></div>
      ${s.neueste.length ? `<ul class="zeilen">${s.neueste.map((a) => `<li><span>${datumText(a.eingegangenAm)}</span><b><a href="/anfragen/${a.id}" data-hilfe="uebersicht.anfrage">${esc(a.absenderName ?? a.absenderAdresse ?? a.absenderTelefon ?? 'Anfrage')}</a></b>
        <span class="rechts">${symbol(QUELLE_SYMBOL[a.quelle] ?? 'anfrage', { groesse: 16, titel: a.quelle })} ${chip(ANFRAGE_STATUS[a.status][0], ANFRAGE_STATUS[a.status][1])}</span></li>`).join('')}</ul>` : '<p class="leer">Keine offenen Anfragen.</p>'}`)}
    <details class="kanaele-mehr"><summary class="hint" data-hilfe="uebersicht.kanaele">Wege, auf denen Anfragen hereinkommen</summary>
    <ul class="kanaele">${KANAELE.map((k) => `<li data-hilfe="${k.key}" tabindex="0"><span class="kanal-sym">${symbol(k.symbol, { titel: k.name })}</span>
      <span><b>${esc(k.name)}</b><span class="hint">${esc(k.stand)}</span></span></li>`).join('')}</ul></details>
    <a class="mehr" href="/anfragen">Alle Anfragen →</a>
  </section>`;

  const termine = `<section class="tafel" data-hilfe="uebersicht.termine" aria-labelledby="t-te">
    <h2 id="t-te">${symbol('kalender')} Termine heute</h2>
    ${d.freie?.length ? `<p class="freie-zeile" data-hilfe="termine.frei">Nächste freie Zeiten:${d.freie.map((f) => `<a href="/kalender?ansicht=tag&tag=${f.tag}">${esc(f.text)}</a>`).join(' · ')}</p>` : ''}
    ${leer(d.termine, (t) => `${tagesleiste(t, o.jetzt)}
      ${t.length ? `<ul class="zeilen">${t.map((x) => `<li><span class="zeit">${x.ganztags ? 'ganztags' : `${x.beginn}–${x.ende}`}</span><b>${sektionMarke(x.sektion)}${x.link ? `<a href="${esc(x.link)}" data-hilfe="termine.patient">${esc(x.titel)}</a>` : esc(x.titel)}</b>${x.leistung ? `<span class="marke${x.rezept ? ' jetzt' : ''}" data-hilfe="termine.leistung">${esc(x.leistung)}</span>` : ''}${x.frei ? '<span class="rechts hint">frei</span>' : ''}</li>`).join('')}</ul>`
        : '<p class="leer">Heute stehen keine Termine im Kalender.</p>'}`)}
    <a class="mehr" data-hilfe="termine.namen" href="${d.namenZeigen ? '/' : '/?namen=1'}">${symbol(d.namenZeigen ? 'schloss' : 'auge', { groesse: 16 })} ${d.namenZeigen ? 'Nur Initialen zeigen' : 'Namen zeigen'}</a>
  </section>`;

  const log = `<section class="tafel breit" data-hilfe="uebersicht.protokoll" aria-labelledby="t-lo">
    <h2 id="t-lo">${symbol('protokoll')} Was sich geändert hat – letzte 7 Tage</h2>
    ${leer(d.protokoll, (l) => l.length
      ? `<ol class="protokoll">${l.map((e) => { const p = protokollText(e.aktion, e.details); return `<li><span class="log-sym">${symbol(p.symbol, { groesse: 18 })}</span><time datetime="${esc(e.zeit)}">${datumZeitText(e.zeit)}</time><span>${esc(p.text)}</span></li>`; }).join('')}</ol>`
      : '<p class="leer">In den letzten sieben Tagen hat sich nichts geändert.</p>')}
  </section>`;

  return seite({
    titel: 'Praxis-Cockpit', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<header class="kopf"><h1>Praxis-Cockpit</h1><p>${esc(heute)}</p></header>
<div class="cockpit">
  <div class="bereiche">
    <section class="bereich" aria-labelledby="b-fi"><h2 id="b-fi" data-hilfe="bereich.finanzen" tabindex="0">${symbol('euro')} Finanzen</h2>
      <div class="kacheln">${FINANZEN.map(kachelHtml).join('')}</div></section>
    <section class="bereich" aria-labelledby="b-pa"><h2 id="b-pa" data-hilfe="bereich.patienten" tabindex="0">${symbol('patient')} Patienten</h2>
      <div class="kacheln">${PATIENTEN.map(kachelHtml).join('')}</div></section>
  </div>
  <section class="uebersicht" aria-labelledby="b-ue"><h2 id="b-ue" class="spaltenkopf" data-hilfe="bereich.uebersicht" tabindex="0">${symbol('auge')} Heute im Blick
      <a class="kopf-kalender" href="/kalender" data-hilfe="uebersicht.kalender" aria-label="Kalender öffnen">→ ${symbol('kalender', { groesse: 22 })}</a></h2>
    ${termine}${rechnungen}${anfragen}</section>
  ${log}
</div>`,
  });
}
