/**
 * Konfigurationsseite (W80): Textbausteine als Kacheln, Praxis-Einstellungen (Kleinunternehmerregelung),
 * Verweise auf Preislisten und Wellness-Katalog. Für den Rechner – am Handy ist der Link ausgeblendet.
 */
import { AUTOMATISCH_TEXT, WIRKUNG_TEXT, type Textbaustein } from '../kartei/konfiguration.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

interface Rahmen {
  wer: string;
  fassung: string;
  meldung?: string;
  fehler?: string;
  skriptInline?: string;
}
const meldungen = (o: Rahmen) =>
  `${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}`;
const form = (aktion: string, inhalt: string, klasse = 'inline') =>
  `<form method="post" action="/patienten/aktion" class="${klasse}"><input type="hidden" name="aktion" value="${aktion}"><input type="hidden" name="zurueck" value="/konfiguration">${inhalt}</form>`;

const wahl = (name: string, werte: Record<string, string>, aktuell: string) =>
  `<select name="${name}">${Object.entries(werte).map(([k, t]) => `<option value="${k}"${k === aktuell ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

export function konfigurationSeite(d: { textbausteine: Textbaustein[]; einstellungen: Record<string, string> }, o: Rahmen): string {
  const kacheln = d.textbausteine.map((b) => `<article class="tbk${b.aktiv ? '' : ' ab'}" data-hilfe="konfiguration.textbaustein">
    <header><span class="tbk-code">${esc(b.code)}</span><b>${esc(b.kurzname)}</b></header>
    <p class="rz-marken"><span class="marke${b.wirkung === 'keine' ? '' : ' jetzt'}">${esc(WIRKUNG_TEXT[b.wirkung])}</span><span class="marke">${esc(AUTOMATISCH_TEXT[b.automatisch])}</span></p>
    <details><summary class="knopf klein" data-hilfe="konfiguration.textbaustein.bearbeiten">Bearbeiten</summary>
      ${form('textbaustein_speichern', `<input type="hidden" name="textbaustein_id" value="${b.id}">
        <label>Kurzname (oben auf der Kachel)<input name="kurzname" value="${esc(b.kurzname)}" required maxlength="60"></label>
        <label>Text (steht unter den Positionen der Rechnung)<textarea name="text" rows="4" required>${esc(b.text)}</textarea></label>
        <div class="zwei"><label>Wirkung${wahl('wirkung', WIRKUNG_TEXT, b.wirkung)}</label><label>Automatisch dabei${wahl('automatisch', AUTOMATISCH_TEXT, b.automatisch)}</label></div>
        <div class="knopfreihe"><button class="knopf primaer">Speichern</button></div>`, 'formular')}
      ${form('textbaustein_aktiv', `<input type="hidden" name="textbaustein_id" value="${b.id}"><input type="hidden" name="aktiv" value="${b.aktiv ? '0' : '1'}"><button class="knopf klein" data-hilfe="konfiguration.textbaustein.aktiv">${b.aktiv ? 'ausblenden' : 'wieder anbieten'}</button>`)}
    </details>
    <p class="tbk-text">${esc(b.text)}</p>
  </article>`).join('');
  const ku = d.einstellungen.kleinunternehmer === 'ja';
  return seite({
    titel: 'Konfiguration', aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<h1>${symbol('protokoll', { groesse: 26 })} Konfiguration</h1>${meldungen(o)}
<p class="hint">Was Lilli selbst festlegt: Texte auf Rechnungen, Steuer-Einstellung, Preislisten, Wellness-Katalog. Diese Seite ist für den Rechner gedacht.</p>
<div class="knopfreihe">
  <a class="knopf" href="/preislisten" data-hilfe="konfiguration.preislisten">${symbol('euro', { groesse: 18 })} Preislisten</a>
  <a class="knopf" href="/rezepte/wellness" data-hilfe="konfiguration.wellness">${symbol('wellness', { groesse: 18 })} Wellness-Katalog</a>
  <a class="knopf" href="/rueckmeldungen" data-hilfe="konfiguration.rueckmeldungen">${symbol('fahne', { groesse: 18 })} Rückmeldungen</a>
</div>

<h2>Textbausteine für Rechnungen</h2>
<div class="tbk-raster">${kacheln}
  <details class="tbk neu" data-hilfe="konfiguration.textbaustein.neu"><summary><span class="rp-plus">+</span> Textbaustein</summary>
    ${form('textbaustein_speichern', `<label>Kurzname<input name="kurzname" required maxlength="60" placeholder="z. B. Dank"></label>
      <label>Text<textarea name="text" rows="4" required></textarea></label>
      <div class="zwei"><label>Wirkung${wahl('wirkung', WIRKUNG_TEXT, 'keine')}</label><label>Automatisch dabei${wahl('automatisch', AUTOMATISCH_TEXT, 'nie')}</label></div>
      <p class="hint">Die Kennung (R + Nummer) vergibt das System.</p><button class="knopf primaer">Anlegen</button>`, 'formular')}
  </details>
</div>

<h2>Steuer</h2>
<div class="tafel">
  ${form('einstellung', `<input type="hidden" name="schluessel" value="kleinunternehmer">
    <label class="haken" data-hilfe="konfiguration.kleinunternehmer"><input type="checkbox" name="wert_ja" value="1"${ku ? ' checked' : ''}> Kleinunternehmerregelung (§ 19 UStG) gilt – auf Wellness-Rechnungen wird keine Umsatzsteuer gerechnet, der Baustein R2 kommt automatisch dazu</label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="ust_satz_wellness">
    <label>Umsatzsteuersatz Wellness in % (gilt, sobald die Kleinunternehmerregelung endet)<input name="wert" value="${esc(d.einstellungen.ust_satz_wellness ?? '19')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.ust-satz"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  <p class="hint">Heilbehandlungen sind unabhängig davon steuerfrei (§ 4 Nr. 14 Buchst. a UStG). Kleinunternehmer: bis 25.000 € Umsatz im Vorjahr und 100.000 € im laufenden Jahr (Stand 2025); die Rechnung braucht den Hinweis auf § 19 UStG (§ 34a UStDV).</p>
</div>`,
  });
}
