/**
 * Rechnungsseite (W79, W81): Kopf mit Status und Empfänger, Positionen als längliche Kacheln
 * (+ hinzufügen, ✎ bearbeiten, − entfernen), Summen, Textbausteine als Kacheln, Aktionen je Status.
 * Nummer und PDF kommen aus Lexware; bis zur Anbindung (Tarif XL) trägt Lilli die Nummer von Hand ein.
 */
import type { Textbaustein } from '../kartei/konfiguration.ts';
import type { Patient, WellnessLeistung } from '../kartei/patienten.ts';
import { ART_TEXT, STATUS_TEXT, type Rechnung } from '../kartei/rechnungen.ts';
import type { NummernKonflikt } from '../kartei/lexware-rechnungen.ts';
import { esc, seite } from './layout.ts';
import { datumText, euroText, preisText } from '../format.ts';
import { heuteBerlin } from '../zeit.ts';
import { meldungen, type Rahmen } from './bausteine.ts';
import { symbol } from './symbole.ts';


export interface RechnungSeiteDaten {
  patient: Patient;
  rechnung: Rechnung;
  textbausteine: Textbaustein[];
  /** Positionen der Preisliste des Patienten (für „+“) */
  preislistePositionen: { id: string; nummer: string; bezeichnung: string; preis: number | null }[];
  wellness: WellnessLeistung[];
  /** Die heute für den Patienten gültige Preisliste (W97) – weicht sie vom Entwurf ab, gibt es „Preise übernehmen“ */
  preislisteAktuell: { id: string; name: string } | null;
  /** Lexware angebunden – Klick 1 „Nach Lexware“ (W100) */
  lexware: boolean;
  /** Postfach verbunden – Klick 2 „Versenden“ per Mail */
  postfach: boolean;
  /** GiroCode als data:-Bild (W102) – bei offenen Rechnungen mit hinterlegter Bankverbindung */
  girocode: string | null;
  /** „Lexware hat die Nummer … vergeben, die hier schon steht“ (W120): Nummer und die andere Rechnung – für den Ein-Klick-Weg */
  nummernKonflikt: NummernKonflikt | null;
}


export const statusChip = (status: Rechnung['status']) => {
  const [t, f] = STATUS_TEXT[status] ?? [status, 'preset12'];
  return `<span class="chip ${f}">${esc(t)}</span>`;
};

