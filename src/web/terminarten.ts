/**
 * Konfiguration › Terminarten (W94, W95): Kacheln je Sektion mit Kennung, Kurzbeschreibung (im
 * Dropdown), Langbeschreibung (unter dem Dropdown) und Dauer; Haken „aktiv“ = im Dropdown der
 * Online-Terminanfrage. Oben die Vorschau des Dropdowns, unten der HTML-Baustein für die Website.
 */
import { SEKTION_REIHE, SEKTIONEN, websiteBaustein, type Terminart } from '../kartei/terminarten.ts';
import { karteiFormular, meldungen, plusKachel, SEKTION_SYMBOL, sektionLegende, stift, type Rahmen } from './bausteine.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

const ZURUECK = '/konfiguration/terminarten';
const form = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: ZURUECK, klasse });

function kachel(a: Terminart): string {
  return `<article class="ta-kachel sek-${a.sektion}${a.aktiv ? '' : ' aus'}" id="ta-${a.id}" data-hilfe="terminart.kachel">
    <header><span class="ta-code" data-hilfe="terminart.code" tabindex="0">${esc(a.code)}</span><b>${esc(a.kurz)}</b></header>
    ${a.lang ? `<p class="ta-lang">${esc(a.lang)}</p>` : '<p class="ta-lang hint">ohne Langbeschreibung</p>'}
    <div class="ta-fuss">
      <span class="marke" data-hilfe="terminart.dauer" tabindex="0">${symbol('kalender', { groesse: 12 })} ${a.dauerMin} Min.</span>
      ${a.leistungNummer ? `<span class="marke" data-hilfe="terminart.gkv" tabindex="0">GKV ${esc(a.leistungNummer)}${a.regelzeit ? ` · ${esc(a.regelzeit)}` : ''}</span>` : ''}
      ${form('terminart_aktiv', `<input type="hidden" name="terminart_id" value="${a.id}"><input type="hidden" name="aktiv" value="${a.aktiv ? '0' : '1'}"><label class="haken" data-hilfe="terminart.aktiv"><input type="checkbox"${a.aktiv ? ' checked' : ''} data-auto-senden> aktiv</label><button class="knopf klein nur-ohne-js">${a.aktiv ? 'ausschalten' : 'aktivieren'}</button>`, 'ta-aktiv')}
    </div>
    ${stift(`#ta-${a.id}-bearbeiten`, 'terminart.bearbeiten', { oeffnet: `ta-${a.id}-bearbeiten`, text: 'Terminart bearbeiten' })}
    <details id="ta-${a.id}-bearbeiten"><summary class="hint nur-ohne-js" data-hilfe="terminart.bearbeiten">bearbeiten</summary>
      ${form('terminart_speichern', `<input type="hidden" name="terminart_id" value="${a.id}">
        <label>Kurzbeschreibung (im Dropdown)<input name="kurz" value="${esc(a.kurz)}" required maxlength="80"></label>
        <label>Langbeschreibung (unter dem Dropdown)<textarea name="lang" rows="3" maxlength="600">${esc(a.lang ?? '')}</textarea></label>
        <div class="zwei"><label>Dauer in Minuten<input name="dauer_min" value="${a.dauerMin}" inputmode="numeric" class="kurz" required></label>
        <label>GKV-Nummer (optional)<input name="leistung_nummer" value="${esc(a.leistungNummer ?? '')}" inputmode="numeric" class="kurz" maxlength="5"></label></div>
        <button class="knopf primaer">Speichern</button>`, 'formular')}
    </details>
  </article>`;
}

export function terminartenSeite(d: { terminarten: Terminart[]; buchung?: { url: string; oeffentlich: boolean } }, o: Rahmen): string {
  const aktive = d.terminarten.filter((a) => a.aktiv);
  const sektionen = SEKTION_REIHE.map((s) => {
    const liste = d.terminarten.filter((a) => a.sektion === s);
    return `<section class="ta-sektion sek-${s}" id="sektion-${s}" data-hilfe="terminart.sektion.${s}">
  <h2><span class="sek-sym sek-${s}">${symbol(SEKTION_SYMBOL[s], { groesse: 22 })}</span> ${esc(SEKTIONEN[s].name)} <span class="hint">${liste.filter((a) => a.aktiv).length} von ${liste.length} aktiv</span></h2>
  <p class="hint">${esc(SEKTIONEN[s].text)}</p>
  <div class="ta-raster">${plusKachel({ text: 'Neue Terminart', titel: `Neue Terminart (${SEKTIONEN[s].buchstabe} …)`, hilfe: 'terminart.neu', klasse: `sek-${s}`, inhalt: form('terminart_speichern', `<input type="hidden" name="sektion" value="${s}">
        <label>Kurzbeschreibung<input name="kurz" required maxlength="80"></label>
        <label>Langbeschreibung<textarea name="lang" rows="3" maxlength="600"></textarea></label>
        <div class="zwei"><label>Dauer in Minuten<input name="dauer_min" value="30" inputmode="numeric" class="kurz" required></label>
        <label>GKV-Nummer (optional)<input name="leistung_nummer" inputmode="numeric" class="kurz" maxlength="5"></label></div>
        <p class="hint">Die Kennung vergibt das System; neue Terminarten sind zunächst inaktiv.</p><button class="knopf primaer">Anlegen</button>`, 'formular') })}${liste.map(kachel).join('')}</div>
</section>`;
  }).join('');
  const optionen = SEKTION_REIHE.map((s) => {
    const liste = aktive.filter((a) => a.sektion === s);
    return liste.length ? `<optgroup label="${esc(SEKTIONEN[s].name)}">${liste.map((a) => `<option value="${a.id}">${esc(a.kurz)} (${a.dauerMin} Min.)</option>`).join('')}</optgroup>` : '';
  }).join('');
  return seite({
    titel: 'Terminarten', aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/konfiguration">Konfiguration</a> › Terminarten</p>
<h1>${symbol('kalender', { groesse: 26 })} Terminarten für die Online-Anfrage <span class="hint">${aktive.length} aktiv</span></h1>${meldungen(o)}
<p class="hint">Jede Kachel ist eine Wahl im Dropdown der Online-Terminanfrage: Kennung, Kurzbeschreibung (im Dropdown), Langbeschreibung (erscheint, sobald gewählt) und Dauer (für die Terminvorschläge). Nur Kacheln mit Haken „aktiv“ stehen im Dropdown. Farbe und Symbol der Sektion kehren im Kalender wieder.</p>
${sektionLegende()}
<section class="tafel ta-vorschau" data-hilfe="terminart.vorschau"><h2>${symbol('website')} Vorschau: so sieht das Dropdown auf der Website aus</h2>
  ${aktive.length ? `<label>Terminart<select data-terminart-vorschau><option value="">Bitte wählen …</option>${optionen}</select></label>
  ${aktive.map((a) => `<p class="hint" data-terminart-lang="${a.id}" hidden>${esc(a.lang ?? '')} <b>${a.dauerMin} Minuten.</b></p>`).join('')}` : '<p class="leer">Noch keine Terminart aktiv – unten den Haken „aktiv“ setzen.</p>'}
</section>
${sektionen}
${d.buchung ? `<section class="tafel" id="buchungsseite" data-hilfe="terminart.einbetten"><h2>${symbol('buchung')} Buchungsseite einbetten</h2>
  <p class="hint">Die Buchungsseite zeigt genau diese aktiven Terminarten im Dropdown, dazu Tag und freie Uhrzeit. <a href="${esc(d.buchung.url)}" target="_blank" rel="noopener">Buchungsseite ansehen</a>${d.buchung.oeffentlich ? '' : ' (zurzeit nur im Tailnet erreichbar – öffentlich erst nach Freigabe, A27)'}.</p>
  <p>Schnipsel für lilli-nebel.de (passt die Höhe von selbst an):</p>
  <textarea class="ta-baustein" readonly rows="2">&lt;script src="${esc(d.buchung.url)}/einbetten.js" async&gt;&lt;/script&gt;</textarea>
  <p class="hint">Oder als iframe, z. B. mit vorgewählter Terminart:</p>
  <textarea class="ta-baustein" readonly rows="2">&lt;iframe src="${esc(d.buchung.url)}/?terminart=P1" title="Termin anfragen" style="width:100%;border:0;min-height:720px"&gt;&lt;/iframe&gt;</textarea>
</section>` : ''}
<section class="tafel" id="baustein" data-hilfe="terminart.baustein"><h2>${symbol('protokoll')} Baustein für das Formular der Website</h2>
  <p class="hint">Diesen HTML-Code in das Anfrageformular auf lilli-nebel.de einsetzen. Die Formular-Mail trägt dann die Zeile „Terminart: P4 – Krankengymnastik (KG)“ – die Praxis-Assistenz erkennt die Kennung, ordnet die Anfrage zu und schlägt Zeiten mit der passenden Dauer vor. Nach jeder Änderung an den Kacheln neu kopieren.</p>
  <textarea class="ta-baustein" readonly rows="12">${esc(websiteBaustein(d.terminarten))}</textarea>
</section>`,
  });
}
