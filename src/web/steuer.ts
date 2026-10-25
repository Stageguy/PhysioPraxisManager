/**
 * Unterseite des Rechnungs-Dashboards (W85): steuerfreie Umsätze für das Finanzamt – Rechnungsnummer,
 * Positionen, Beträge; Namen maskiert oder ausgeschrieben (Checkbox); Export CSV und PDF.
 */
import type { SteuerListe } from '../kartei/steuer.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const datum = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '–');

export function steuerSeite(l: SteuerListe, o: { wer: string; fassung: string; skriptInline?: string }): string {
  const q = (namen?: boolean) => `?jahr=${l.jahr}${(namen ?? !l.maskiert) ? '&namen=1' : ''}`;
  const zeilen = l.rechnungen.map((r) => `<tr class="${r.status === 'storniert' ? 'ab' : ''}" data-hilfe="steuer.rechnung">
    <td><b>${esc(r.nummer)}</b>${r.status === 'storniert' ? ' <span class="chip preset12">storniert</span>' : ''}</td><td>${datum(r.datum)}</td><td class="kuerzel">${esc(r.befreiung)}</td>
    <td>${esc(r.patientennummer)} · ${esc(r.name)}</td>
    <td><ul class="steuer-pos">${r.positionen.map((p) => `<li><span>${datum(p.datum)}</span><span class="kuerzel">${esc(p.nummer ?? '')}</span><span>${esc(p.bezeichnung)}</span><span class="zahlspalte">${p.anzahl} × ${euro(p.einzelpreis)}</span><span class="zahlspalte">${euro(p.betrag)}</span></li>`).join('')}</ul></td>
    <td class="zahlspalte"><b>${euro(r.betrag)}</b>${r.bezahltAm ? `<br><span class="hint">bezahlt ${datum(r.bezahltAm)}</span>` : ''}</td>
  </tr>`).join('');
  return seite({
    titel: `Steuerfreie Umsätze ${l.jahr}`, aktiv: 'cockpit', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/finanzen/rechnungen">Rechnungs-Dashboard</a> › Steuerfreie Umsätze</p>
<h1>${symbol('euro', { groesse: 26 })} Steuerfreie Umsätze ${l.jahr} <span class="hint">für das Finanzamt</span></h1>
<form method="get" action="/finanzen/rechnungen/steuerfrei" class="filter"><input type="hidden" name="form" value="1">
  <label>Jahr<select name="jahr" data-auto-senden data-hilfe="steuer.jahr">${l.jahre.map((j) => `<option value="${j}"${j === l.jahr ? ' selected' : ''}>${j}</option>`).join('')}</select></label>
  <label class="haken" data-hilfe="steuer.maskiert"><input type="checkbox" name="maskiert" value="1"${l.maskiert ? ' checked' : ''} data-auto-senden> Namen maskieren (Vorname nur erster Buchstabe)</label>
  <button class="knopf klein nur-ohne-js">anzeigen</button>
  <a class="knopf" href="/finanzen/rechnungen/steuerfrei.csv${q()}" data-hilfe="steuer.csv">${symbol('protokoll', { groesse: 18 })} CSV (GoBD)</a>
  <a class="knopf" href="/finanzen/rechnungen/steuerfrei.pdf${q()}" target="_blank" rel="noopener" data-hilfe="steuer.pdf">${symbol('rechnung', { groesse: 18 })} PDF</a>
</form>
<div class="zaehler" data-hilfe="steuer.summen" tabindex="0">
  <div class="zahl"><b>${euro(l.summen.heilbehandlung)}</b><span>§ 4 Nr. 14 UStG (Heilbehandlung)</span></div>
  <div class="zahl"><b>${euro(l.summen.kleinunternehmer)}</b><span>§ 19 UStG (Kleinunternehmer)</span></div>
  <div class="zahl"><b>${euro(l.summen.gesamt)}</b><span>Gesamt steuerfrei</span></div>
  <div class="zahl"><b>${euro(l.summen.storniert)}</b><span>storniert (nicht gezählt)</span></div>
</div>
${l.rechnungen.length ? `<div class="tabelle"><table><thead><tr><th>Rechnung</th><th>Datum</th><th>Befreiung</th><th>Patient</th><th>Positionen</th><th class="zahlspalte">Betrag</th></tr></thead><tbody>${zeilen}</tbody></table></div>` : `<p class="leer">Keine gestellten Rechnungen ohne Umsatzsteuer im Jahr ${l.jahr}.</p>`}
<p class="hint">Gezählt werden Rechnungen mit Nummer (also ab „In Lexware“) ohne Umsatzsteuer. Entwürfe fehlen; stornierte stehen grau dabei, damit die Nummernfolge lückenlos nachvollziehbar bleibt.
Name und Honorar unterliegen nicht der Schweigepflicht – das Finanzamt darf sie verlangen; Diagnosen stehen hier nie. Die Maskierung ist Vorsicht, keine Pflicht.
ELSTER nimmt keine Listen entgegen; für die Umsatzsteuererklärung zählt die Summe, für eine Prüfung der CSV-Export (GoBD-Datenzugriff) bzw. der Export aus Lexware.</p>`,
  });
}