export function rechnungSeite(d: RechnungSeiteDaten, o: Rahmen): string {
  const { patient: p, rechnung: r } = d;
  const name = `${p.vorname} ${p.nachname}`;
  const zurueck = `/patienten/${p.id}/rechnungen/${r.id}`;
  const form = (aktion: string, inhalt: string, klasse = 'inline') =>
    `<form method="post" action="/patienten/aktion" class="${klasse}"><input type="hidden" name="aktion" value="${aktion}"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="rechnung_id" value="${r.id}"><input type="hidden" name="zurueck" value="${esc(zurueck)}">${inhalt}</form>`;
  const entwurf = r.status === 'entwurf';
  const wellness = r.steuerklasse === 'wellness_19';
  const e = r.empfaenger;
  // Abweichung zu Lexware als Block unter dem Kopf – umbrechend, am Handy ganz lesbar (W120); beim Nummernkonflikt der Weg mit einem Klick
  const k = d.nummernKonflikt;
  const abweichung = r.lexware.abweichung ? `<div class="meldung fehler abweichung" data-hilfe="rechnung.abweichung" tabindex="0">${symbol('warnung', { groesse: 20 })}<span><b>Abweichung zu Lexware:</b> ${esc(r.lexware.abweichung)}${k ? `<br>${k.andere
    ? `Die Nummer <b>${esc(k.nummer)}</b> steht hier an <a href="/patienten/${k.andere.patientId}/rechnungen/${k.andere.id}" data-hilfe="rechnung.andere-rechnung">Rechnung Nr. ${esc(k.andere.id)} von ${esc(k.andere.patientName)}</a>. Lexware ist für Nummern maßgeblich: ein Klick trägt sie hier ein – die andere Rechnung gibt sie ab und bekommt einen Prüfhinweis.`
    : `Die Nummer <b>${esc(k.nummer)}</b> ist inzwischen frei – ein Klick trägt sie hier ein.`}
    ${form('rechnung_nummer', `<button class="knopf klein primaer" data-hilfe="rechnung.nummer-uebernehmen">${symbol('haken', { groesse: 16 })} Nummer ${esc(k.nummer)} hier eintragen</button>`)}` : ''}</span></div>` : '';
  const positionen = r.positionen.map((pos) => `<article class="rp${pos.behandlungLeistungId ? ' erledigt' : ''}" data-hilfe="rechnung.position">
    <span class="rp-datum">${pos.datum ? datumText(pos.datum) : '<span class="hint">ohne Datum</span>'}</span>
    <span class="rp-nr">${esc(pos.nummer ?? '')}</span>
    <span class="rp-text">${esc(pos.bezeichnung)}${pos.behandlungLeistungId ? ` <span class="marke jetzt">behandelt</span>` : pos.terminId ? ' <span class="marke">Termin</span>' : ''}</span>
    <span class="rp-menge">${pos.anzahl} × ${euroText(pos.einzelpreis)}</span>
    <span class="rp-betrag">${euroText(pos.betrag)}</span>
    ${entwurf ? `<details class="rp-edit"><summary class="knopf klein" data-hilfe="rechnung.position.bearbeiten" aria-label="Bearbeiten">✎</summary>
      ${form('rechnung_position_aendern', `<input type="hidden" name="position_id" value="${pos.id}">
        <label>Datum<input type="date" name="datum" value="${esc(pos.datum ?? '')}"></label><label>Bezeichnung<input name="bezeichnung" value="${esc(pos.bezeichnung)}" required></label>
        <label>Anzahl<input type="number" name="anzahl" value="${pos.anzahl}" min="1" class="kurz"></label><label>Einzelpreis €<input name="einzelpreis" value="${preisText(pos.einzelpreis)}" inputmode="decimal" class="kurz"></label>
        <button class="knopf klein primaer">Speichern</button>`, 'formular zeile')}</details>
      ${form('rechnung_position_loeschen', `<input type="hidden" name="position_id" value="${pos.id}"><button class="knopf klein warnend" data-hilfe="rechnung.position.entfernen" aria-label="Entfernen">−</button>`)}` : ''}
  </article>`).join('');
  const neuePosition = entwurf ? `<details class="rp neu" data-hilfe="rechnung.position.neu"><summary><span class="rp-plus">+</span> Position hinzufügen</summary>
    ${form('rechnung_position_hinzufuegen', (wellness
      ? `<label>Wellness-Leistung<select name="wellness_id" required>${d.wellness.map((w) => `<option value="${w.id}">${esc(w.code)} · ${esc(w.bezeichnung)} · ${euroText(w.preis)}</option>`).join('')}</select></label>`
      : `<label>Leistung aus der Preisliste${r.preisliste ? ` „${esc(r.preisliste.name)}“` : ''}<select name="nummer" required><option value="">bitte wählen …</option>${d.preislistePositionen.map((x) => `<option value="${esc(x.nummer)}">${esc(x.nummer)} · ${esc(x.bezeichnung)} · ${euroText(x.preis)}</option>`).join('')}</select></label>`)
      + `<label>Datum<input type="date" name="datum" value="${heuteBerlin()}"></label><label>Anzahl<input type="number" name="anzahl" value="1" min="1" class="kurz"></label>
         <label>Preis € (leer = aus der Liste)<input name="einzelpreis" inputmode="decimal" class="kurz"></label><button class="knopf primaer">Hinzufügen</button>`, 'formular zeile')}
  </details>` : '';
  const bausteine = r.bausteine.map((b) => `<article class="tb" data-hilfe="rechnung.textbaustein">
    <header><b>${esc(b.kurzname)}</b>${b.code ? `<span class="hint">${esc(b.code)}</span>` : ''}${b.wirkung === 'kleinunternehmer' ? '<span class="marke jetzt">keine USt</span>' : b.wirkung === 'steuerfrei_heilbehandlung' ? '<span class="marke jetzt">steuerfrei</span>' : ''}
      ${entwurf ? form('rechnung_baustein_entfernen', `<input type="hidden" name="baustein_id" value="${b.id}"><button class="knopf klein warnend" data-hilfe="rechnung.textbaustein.entfernen" aria-label="Entfernen">−</button>`) : ''}</header>
    ${entwurf ? form('rechnung_baustein_aendern', `<input type="hidden" name="baustein_id" value="${b.id}"><textarea name="text" rows="3">${esc(b.text)}</textarea><button class="knopf klein" data-hilfe="rechnung.textbaustein.text">Text übernehmen</button>`, 'formular') : `<p>${esc(b.text)}</p>`}
  </article>`).join('');
  const neuerBaustein = entwurf && d.textbausteine.length ? `<details class="tb neu" data-hilfe="rechnung.textbaustein.neu"><summary><span class="rp-plus">+</span> Text hinzufügen</summary>
    ${form('rechnung_baustein_hinzufuegen', `<label>Textbaustein<select name="textbaustein_id">${d.textbausteine.filter((b) => !r.bausteine.some((x) => x.code === b.code)).map((b) => `<option value="${b.id}">${esc(b.code)} · ${esc(b.kurzname)}</option>`).join('')}</select></label><button class="knopf primaer">Hinzufügen</button>`, 'formular zeile')}
  </details>` : '';
  const versandWunsch = { email: 'per Mail', post: 'per Post', beides: 'per Mail und Post' }[p.rechnungsversand];
  // Rechnung in zwei Klicks (W100): Klick 1 nach Lexware (Nummer, PDF), Klick 2 versenden über den Standardweg des Patienten
  const nachLexware = d.lexware && r.quelle !== 'lexware' ? form('rechnung_lexware', `<button class="knopf primaer" data-hilfe="rechnung.lexware">${symbol('euro', { groesse: 18 })} Nach Lexware – Nummer und PDF holen</button>`) : '';
  const VERSAND: Record<string, string> = { email: 'per Mail', post: 'per Post', beides: 'per Mail und Post' };
  const versenden = d.postfach ? form('rechnung_versenden', `<label>Versand<select name="versand_art" data-hilfe="rechnung.versand-art"><option value="${p.rechnungsversand}">${versandWunsch} (Wunsch des Patienten)</option>${(['email', 'post', 'beides'] as const).filter((a) => a !== p.rechnungsversand).map((a) => `<option value="${a}">${VERSAND[a]}</option>`).join('')}</select></label><button class="knopf primaer" data-hilfe="rechnung.versenden">${symbol('email', { groesse: 18 })} Versenden</button>`) : '';
  const aktionen = (() => {
    switch (r.status) {
      case 'entwurf': return `${nachLexware}${d.preislisteAktuell && d.preislisteAktuell.id !== r.preisliste?.id ? form('rechnung_preise', `<button class="knopf" data-hilfe="rechnung.preise">${symbol('euro', { groesse: 18 })} Preise aus „${esc(d.preislisteAktuell.name)}“ übernehmen</button>`) : ''}${form('rechnung_status', `<input type="hidden" name="status_aktion" value="fertig"><button class="knopf primaer" data-hilfe="rechnung.fertig">${symbol('haken', { groesse: 18 })} Fertig – an Lexware übertragen</button>`)}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="storno"><input name="grund" placeholder="Grund" maxlength="200" required><button class="knopf warnend" data-hilfe="rechnung.storno">Storno</button>`)}`;
      case 'freigegeben': return `${nachLexware || '<p class="hint">Lexware ist nicht angebunden – Rechnung in Lexware anlegen und die Nummer hier eintragen.</p>'}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="in_lexware"><label>Rechnungsnummer aus Lexware<input name="nummer" required maxlength="40"></label><label>Rechnungsdatum<input type="date" name="datum" value="${heuteBerlin()}"></label><button class="knopf primaer" data-hilfe="rechnung.nummer">Nummer eintragen</button>`, 'formular zeile')}
        ${d.lexware ? '' : `<button class="knopf" disabled data-hilfe="rechnung.nummer-holen">${symbol('euro', { groesse: 18 })} Nummer aus Lexware holen <small>(kommt mit XL)</small></button>`}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="zurueck"><button class="knopf" data-hilfe="ausgang.zurueck">Zurück in den Entwurf</button>`)}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="storno"><input name="grund" placeholder="Grund" maxlength="200" required><button class="knopf warnend" data-hilfe="rechnung.storno">Storno</button>`)}`;
      case 'in_lexware': return `${versenden}${form('rechnung_status', `<input type="hidden" name="status_aktion" value="versendet"><label>Versendet<select name="versand_art"><option value="${p.rechnungsversand}">${versandWunsch} (Wunsch des Patienten)</option><option value="email">per Mail</option><option value="post">per Post</option><option value="beides">per Mail und Post</option></select></label><button class="knopf primaer" data-hilfe="rechnung.versendet">${symbol('email', { groesse: 18 })} Als versendet vermerken</button>`, 'formular zeile')}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="storno"><input name="grund" placeholder="Grund" maxlength="200" required><button class="knopf warnend" data-hilfe="rechnung.storno">Storno</button>`)}`;
      case 'gesendet': return `${form('rechnung_status', `<input type="hidden" name="status_aktion" value="bezahlt"><label>Bezahlt am<input type="date" name="datum" value="${heuteBerlin()}"></label><button class="knopf primaer" data-hilfe="rechnung.bezahlt">${symbol('euro', { groesse: 18 })} Bezahlt</button>`, 'formular zeile')}
        ${form('rechnung_status', `<input type="hidden" name="status_aktion" value="storno"><input name="grund" placeholder="Grund" maxlength="200" required><button class="knopf warnend" data-hilfe="rechnung.storno">Storno</button>`)}`;
      default: return '';
    }
  })();
  return seite({
    titel: `Rechnung ${r.nummer ?? '(Entwurf)'} – ${name}`, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/patienten">Patienten</a> › <a href="/patienten/${p.id}#rechnungen">${esc(name)}</a> › Rechnung ${esc(r.nummer ?? `Entwurf Nr. ${r.id}`)}
  <a class="nur-desktop konfig-link" href="/konfiguration" data-hilfe="konfiguration.link">${symbol('protokoll', { groesse: 14 })} Konfiguration</a></p>
<header class="kopf"><h1>${symbol('euro', { groesse: 26 })} ${esc(ART_TEXT[r.art] ?? 'Rechnung')} ${r.nummer ? esc(r.nummer) : ''} ${statusChip(r.status)}</h1></header>
${abweichung}
${r.quelle === 'lexware' ? `<p class="meldung ok">${symbol('rechnung', { groesse: 18 })} Aus Lexware übernommen – Positionen, Rezept und Behandlung liegen hier nicht vor; die Datei ist die Rechnung${r.lexware.pdfName ? `: <a href="${zurueck}/pdf" data-pdf="${esc(r.nummer ?? r.lexware.pdfName)}">${esc(r.lexware.pdfName)}</a>` : ''}.</p>` : ''}
${meldungen(o)}
<div class="re-kopf">
  <div class="tafel" data-hilfe="rechnung.empfaenger" tabindex="0"><h2>Empfänger</h2><p>${esc(e.name)}${e.zusatz ? `<br>${esc(e.zusatz)}` : ''}${e.strasse ? `<br>${esc(e.strasse)}` : ''}${e.plz || e.ort ? `<br>${esc([e.plz, e.ort].filter(Boolean).join(' '))}` : ''}</p>
    <p class="hint">Versand laut Stammdaten: ${versandWunsch}${r.versendetAm ? ` · versendet ${datumText(r.versendetAm)}` : ''}</p></div>
  <div class="tafel"><h2>Rechnung</h2><dl class="liste-dl klein">
    <dt>Leistungsgruppe</dt><dd>${wellness ? `Wellness · ${r.ustSatz ? `${r.ustSatz} % USt` : 'keine USt (§ 19 UStG)'}` : 'Heilbehandlung · steuerfrei (§ 4 Nr. 14 UStG)'}</dd>
    <dt>Preisliste</dt><dd>${r.preisliste ? `<a href="/preislisten/${r.preisliste.id}">${esc(r.preisliste.name)}</a> <span class="hint">(Stand dieser Rechnung)</span>` : '<span class="warn">keine – Preise bitte von Hand</span>'}</dd>
    <dt>Datum</dt><dd>${r.datum ? datumText(r.datum) : 'bei Fertigstellung'}${r.faelligAm ? ` · fällig ${datumText(r.faelligAm)}` : ''}</dd>
    ${r.zeitraumVon ? `<dt>Zeitraum</dt><dd>${datumText(r.zeitraumVon)} – ${datumText(r.zeitraumBis)}</dd>` : ''}
    ${r.lexware.status ? `<dt>Lexware</dt><dd>${esc(r.lexware.status)}${k ? ` · Nummer dort ${esc(k.nummer)}` : ''}${r.lexware.geprueftAm ? ` · geprüft ${datumText(r.lexware.geprueftAm)}` : ''}${r.lexware.invoiceId ? ` · <a href="https://app.lexware.de/permalink/invoices/view/${esc(r.lexware.invoiceId)}" target="_blank" rel="noopener" data-hilfe="rechnung.lexware-link">in Lexware öffnen</a>` : ''}</dd>` : ''}
    ${r.zahlungen.map((z) => `<dt>Zahlung</dt><dd>${z.datum ? datumText(z.datum) : '–'} · ${euroText(z.betrag)} · ${esc(z.art)}</dd>`).join('')}
    ${r.stornoGrund ? `<dt>Storno</dt><dd>${datumText(r.storniertAm)} · ${esc(r.stornoGrund)}</dd>` : ''}
  </dl>${r.lexware.pdfAm ? `<a class="knopf klein" href="/patienten/${p.id}/rechnungen/${r.id}/pdf" data-pdf="${esc(r.nummer ?? 'Rechnung')}" data-hilfe="ausgang.pdf">${symbol('rechnung', { groesse: 16 })} PDF aus Lexware</a>` : ''}
  ${d.girocode ? `<figure class="girocode" data-hilfe="rechnung.girocode" tabindex="0"><img src="${d.girocode}" alt="GiroCode zum Bezahlen" width="150" height="150"><figcaption>GiroCode – mit der Banking-App scannen: ${euroText(r.betrag)}, Verwendungszweck ${esc(r.nummer ?? '')}</figcaption></figure>` : ''}</div>
</div>

<h2>Positionen</h2>
<div class="rp-liste">${positionen || '<p class="leer">Noch keine Position.</p>'}${neuePosition}</div>
<div class="re-summen" data-hilfe="rechnung.summen" tabindex="0">
  ${r.ustSatz ? `<span>Netto ${euroText(r.netto)}</span><span>USt ${r.ustSatz} % ${euroText(r.ust)}</span>` : '<span class="hint">keine Umsatzsteuer</span>'}<b>Gesamt ${euroText(r.betrag)}</b>
</div>

<h2>Text unter den Positionen</h2>
<div class="tb-liste">${bausteine || '<p class="leer">Kein Textbaustein.</p>'}${neuerBaustein}</div>

<h2>Weiter</h2>
<div class="knopfreihe re-aktionen">${aktionen || '<span class="hint">Nichts mehr zu tun.</span>'}</div>
<p class="hint">Pflichtangaben kommen aus Lexware (Praxisanschrift, Steuernummer, fortlaufende Nummer). Hier stehen Empfänger, Leistungsdatum je Position, Leistung mit Nummer, Einzelpreis und der Steuerhinweis – das, was PKV und Beihilfe für die Erstattung brauchen (dazu die Kopie des Rezepts).</p>`,
  });
}
