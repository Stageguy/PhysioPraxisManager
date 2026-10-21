/**
 * Rechnungs-Dashboard (/finanzen/rechnungen) und Rechnungsansicht (/finanzen/rechnungen/<id>) –
 * Prompt 15. Server-gerendert, ohne Inline-Skripte; Diagramme als SVG bzw. HTML-Balken in einer
 * geprüften Farbe (dataviz-Validator: #9a4a86 hell, #c45fab dunkel), eine Reihe, daher ohne Legende.
 */
import type { Quelle, Rechnungsstand } from '../cockpit/daten.ts';
import { STAENDE, type Auswertung, type Filter, type Rechnung } from '../rechnungen/dashboard.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

export interface KachelRechnung extends Rechnung {
  /** Ort der Mail im Postfach; undefined = nicht mehr im Postfach */
  ort?: string;
}

export interface DashboardDaten {
  stand: Quelle<Rechnungsstand>;
  neu: KachelRechnung[];
  privat: KachelRechnung[];
  auswertung?: Auswertung;
  liste: Rechnung[];
  filter: Filter;
}

const euro = (n: number | null) => (n === null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const datum = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : '–';
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const STATUS: Record<string, [string, string]> = {
  eingegangen: ['eingegangen', 'preset3'], wartet_freigabe: ['eingegangen', 'preset3'], freigegeben: ['freigegeben', 'preset4'],
  an_lexware: ['in Lexware', 'preset7'], zahlung_angestossen: ['Zahlung angestoßen', 'preset5'], bezahlt: ['bezahlt', 'preset19'],
  abgelehnt: ['abgelehnt', 'preset0'], privat: ['privat', 'preset12'], fehler: ['Fehler', 'preset0'],
};
export const statusChip = (s: string) => {
  const [text, farbe] = STATUS[s] ?? [s, ''];
  return `<span class="chip ${farbe}">${esc(text)}</span>`;
};

const absender = (r: Rechnung) =>
  r.absenderName || r.absenderAdresse
    ? `${esc(r.absenderName ?? '')}${r.absenderAdresse ? ` <span class="hint">&lt;${esc(r.absenderAdresse)}&gt;</span>` : ''}`
    : '<span class="hint">unbekannt</span>';

function privatForm(r: Rechnung, zurueck: string): string {
  const an = r.status === 'privat';
  return `<form class="rk-privat" method="post" action="/finanzen/rechnungen/${r.id}/aktion">
    <input type="hidden" name="aktion" value="privat"><input type="hidden" name="zurueck" value="${esc(zurueck)}">
    <input type="hidden" name="an" value="0">
    <label data-hilfe="rechnungen.privat"><input type="checkbox" name="an" value="1" data-auto-senden${an ? ' checked' : ''}> privat</label>
    <button class="knopf klein nur-ohne-js">übernehmen</button>
  </form>`;
}

function kachel(r: KachelRechnung): string {
  return `<article class="rk${r.zurueckgestellt ? ' spaeter' : ''}" data-hilfe="rechnungen.kachel">
    <a class="rk-link" href="/finanzen/rechnungen/${r.id}">
      <span class="rk-kopf">${symbol('rechnung', { groesse: 20 })}<b class="rk-datei">${esc(r.dateiname ?? 'Rechnung.pdf')}</b></span>
      <span class="rk-zeile"><span>${esc(r.lieferant ?? 'ohne Lieferant')}</span><b>${euro(r.betrag)}</b></span>
      <span class="rk-meta">Eingang ${datum(r.eingang)} · von ${absender(r)}</span>
      ${r.zurueckgestellt ? '<span class="marke">zurückgestellt</span>' : ''}
    </a>
    <span class="rk-ort" data-hilfe="rechnungen.ort" tabindex="0">${symbol('email', { groesse: 16 })}<span>${r.ort === undefined ? 'Mail nicht mehr im Postfach' : `Liegt in: ${esc(r.ort)}`}</span></span>
    ${privatForm(r, '/finanzen/rechnungen')}
  </article>`;
}

/** Säulen je Monat – eine Reihe, Werte im Tooltip, nur das Maximum beschriftet */
function monatsSaeulen(a: Auswertung): string {
  const max = Math.max(...a.monate);
  if (!max) return '<p class="leer">Für dieses Jahr gibt es noch keine Beträge.</p>';
  const schritt = schoeneSkala(max);
  const oben = Math.ceil(max / schritt) * schritt;
  const [x0, x1, y0, y1] = [44, 636, 12, 176];
  const band = (x1 - x0) / 12;
  const b = Math.min(24, band * 0.6);
  const y = (v: number) => y1 - (v / oben) * (y1 - y0);
  const raster = [];
  for (let v = 0; v <= oben; v += schritt) {
    raster.push(`<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" class="raster"/><text x="${x0 - 6}" y="${y(v) + 4}" class="achse ende">${kompakt(v)}</text>`);
  }
  const saeulen = a.monate.map((v, i) => {
    const mx = x0 + band * i + band / 2;
    const h = y1 - y(v);
    const form = v ? `<path d="M${mx - b / 2},${y1} v${-(h - 4 > 0 ? h - 4 : 0)} q0,-4 4,-4 h${b - 8} q4,0 4,4 v${h - 4 > 0 ? h - 4 : 0} z" class="marke-d"/>` : '';
    const etikett = v === max ? `<text x="${mx}" y="${y(v) - 6}" class="wert">${kompakt(v)} €</text>` : '';
    return `<g class="ziel"><title>${MONATE[i]} ${a.jahr}: ${euro(v)}</title><rect x="${mx - band / 2}" y="${y0}" width="${band}" height="${y1 - y0}" class="treffer"/>${form}${etikett}<text x="${mx}" y="${y1 + 16}" class="achse">${MONATE[i]}</text></g>`;
  });
  return `<svg class="diagramm" viewBox="0 0 640 200" role="img" aria-label="Summe je Monat ${a.jahr}, höchster Monat ${euro(max)}">${raster.join('')}${saeulen.join('')}<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" class="basis"/></svg>`;
}

function schoeneSkala(max: number): number {
  const roh = max / 4;
  const p = 10 ** Math.floor(Math.log10(roh));
  return [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= roh) ?? roh;
}
const kompakt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T` : v.toLocaleString('de-DE', { maximumFractionDigits: 0 }));

/** Balken je Lieferant – Wert an der Spitze, Name davor */
function lieferantenBalken(a: Auswertung): string {
  if (!a.lieferanten.length) return '<p class="leer">Noch keine Lieferanten mit Beträgen.</p>';
  const max = Math.max(...a.lieferanten.map((l) => l.summe));
  return `<ul class="balkenliste" aria-label="Summe je Lieferant ${a.jahr}">${a.lieferanten
    .map((l) => `<li title="${esc(l.name)}: ${euro(l.summe)}"><span class="bl-name">${esc(l.name)}</span>
      <span class="bl-spur"><span class="bl-fuellung" style="width:${Math.max(1, (l.summe / max) * 100).toFixed(1)}%"></span></span>
      <span class="bl-wert">${euro(l.summe)}</span></li>`).join('')}</ul>`;
}

function filterForm(f: Filter, jahre: number[]): string {
  const jahrOpt = [...new Set([f.jahr, ...jahre])].sort((a, b) => b - a)
    .map((j) => `<option${j === f.jahr ? ' selected' : ''}>${j}</option>`).join('');
  const standOpt = Object.entries(STAENDE).map(([k, t]) => `<option value="${k}"${k === f.stand ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<form class="filter" method="get" action="/finanzen/rechnungen#auswertung">
    <label>Jahr <select name="jahr" data-hilfe="rechnungen.filter.jahr" data-auto-senden>${jahrOpt}</select></label>
    <label>Stand <select name="stand" data-hilfe="rechnungen.filter.stand" data-auto-senden>${standOpt}</select></label>
    <label class="suche">Suche <input type="search" name="q" value="${esc(f.suche)}" placeholder="Lieferant, Datei, Nummer, Absender" data-hilfe="rechnungen.filter.suche"></label>
    <button class="knopf" data-hilfe="rechnungen.filter.anwenden">Anwenden</button>
  </form>`;
}

const ZAEHLER = [
  ['eingegangen', 'rechnungen.zaehler.eingegangen', 'eingegangen', 'preset3'],
  ['unklar', 'rechnungen.zaehler.unklar', 'unklar', 'preset1'],
  ['angestossen', 'rechnungen.zaehler.angestossen', 'angestoßen', 'preset5'],
  ['bezahlt', 'rechnungen.zaehler.bezahlt', 'bezahlt', 'preset19'],
] as const;

export function dashboardSeite(d: DashboardDaten, o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const z = d.stand.stand === 'ok' ? d.stand.daten.zaehler : undefined;
  const zaehler = `<div class="zaehler">${ZAEHLER.map(([feld, key, text, farbe]) =>
    `<div class="zahl" data-hilfe="${key}" tabindex="0"><span class="punkt ${farbe}"></span><b>${z ? z[feld] : '–'}</b><span>${text}</span></div>`).join('')}</div>`;
  const nichtVerbunden = d.stand.stand !== 'ok' ? `<p class="leer">${symbol('schloss', { groesse: 18 })} ${esc(d.stand.hinweis)}</p>` : '';
  const a = d.auswertung;
  const tabelle = d.liste.length
    ? `<div class="tabelle"><table data-hilfe="rechnungen.tabelle"><thead><tr><th>Eingang</th><th>Datei</th><th>Lieferant · Absender</th><th>Nr.</th><th class="zahlspalte">Betrag</th><th>Stand</th><th></th></tr></thead><tbody>
      ${d.liste.map((r) => `<tr><td>${datum(r.eingang)}</td><td><a href="/finanzen/rechnungen/${r.id}">${esc(r.dateiname ?? 'Rechnung.pdf')}</a></td>
        <td>${esc(r.lieferant ?? '–')}<br><span class="hint">${esc(r.absenderAdresse ?? '')}</span></td><td>${esc(r.rechnungsnummer ?? '–')}</td>
        <td class="zahlspalte">${euro(r.betrag)}</td><td>${statusChip(r.status)}</td>
        <td>${r.onedriveWebUrl ? `<a href="/finanzen/rechnungen/${r.id}/onedrive" data-hilfe="rechnungen.onedrive" target="_blank" rel="noopener">OneDrive</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`
    : `<p class="leer" data-hilfe="rechnungen.tabelle" tabindex="0">Keine Rechnungen für diese Auswahl.</p>`;

  return seite({
    titel: 'Rechnungs-Dashboard', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/">Cockpit</a> › Finanzen</p>
<h1>${symbol('rechnung', { groesse: 26 })} Rechnungs-Dashboard</h1>
${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}
${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}
<section class="tafel">${zaehler}${nichtVerbunden}</section>

<section aria-labelledby="t-neu">
  <h2 id="t-neu" class="spaltenkopf dash-kopf" data-hilfe="rechnungen.neu" tabindex="0">${symbol('rechnung')} Neue Rechnungen <span class="hint">(${d.neu.length})</span></h2>
  ${d.neu.length ? `<div class="rk-raster">${d.neu.map(kachel).join('')}</div>` : '<p class="leer">Keine neuen Rechnungen – alles erledigt.</p>'}
  ${d.privat.length ? `<details class="privatliste" data-hilfe="rechnungen.privatliste"><summary>Als privat markiert (${d.privat.length})</summary>
    <div class="rk-raster">${d.privat.map(kachel).join('')}</div></details>` : ''}
</section>

<section id="auswertung" aria-labelledby="t-aus">
  <h2 id="t-aus" class="spaltenkopf dash-kopf">${symbol('euro')} Auswertung &amp; Suche</h2>
  ${filterForm(d.filter, a?.jahre ?? [])}
  ${a ? `<div class="diagramme">
    <div class="tafel" data-hilfe="rechnungen.diagramm.monate"><h3>Summe je Monat ${a.jahr}</h3>${monatsSaeulen(a)}
      <p class="hint">Gesamt ${euro(a.summe)} – ohne privat und abgelehnt${a.ohneBetrag ? `; ${a.ohneBetrag} Rechnung(en) ohne Betrag` : ''}</p></div>
    <div class="tafel" data-hilfe="rechnungen.diagramm.lieferanten"><h3>Summe je Lieferant ${a.jahr}</h3>${lieferantenBalken(a)}</div>
  </div>` : ''}
  <div class="tafel">${tabelle}</div>
</section>`,
  });
}

// ── Rechnungsansicht ────────────────────────────────────────────────────────
export function rechnungSeite(r: KachelRechnung, o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const offen = r.status === 'eingegangen' || r.status === 'wartet_freigabe';
  const zurueck = `/finanzen/rechnungen/${r.id}`;
  const aktion = (name: string, text: string, klasse: string, hilfe: string, extra = '') =>
    `<form method="post" action="/finanzen/rechnungen/${r.id}/aktion" class="aktion">
      <input type="hidden" name="aktion" value="${name}"><input type="hidden" name="zurueck" value="${zurueck}">${extra}
      <button class="knopf ${klasse}" data-hilfe="${hilfe}">${text}</button></form>`;
  const feld = (name: string, label: string, wert: string | null, art = 'text', hilfe = name) =>
    `<label>${label}<input name="${name}" type="${art}" value="${esc(wert ?? '')}" data-hilfe="rechnung.feld.${hilfe}"${art === 'text' && name === 'betrag' ? ' inputmode="decimal"' : ''}></label>`;

  return seite({
    titel: 'Rechnung', aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/">Cockpit</a> › <a href="/finanzen/rechnungen" data-hilfe="rechnung.zurueck">Rechnungs-Dashboard</a></p>
<h1 class="umbruch">${esc(r.dateiname ?? 'Rechnung.pdf')}</h1>
${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}
${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}
<div class="ansicht">
  <div class="pdf-rahmen" data-hilfe="rechnung.pdf">
    ${r.onedriveItemId ? `<iframe src="/finanzen/rechnungen/${r.id}/pdf" title="Rechnungs-PDF ${esc(r.dateiname ?? '')}"></iframe>` : '<p class="leer">Zu dieser Rechnung gibt es keine Datei in OneDrive.</p>'}
  </div>
  <aside class="angaben">
    <div class="tafel">
      <dl class="liste-dl">
        <dt>Stand</dt><dd>${statusChip(r.status)}${r.zurueckgestellt && offen ? ' <span class="marke">zurückgestellt</span>' : ''}</dd>
        <dt>Eingang</dt><dd>${datum(r.eingang)}</dd>
        <dt>Von</dt><dd>${absender(r)}</dd>
        <dt>Mail</dt><dd data-hilfe="rechnung.ort" tabindex="0">${r.ort === undefined ? 'nicht mehr im Postfach' : esc(r.ort)}</dd>
        ${r.geprueftVon ? `<dt>Geprüft</dt><dd>${esc(r.geprueftVon)}, ${datum(r.geprueftAm)}</dd>` : ''}
        ${r.ablehnungsgrund ? `<dt>Grund</dt><dd>${esc(r.ablehnungsgrund)}</dd>` : ''}
      </dl>
      <p class="links">
        ${r.onedriveItemId ? `<a href="/finanzen/rechnungen/${r.id}/pdf" target="_blank" rel="noopener" data-hilfe="rechnung.vollbild">${symbol('rechnung', { groesse: 16 })} PDF in voller Größe</a>` : ''}
        ${r.onedriveWebUrl ? `<a href="/finanzen/rechnungen/${r.id}/onedrive" target="_blank" rel="noopener" data-hilfe="rechnung.onedrive">${symbol('ordner', { groesse: 16 })} in OneDrive öffnen</a>` : ''}
      </p>
    </div>
    ${offen ? `<div class="tafel freigabe">
      <h2>Freigabe</h2>
      <div class="knopfreihe">
        ${aktion('freigeben', `${symbol('haken', { groesse: 18 })} Freigeben`, 'primaer', 'rechnung.freigeben')}
        ${aktion('spaeter', 'Später', '', 'rechnung.spaeter')}
      </div>
      <form method="post" action="/finanzen/rechnungen/${r.id}/aktion" class="ablehnen">
        <input type="hidden" name="aktion" value="ablehnen"><input type="hidden" name="zurueck" value="${zurueck}">
        <label>Grund für die Ablehnung<textarea name="grund" rows="2" required maxlength="500" data-hilfe="rechnung.grund"></textarea></label>
        <button class="knopf warnend" data-hilfe="rechnung.ablehnen">${symbol('kreuz', { groesse: 18 })} Ablehnen</button>
      </form>
    </div>` : ''}
    <form class="tafel korrektur" method="post" action="/finanzen/rechnungen/${r.id}/aktion">
      <h2>Angaben</h2>
      <input type="hidden" name="aktion" value="speichern"><input type="hidden" name="zurueck" value="${zurueck}">
      ${feld('lieferant', 'Lieferant', r.lieferant)}
      ${feld('rechnungsnummer', 'Rechnungsnummer', r.rechnungsnummer, 'text', 'nummer')}
      ${feld('betrag', 'Betrag (€)', r.betrag === null ? null : r.betrag.toFixed(2).replace('.', ','))}
      ${feld('rechnungsdatum', 'Rechnungsdatum', r.rechnungsdatum, 'date', 'datum')}
      <button class="knopf" data-hilfe="rechnung.speichern">Speichern</button>
    </form>
    <div class="tafel">${privatForm(r, zurueck).replace('data-hilfe="rechnungen.privat"', 'data-hilfe="rechnung.privat"')}</div>
  </aside>
</div>`,
  });
}

/** Kleines Skript für alle Seiten: Haken und Auswahllisten schicken ihr Formular sofort ab */
export const PRAXIS_SKRIPT = String.raw`
(function () {
  document.documentElement.classList.add('js');
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-auto-senden') && el.form) el.form.submit();
  });
})();
`;
