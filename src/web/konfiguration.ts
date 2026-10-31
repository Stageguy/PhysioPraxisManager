/**
 * Konfigurationsseite (W80): Textbausteine als Kacheln, Praxis-Einstellungen (Kleinunternehmerregelung),
 * Verweise auf Preislisten und Wellness-Katalog. Für den Rechner – am Handy ist der Link ausgeblendet.
 */
import { AUTOMATISCH_TEXT, WIRKUNG_TEXT, type Textbaustein } from '../kartei/konfiguration.ts';
import { FREIE_TAG_ART_TEXT, WOCHENTAG_KURZ, type FreieTageDaten } from '../kartei/freie-tage.ts';
import { REGELZEIT_QUELLE_TEXT, type Regelzeit } from '../kartei/regelzeiten.ts';
import { oeffnungszeitenJeTag, oeffnungszeitenLesen, wochentag, type OeffnungsTag } from '../anfragen/slots.ts';
import { datumText } from '../format.ts';
import { esc, seite } from './layout.ts';
import { formular, karteiFormular, meldungen, plusKachel, stift, type Rahmen } from './bausteine.ts';
import { symbol } from './symbole.ts';

const form = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: '/konfiguration', klasse });

const wahl = (name: string, werte: Record<string, string>, aktuell: string) =>
  `<select name="${name}">${Object.entries(werte).map(([k, t]) => `<option value="${k}"${k === aktuell ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

/** Abschnitt „Kalender: freie Tage“ (A26/W111) – Jahr, Feiertage, Brückentage mit Haken, Wochenende, Schließtage */
function freieTageAbschnitt(ft: FreieTageDaten, einstellungen: Record<string, string>): string {
  // Eigenes Rücksprungziel mit Jahr, damit die Aktionen auf dem gewählten Jahr landen
  const formFt = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: `/konfiguration?jahr=${ft.jahr}`, klasse });
  const wt = (datum: string) => WOCHENTAG_KURZ[wochentag(datum) - 1];
  return `<h2 id="freie-tage">Kalender: freie Tage</h2>
<div class="tafel">
  <p class="hint">Gesperrte Tage bekommen keine Terminvorschläge und sind auf der Buchungsseite nicht wählbar (W111). Feiertage kommen von feiertage-api.de (Bayern), ersatzweise aus dem eigenen Rechner; beim Start des Dienstes stehen das laufende und das nächste Jahr drin.</p>
  <p class="jahre">Jahr: ${ft.jahre.map((j) => (j === ft.jahr ? `<b>${j}</b>` : `<a href="/konfiguration?jahr=${j}#freie-tage" data-hilfe="konfiguration.jahr">${j}</a>`)).join(' · ')}
    ${formFt('feiertage_importieren', `<input type="hidden" name="jahr" value="${ft.jahr}"><button class="knopf klein" data-hilfe="konfiguration.feiertage-laden">${symbol('kalender', { groesse: 16 })} Feiertage ${ft.jahr} neu laden</button>`)}</p>
  ${ft.liste.length ? `<div class="tabelle"><table class="freie-tage"><thead><tr><th>Tag</th><th>Name</th><th>Art</th><th>Buchbar?</th><th></th></tr></thead><tbody>${ft.liste.map((t) => `<tr${t.gesperrt ? '' : ' class="offen"'}>
      <td>${wt(t.datum)} ${datumText(t.datum)}</td><td>${esc(t.name)}</td><td>${FREIE_TAG_ART_TEXT[t.art]}</td>
      <td>${formFt('freier_tag_sperren', `<input type="hidden" name="datum" value="${t.datum}"><input type="hidden" name="gesperrt" value="${t.gesperrt ? 'nein' : 'ja'}"><button class="knopf klein" data-hilfe="konfiguration.tag-sperren">${t.gesperrt ? 'gesperrt – freigeben' : 'offen – sperren'}</button>`)}</td>
      <td>${t.art === 'feiertag' ? '' : formFt('freier_tag_loeschen', `<input type="hidden" name="datum" value="${t.datum}"><button class="knopf klein warnend" data-hilfe="konfiguration.tag-loeschen">entfernen</button>`)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="leer">Noch keine freien Tage für ${ft.jahr} – „Feiertage neu laden“.</p>`}
  <h3>Brückentage ${ft.jahr}</h3>
  ${ft.brueckentage.length
    ? formFt('brueckentage_setzen', `<input type="hidden" name="jahr" value="${ft.jahr}">${ft.brueckentage.map((b) => `<label class="haken"><input type="checkbox" name="tag" value="${b.datum}"${b.gesperrt ? ' checked' : ''} data-hilfe="konfiguration.brueckentag"> ${wt(b.datum)} ${datumText(b.datum)} <span class="hint">wegen ${esc(b.wegen)}</span></label>`).join('')}<button class="knopf klein" data-hilfe="konfiguration.brueckentage-speichern">Angehakte Brückentage sperren</button>`, 'formular')
    : '<p class="hint">Keine Brückentage in diesem Jahr.</p>'}
  ${formFt('einstellung', `<input type="hidden" name="schluessel" value="kalender_wochenende"><label class="haken" data-hilfe="konfiguration.wochenende"><input type="checkbox" name="wert_gesperrt" value="1"${(einstellungen.kalender_wochenende ?? 'gesperrt') !== 'offen' ? ' checked' : ''}> Wochenenden nicht buchbar</label><button class="knopf klein">Speichern</button>`, 'formular zeile')}
  <h3>Schließtage eintragen</h3>
  ${formFt('schliesstage_anlegen', `<div class="zwei"><label>Von<input type="date" name="von" required></label><label>Bis <span class="hint">(leer = ein Tag)</span><input type="date" name="bis"></label></div>
    <div class="zwei"><label>Bezeichnung<input name="name" maxlength="80" placeholder="z. B. Sommerurlaub"></label><label>Art<select name="art"><option value="urlaub">Urlaub</option><option value="fortbildung">Fortbildung</option><option value="geschlossen">Praxis geschlossen</option></select></label></div>
    <button class="knopf klein" data-hilfe="konfiguration.schliesstag-anlegen">Schließtage eintragen</button>`, 'formular')}
</div>
`;
}

const OEFFNUNG_STANDARD = 'Mo 08:00-18:00; Di 08:00-18:00; Mi 08:00-18:00; Do 08:00-18:00; Fr 08:00-14:00';

/** Abschnitt „Kalender: Öffnungszeiten und Pausen“ (W112) – je Wochentag Beginn, Ende, Pause; als Text für Sonderfälle */
function oeffnungszeitenAbschnitt(einstellungen: Record<string, string>, jahr: number): string {
  const text = einstellungen.oeffnungszeiten ?? OEFFNUNG_STANDARD;
  let tage: OeffnungsTag[];
  try {
    tage = oeffnungszeitenJeTag(oeffnungszeitenLesen(text));
  } catch {
    tage = oeffnungszeitenJeTag([]);
  }
  const formO = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: `/konfiguration?jahr=${jahr}`, klasse });
  const zeit = (name: string, wert: string, label: string) => `<input type="time" name="${name}" value="${wert}" aria-label="${label}">`;
  return `<h2 id="oeffnungszeiten">Kalender: Öffnungszeiten und Pausen</h2>
<div class="tafel">
  <p class="hint">Nur in diesen Zeiten gibt es Terminvorschläge und Buchungen (W112) – je Wochentag Beginn, Ende und eine Pause. Von Hand lassen sich Termine auch außerhalb anlegen. Outlook-Termine in diesen Fenstern zeigt der Kalender als Block.</p>
  ${formO('oeffnungszeiten_setzen', `<div class="tabelle"><table class="oeffnungszeiten" data-hilfe="konfiguration.oeffnungszeiten-tabelle"><thead><tr><th>Tag</th><th>geöffnet</th><th>von</th><th>bis</th><th>Pause von</th><th>Pause bis</th></tr></thead><tbody>
    ${tage.map((t) => `<tr><td>${t.name}</td><td><input type="checkbox" name="offen_${t.tag}" value="1"${t.offen ? ' checked' : ''} aria-label="${t.name} geöffnet"></td><td>${zeit(`von_${t.tag}`, t.von, `${t.name} von`)}</td><td>${zeit(`bis_${t.tag}`, t.bis, `${t.name} bis`)}</td><td>${zeit(`pause_von_${t.tag}`, t.pauseVon, `${t.name} Pause von`)}</td><td>${zeit(`pause_bis_${t.tag}`, t.pauseBis, `${t.name} Pause bis`)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint">Derzeit: ${esc(text)}</p>
    <button class="knopf primaer" data-hilfe="konfiguration.oeffnungszeiten-speichern">Öffnungszeiten speichern</button>`, 'formular')}
  <details><summary class="knopf klein" data-hilfe="konfiguration.oeffnungszeiten-text">Als Text bearbeiten (mehr als zwei Fenster an einem Tag)</summary>
    ${form('einstellung', `<input type="hidden" name="schluessel" value="oeffnungszeiten">
    <label>Öffnungszeiten <span class="hint">(je Wochentag, mehrere Fenster mit Komma, Tage mit Semikolon)</span><input name="wert" value="${esc(text)}" data-hilfe="konfiguration.oeffnungszeiten"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  </details>
</div>
`;
}

/** Abschnitt „Hausbesuche: Fahrtzeiten“ (W113) – großzügige Schätzung ohne fremden Kartendienst */
function fahrtzeitenAbschnitt(e: Record<string, string>, jahr: number): string {
  return `<h2 id="fahrtzeiten">Hausbesuche: Fahrtzeiten</h2>
<div class="tafel">
  <p class="hint">Bei einem Hausbesuch blockt der Kalender die Fahrt davor und danach (W113). Geschätzt wird großzügig und ohne fremden Kartendienst – keine Patientenadresse verlässt die Praxis: ein Standard für unbekannte Orte, eine Zeit innerorts (zwischen zwei Hausbesuchen im selben Ort) und je Ort oder PLZ eine eigene Zeit. Am Termin lässt sich die Fahrtzeit von Hand ändern.</p>
  ${karteiFormular('fahrtzeiten_setzen', `<div class="zwei">
    <label>Standard: Praxis ↔ unbekannter Ort (Minuten)<input name="fahrtzeit_standard_min" value="${esc(e.fahrtzeit_standard_min ?? '30')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.fahrtzeit-standard"></label>
    <label>Innerorts: zwischen zwei Hausbesuchen im selben Ort (Minuten)<input name="fahrtzeit_innerorts_min" value="${esc(e.fahrtzeit_innerorts_min ?? '10')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.fahrtzeit-innerorts"></label></div>
    <label>Je Ort oder PLZ – eine Zeile „Ort = Minuten“<textarea name="fahrtzeit_orte" rows="5" placeholder="Bad Wörishofen = 10&#10;Türkheim = 15&#10;87719 = 20" data-hilfe="konfiguration.fahrtzeit-orte">${esc(e.fahrtzeit_orte ?? '')}</textarea></label>
    <button class="knopf primaer" data-hilfe="konfiguration.fahrtzeiten-speichern">Fahrtzeiten speichern</button>`, { zurueck: `/konfiguration?jahr=${jahr}`, klasse: 'formular' })}
  ${karteiFormular('einstellung', `<input type="hidden" name="schluessel" value="praxis_adresse">
    <label>Praxisadresse für die Wegbeschreibung (Rückfahrt nach einem Hausbesuch)<input name="wert" value="${esc(e.praxis_adresse ?? '')}" maxlength="120" placeholder="Straße Nr., PLZ Ort" data-hilfe="konfiguration.praxis-adresse"></label>
    <button class="knopf klein">Speichern</button>`, { zurueck: `/konfiguration?jahr=${jahr}`, klasse: 'formular zeile' })}
</div>
`;
}

/** Abschnitt „Regelbehandlungszeiten“ (W110) – je Leistungsnummer die Minuten aus der GKV-Liste, von Hand änderbar */
function regelzeitenAbschnitt(liste: Regelzeit[], jahr: number): string {
  const formRz = (aktion: string, inhalt: string, klasse = 'inline') => karteiFormular(aktion, inhalt, { zurueck: `/konfiguration?jahr=${jahr}`, klasse });
  const minuten = (name: string, wert: number | null, pflicht: boolean) =>
    `<input name="${name}" value="${wert ?? ''}" inputmode="numeric" class="kurz" aria-label="${name === 'von_min' ? 'von' : 'bis'} Minuten"${pflicht ? ' required' : ''}>`;
  return `<h2 id="regelzeiten">Regelbehandlungszeiten</h2>
<div class="tafel" data-hilfe="konfiguration.regelzeiten">
  <p class="hint">Rezepte nennen die Anzahl der Behandlungen, nicht die Minuten. Die Dauer je Heilmittel kommt aus der Heilmittel-Richtlinie – hier als Regelbehandlungszeit je Leistungsnummer, übernommen aus der GKV-Vergütungsliste („15–25 Minuten“). Terminvorschläge zu einem Rezept nehmen die obere Grenze, auf 5 Minuten gerundet (W110). Werte von Hand bleiben beim Übernehmen stehen.</p>
  ${formRz('regelzeiten_uebernehmen', `<button class="knopf klein" data-hilfe="konfiguration.regelzeiten-uebernehmen">${symbol('rezept', { groesse: 16 })} Aus der GKV-Liste übernehmen</button>`)}
  ${liste.length ? `<details class="regelzeiten-liste"><summary class="knopf klein" data-hilfe="konfiguration.regelzeiten-liste">${liste.length} Regelbehandlungszeiten anzeigen</summary>
    <div class="tabelle"><table class="regelzeiten"><thead><tr><th>Nr.</th><th>Leistung</th><th>Regelzeit (Minuten)</th><th>Quelle</th></tr></thead><tbody>${liste.map((r) => `<tr>
      <td>${esc(r.nummer)}</td><td>${esc(r.bezeichnung)}</td>
      <td>${formRz('regelzeit_setzen', `<input type="hidden" name="nummer" value="${esc(r.nummer)}">${minuten('von_min', r.vonMin, false)} – ${minuten('bis_min', r.bisMin, true)}<button class="knopf klein" data-hilfe="konfiguration.regelzeit-speichern">Speichern</button>`)}</td>
      <td>${esc(REGELZEIT_QUELLE_TEXT[r.quelle] ?? r.quelle)} · ${datumText(r.geaendertAm.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div></details>`
    : '<p class="leer">Noch keine Regelbehandlungszeiten – aus der GKV-Liste übernehmen oder unten eintragen.</p>'}
  <h3>Regelzeit eintragen</h3>
  ${formRz('regelzeit_setzen', `<div class="zwei"><label>Leistungsnummer<input name="nummer" required maxlength="12" placeholder="z. B. 20501" class="kurz"></label><label>Bezeichnung<input name="bezeichnung" maxlength="80" placeholder="z. B. Krankengymnastik"></label></div>
    <div class="zwei"><label>von (Minuten, optional)<input name="von_min" inputmode="numeric" class="kurz"></label><label>bis (Minuten)<input name="bis_min" inputmode="numeric" class="kurz" required></label></div>
    <button class="knopf klein" data-hilfe="konfiguration.regelzeit-neu">Regelzeit eintragen</button>`, 'formular')}
</div>
`;
}

/** Ein Formular für Anlegen und Bearbeiten (W115) */
export function textbausteinFormularSeite(b: Textbaustein | undefined, o: Rahmen): string {
  const titel = b ? `Textbaustein ${b.code} bearbeiten` : 'Neuer Textbaustein';
  return seite({
    titel, aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/konfiguration', text: 'Konfiguration' }], titel, symbol: 'protokoll', aktion: 'textbaustein_speichern',
      zurueck: b ? `/konfiguration/textbausteine/${b.id}` : '/konfiguration/textbausteine/neu', abbrechen: '/konfiguration',
      hilfe: 'textbaustein.formular', knopf: b ? 'Speichern' : 'Anlegen', knopfHilfe: 'textbaustein.speichern', oben: meldungen(o),
      felder: `${b ? `<input type="hidden" name="textbaustein_id" value="${b.id}">` : ''}
  <label>Kurzname (oben auf der Kachel)<input name="kurzname" value="${esc(b?.kurzname ?? '')}" required maxlength="60" placeholder="z. B. Dank"></label>
  <label>Text (steht unter den Positionen der Rechnung)<textarea name="text" rows="4" required>${esc(b?.text ?? '')}</textarea></label>
  <div class="zwei"><label>Wirkung${wahl('wirkung', WIRKUNG_TEXT, b?.wirkung ?? 'keine')}</label><label>Automatisch dabei${wahl('automatisch', AUTOMATISCH_TEXT, b?.automatisch ?? 'nie')}</label></div>`,
      hinweis: b ? 'Bestehende Rechnungen behalten ihre Kopie des Textes.' : 'Die Kennung (R + Nummer) vergibt das System.',
    }),
  });
}

export function konfigurationSeite(d: { textbausteine: Textbaustein[]; einstellungen: Record<string, string>; freieTage: FreieTageDaten; regelzeiten: Regelzeit[] }, o: Rahmen): string {
  const kacheln = d.textbausteine.map((b) => `<article class="tbk${b.aktiv ? '' : ' ab'}" data-hilfe="konfiguration.textbaustein">
    <header><span class="tbk-code">${esc(b.code)}</span><b>${esc(b.kurzname)}</b></header>
    <p class="rz-marken"><span class="marke${b.wirkung === 'keine' ? '' : ' jetzt'}">${esc(WIRKUNG_TEXT[b.wirkung])}</span><span class="marke">${esc(AUTOMATISCH_TEXT[b.automatisch])}</span></p>
    ${stift(`/konfiguration/textbausteine/${b.id}`, 'konfiguration.textbaustein.bearbeiten', { fenster: 'Textbaustein bearbeiten', text: 'Textbaustein bearbeiten' })}
    ${form('textbaustein_aktiv', `<input type="hidden" name="textbaustein_id" value="${b.id}"><input type="hidden" name="aktiv" value="${b.aktiv ? '0' : '1'}"><button class="knopf klein" data-hilfe="konfiguration.textbaustein.aktiv">${b.aktiv ? 'ausblenden' : 'anbieten'}</button>`)}
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
<div class="tbk-raster">${plusKachel({ text: 'Neuer Textbaustein', hilfe: 'konfiguration.textbaustein.neu', href: '/konfiguration/textbausteine/neu' })}${kacheln}</div>

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

<h2>Bankverbindung für den GiroCode</h2>
<div class="tafel">
  <p class="hint">Mit IBAN entsteht zu jeder Rechnung aus Lexware ein GiroCode: Der Patient scannt ihn mit der Banking-App, IBAN, Betrag und Rechnungsnummer sind vorbelegt – so ordnet Lexware die Zahlung automatisch zu (W102). Der Code steht auf der Rechnungsseite und hängt an der Rechnungs-Mail.</p>
  ${form('einstellung', `<input type="hidden" name="schluessel" value="bank_inhaber">
    <label>Kontoinhaber<input name="wert" value="${esc(d.einstellungen.bank_inhaber ?? '')}" maxlength="70" placeholder="Praxis Lilli Nebel" data-hilfe="konfiguration.bank-inhaber"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="bank_iban">
    <label>IBAN<input name="wert" value="${esc(d.einstellungen.bank_iban ?? '')}" maxlength="42" placeholder="DE.." autocomplete="off" data-hilfe="konfiguration.bank-iban"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="bank_bic">
    <label>BIC (optional)<input name="wert" value="${esc(d.einstellungen.bank_bic ?? '')}" maxlength="11" class="kurz" autocomplete="off" data-hilfe="konfiguration.bank-bic"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
</div>

${oeffnungszeitenAbschnitt(d.einstellungen, d.freieTage.jahr)}
${freieTageAbschnitt(d.freieTage, d.einstellungen)}
${regelzeitenAbschnitt(d.regelzeiten, d.freieTage.jahr)}
${fahrtzeitenAbschnitt(d.einstellungen, d.freieTage.jahr)}
<h2>Termine und Terminanfragen</h2>
<div class="tafel">
  <p><a class="knopf primaer" href="/konfiguration/terminarten" data-hilfe="konfiguration.terminarten">${symbol('kalender', { groesse: 18 })} Terminarten für die Online-Anfrage (Kacheln)</a></p>
  ${form('einstellung', `<input type="hidden" name="schluessel" value="termin_dauer_min">
    <label>Dauer eines Termins in Minuten (Vorgabe für Vorschläge)<input name="wert" value="${esc(d.einstellungen.termin_dauer_min ?? '30')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.termin-dauer"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="termin_puffer_min">
    <label>Pause nach jedem Termin in Minuten <span class="hint">(Standard – je Terminart änderbar; wird im Termin mitgeblockt)</span><input name="wert" value="${esc(d.einstellungen.termin_puffer_min ?? '0')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.puffer"></label>
    <button class="knopf klein">Speichern</button>`, 'formular zeile')}
  ${form('einstellung', `<input type="hidden" name="schluessel" value="mittagspause_min">
    <label>Mittagspause in Minuten <span class="hint">(Standard 60; liegt um 12 Uhr zwischen den Terminen, je Tag im Kalender änderbar, 0 = keine)</span><input name="wert" value="${esc(d.einstellungen.mittagspause_min ?? '60')}" inputmode="numeric" class="kurz" data-hilfe="konfiguration.mittagspause"></label>
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
