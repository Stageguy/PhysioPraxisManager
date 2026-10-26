/**
 * Konfigurationsseite (W80): Textbausteine als Kacheln, Praxis-Einstellungen (Kleinunternehmerregelung),
 * Verweise auf Preislisten und Wellness-Katalog. Für den Rechner – am Handy ist der Link ausgeblendet.
 */
import { AUTOMATISCH_TEXT, WIRKUNG_TEXT, type Textbaustein } from '../kartei/konfiguration.ts';
import { esc, seite } from './layout.ts';
import { karteiFormular, meldungen, type Rahmen } from './bausteine.ts';
import { symbol } from './symbole.ts';

const form = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: '/konfiguration', klasse });

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
</div>

<h2>Termine und Terminanfragen</h2>
<div class="tafel">
  <p><a class="knopf primaer" href="/konfiguration/terminarten" data-hilfe="konfiguration.terminarten">${symbol('kalender', { groesse: 18 })} Terminarten für die Online-Anfrage (Kacheln)</a></p>
  ${form('einstellung', `<input type="hidden" name="schluessel" value="oeffnungszeiten">
    <label>Öffnungszeiten <span class="hint">(je Wochentag, mehrere Fenster mit Komma, Tage mit Semikolon)</span><input name="wert" value="${esc(d.einstellungen.oeffnungszeiten ?? 'Mo 08:00-18:00; Di 08:00-18:00; Mi 08:00-18:00; Do 08:00-18:00; Fr 08:00-14:00')}" data-hilfe="konfiguration.oeffnungszeiten"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="termin_dauer_min">
    <label>Dauer eines Termins in Minuten (Vorgabe für Vorschläge)<input name="wert" value="${esc(d.einstellungen.termin_dauer_min ?? '30')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.termin-dauer"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="termin_puffer_min">
    <label>Puffer zwischen Terminen in Minuten<input name="wert" value="${esc(d.einstellungen.termin_puffer_min ?? '0')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.puffer"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="anfragen_mailordner">
    <label>Outlook-Ordner mit Terminanfragen<input name="wert" value="${esc(d.einstellungen.anfragen_mailordner ?? 'Posteingang/Terminanfragen')}" data-hilfe="konfiguration.anfragen-ordner"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="buchung_vorlauf_stunden">
    <label>Buchungsseite: frühester Termin in Stunden ab jetzt<input name="wert" value="${esc(d.einstellungen.buchung_vorlauf_stunden ?? '24')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.buchung-vorlauf"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="buchung_tage">
    <label>Buchungsseite: wie viele Tage im Voraus<input name="wert" value="${esc(d.einstellungen.buchung_tage ?? '21')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.buchung-tage"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="buchung_hinweis">
    <label>Buchungsseite: Hinweis über dem Formular<input name="wert" value="${esc(d.einstellungen.buchung_hinweis ?? '')}" maxlength="300" data-hilfe="konfiguration.buchung-hinweis"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  <p class="hint">Vorschläge liegen in den Öffnungszeiten, nie an bayerischen Feiertagen und nie dort, wo Kartei, Hauptkalender oder Praxiskalender belegt sind. Eine Outlook-Regel legt Mails mit „Termin“ im Betreff und die Formular-Mails der Website in den Ordner; die Praxis-Assistenz liest ihn alle paar Minuten.</p>
</div>`,
  });
}
