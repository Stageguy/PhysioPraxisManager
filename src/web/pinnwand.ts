/**
 * Patienten-Pinnwand (W76): jede Phase des Patientenwegs als Spalte (horizontal) oder Zeile
 * (vertikal), darin die Fälle als Karten im Kachel-Design. Klick auf die Karte öffnet die
 * Fall-Details; „+“ an jeder Karte legt Neues an. Karten lassen sich mit der Maus in eine andere
 * Phase ziehen – /praxis.js schickt das als Aktion „phase“, der Server prüft die Regeln.
 * Für den Desktop gebaut; am Handy wird die Pinnwand zur Liste, Verschieben geht dort über die Details.
 */
import type { Patient, PatientKurz, RechnungKurz, TerminKurz, VerordnungKurz } from '../kartei/patienten.ts';
import { ERKLAERUNG_ARTEN, PHASEN, PHASEN_NAMEN, type FallDetails, type Karte, type Phase, type Spalte } from '../kartei/pinnwand.ts';
import { esc, seite } from './layout.ts';
import { datumText, datumZeitText, euroText } from '../format.ts';
import { heuteBerlin } from '../zeit.ts';
import { formular, karteiFormular as form, meldungen, PLUS_ZEICHEN, plusKachel, type Rahmen } from './bausteine.ts';
import { rezeptKachel } from './rezepte.ts';
import { symbol } from './symbole.ts';

const tage = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);


const GRUNDLAGE: Record<string, [string, string]> = { verordnung: ['Rezept', 'jetzt'], direktzugang: ['Direktzugang', 'jetzt'], praevention: ['Wellness', ''] };

/** Die Fall-Karte – gleiches Design wie Patienten- und Rezept-Kacheln */
export function fallKarte(k: Karte, o: { ziehbar?: boolean } = {}): string {
  const [gText, gKlasse] = GRUNDLAGE[k.grundlage] ?? [k.grundlage, ''];
  const t = tage(k.seitPhase);
  return `<article class="fk ${k.rechnungsstand === 'rot' ? 'rot' : k.rechnungsstand === 'gelb' ? 'gelb' : ''}" data-hilfe="pinnwand.karte" data-fall="${k.fallId}" data-patient="${k.patientId}" data-phase="${k.phase}"${o.ziehbar === false ? '' : ' draggable="true"'} id="fk-${k.fallId}">
    <a class="fk-link" href="/patienten/${k.patientId}/faelle/${k.fallId}">
      <header class="fk-kopf"><b>${esc(k.patientName)}</b><span class="hint">${esc(k.patientennummer)}</span></header>
      <span class="fk-titel">Fall ${k.nummer}${k.bezeichnung ? ` · ${esc(k.bezeichnung)}` : ''}</span>
      <span class="rz-marken"><span class="marke ${gKlasse}">${gText}</span>${t !== null ? `<span class="marke">${t === 0 ? 'heute' : `${t} Tag${t === 1 ? '' : 'e'}`} hier</span>` : ''}</span>
      ${k.rezept ? `<span class="fk-balken" aria-label="${k.rezept.abgehakt} von ${k.rezept.anzahl}"><span style="width:${Math.min(100, Math.round((k.rezept.abgehakt / Math.max(1, k.rezept.anzahl)) * 100))}%"></span></span><span class="hint">Rezept ${k.rezept.abgehakt} von ${k.rezept.anzahl}</span>` : `<span class="hint">${k.behandlungen} Behandlung${k.behandlungen === 1 ? '' : 'en'}</span>`}
      <span class="hint">${k.naechsterTermin ? `Termin ${datumZeitText(k.naechsterTermin)}` : k.letzteBehandlung ? `zuletzt ${datumText(k.letzteBehandlung)}` : 'kein Termin'}</span>
      ${k.warnungen.length ? `<span class="fk-warn">${symbol('warnung', { groesse: 14 })} ${k.warnungen.map(esc).join(' · ')}</span>` : ''}
    </a>
    <details class="plus klein" data-hilfe="pinnwand.plus"><summary aria-label="Neues zu diesem Fall">${PLUS_ZEICHEN}</summary><div class="plus-menue">
      <a href="/patienten/${k.patientId}/neu/behandlung" data-hilfe="plus.behandlung">${symbol('haken', { groesse: 18 })} Behandlung erfassen</a>
      <a href="/patienten/${k.patientId}/neu/termin" data-hilfe="plus.termin">${symbol('kalender', { groesse: 18 })} Termin</a>
      <a href="/patienten/${k.patientId}/neu/rezept" data-hilfe="plus.rezept">${symbol('rezept', { groesse: 18 })} Rezept</a>
      <a href="/patienten/${k.patientId}/faelle/${k.fallId}#anamnese" data-hilfe="pinnwand.plus.anamnese">${symbol('protokoll', { groesse: 18 })} Anamnese / Befund</a>
      <a href="/patienten/${k.patientId}/faelle/${k.fallId}#erklaerungen" data-hilfe="pinnwand.plus.erklaerung">${symbol('freigabe', { groesse: 18 })} Einwilligung / Erklärung</a>
    </div></details>
  </article>`;
}

export function pinnwandSeite(d: { spalten: Spalte[]; ansicht: 'horizontal' | 'vertikal'; archiv: boolean }, o: Rahmen): string {
  const zurueck = `/pinnwand?ansicht=${d.ansicht}${d.archiv ? '&archiv=1' : ''}`;
  const spalten = d.spalten.map((sp) => `<section class="pw-phase" data-phase="${sp.phase}" data-hilfe="pinnwand.phase" aria-labelledby="ph-${sp.phase}">
    <header class="pw-kopf"><h2 id="ph-${sp.phase}">${esc(sp.name)} <span class="pw-zahl">${sp.karten.length}</span></h2><p class="hint">${esc(sp.text)}</p>
    </header>
    <div class="pw-karten">${sp.phase === 'anfrage' ? plusKachel({ text: 'Neuer Fall', hilfe: 'pinnwand.neu', href: '/pinnwand/neu' }) : ''}${sp.karten.map((k) => fallKarte(k)).join('') || (sp.phase === 'anfrage' ? '' : '<p class="pw-leer">–</p>')}</div>
  </section>`).join('');
  const anzahl = d.spalten.reduce((n, sp) => n + sp.karten.length, 0);
  return seite({
    titel: 'Patienten-Pinnwand', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<header class="kopf pw-titel"><h1>${symbol('pinnwand', { groesse: 26 })} Patienten-Pinnwand <span class="hint">${anzahl} Fälle</span></h1>
<div class="knopfreihe">
  <a class="knopf klein${d.ansicht === 'horizontal' ? ' primaer' : ''}" href="/pinnwand?ansicht=horizontal${d.archiv ? '&archiv=1' : ''}" data-hilfe="pinnwand.horizontal" data-ansicht="horizontal">Horizontal</a>
  <a class="knopf klein${d.ansicht === 'vertikal' ? ' primaer' : ''}" href="/pinnwand?ansicht=vertikal${d.archiv ? '&archiv=1' : ''}" data-hilfe="pinnwand.vertikal" data-ansicht="vertikal">Vertikal</a>
  <a class="knopf klein" href="/pinnwand?ansicht=${d.ansicht}${d.archiv ? '' : '&archiv=1'}" data-hilfe="pinnwand.archiv">${d.archiv ? 'Archiv ausblenden' : 'Archiv zeigen'}</a>
</div></header>${meldungen(o)}
<p class="hint nur-desktop">Karte ziehen = Phase wechseln. Weiter geht es nur, wenn die Daten des vorherigen Schritts vollständig sind; die Details der Karte zeigen, was fehlt. Zurück nur mit Grund (in den Details).</p>
<p class="meldung fehler" id="pwFehler" hidden role="alert"></p>
<div class="pinnwand ${d.ansicht}" id="pinnwand" data-zurueck="${esc(zurueck)}">${spalten}</div>`,
  });
}

export function fallNeuSeite(d: { patienten: PatientKurz[]; wellness: { id: string; bezeichnung: string }[] }, o: Rahmen): string {
  return seite({
    titel: 'Neuer Fall', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: formular({
      pfad: [{ href: '/pinnwand', text: 'Pinnwand' }], titel: 'Neuer Fall', symbol: 'pinnwand', aktion: 'fall_anlegen', zurueck: '/pinnwand/neu', abbrechen: '/pinnwand',
      hilfe: 'pinnwand.neu.formular', knopf: 'Fall anlegen (Phase Anfrage)', knopfHilfe: 'pinnwand.neu.anlegen', oben: meldungen(o),
      felder: `<label>Patient<select name="id" required><option value="">bitte wählen …</option>${d.patienten.map((p) => `<option value="${p.id}">${esc(`${p.nachname}, ${p.vorname}`)} (${esc(p.patientennummer)})</option>`).join('')}</select></label>
  <p class="hint">Noch nicht in der Kartei? Erst unter <a href="/patienten/neu">Patienten › Neu</a> anlegen.</p>
  <label>Grundlage<select name="grundlage"><option value="verordnung">ärztliche Verordnung (Rezept folgt)</option><option value="direktzugang">Direktzugang (Heilpraktikererlaubnis)</option><option value="praevention">Prävention / Wellness</option></select></label>
  <label>Wellness-Leistung (nur bei Wellness)<select name="wellness_id"><option value="">–</option>${d.wellness.map((w) => `<option value="${w.id}">${esc(w.bezeichnung)}</option>`).join('')}</select></label>
  <label>Kurzbezeichnung<input name="bezeichnung" maxlength="80" placeholder="z. B. Schulter rechts"></label>
  <label>Anlass (aus der Anfrage)<textarea name="anlass" rows="2"></textarea></label>`,
    }),
  });
}

// ── Fall-Details ────────────────────────────────────────────────────────────
export function fallSeite(d: { patient: Patient; details: FallDetails; verordnungen: VerordnungKurz[]; termine: TerminKurz[]; rechnungen: RechnungKurz[] }, o: Rahmen): string {
  const { patient: p, details: f } = d;
  const k = f.karte;
  const name = `${p.vorname} ${p.nachname}`;
  const zurueck = `/patienten/${p.id}/faelle/${k.fallId}`;
  const weg = PHASEN.map((ph) => {
    const i = PHASEN.indexOf(ph);
    const jetzt = ph === k.phase;
    const vorbei = i < PHASEN.indexOf(k.phase);
    const n = f.naechste.find((x) => x.phase === ph);
    return `<li class="${jetzt ? 'jetzt' : vorbei ? 'vorbei' : n && !n.fehlt.length ? 'bereit' : ''}" data-hilfe="fall.weg" tabindex="0"><b>${esc(PHASEN_NAMEN[ph])}</b>${n ? `<span class="hint">${n.fehlt.length ? `fehlt: ${n.fehlt.map(esc).join(', ')}` : 'bereit'}</span>` : ''}</li>`;
  }).join('');
  const phasenWahl = PHASEN.filter((ph) => ph !== k.phase).map((ph) => `<option value="${ph}">${esc(PHASEN_NAMEN[ph])}</option>`).join('');
  const a = f.anamnese;
  const befunde = f.befunde.map((b) => `<li data-hilfe="fall.befund" tabindex="0"><b>${esc({ eingang: 'Eingangsbefund', verlauf: 'Verlaufsbefund', abschluss: 'Abschlussbefund' }[b.art] ?? b.art)}</b> <span class="hint">${datumText(b.erhobenAm)}</span><br>${esc(b.text ?? '')}${b.messwerte ? `<br><span class="hint">Messwerte: ${esc(b.messwerte)}</span>` : ''}</li>`).join('');
  const erklaerungen = f.erklaerungen.map((e) => `<li class="${e.widerrufenAm ? 'ab' : ''}" data-hilfe="fall.erklaerung" tabindex="0"><span class="kanal-sym">${symbol('freigabe', { groesse: 18 })}</span><span><b>${esc(ERKLAERUNG_ARTEN[e.art] ?? e.art)}</b> <span class="hint">${datumText(e.am)} · ${esc(e.form)}${e.fassung ? ` · ${esc(e.fassung)}` : ''}${e.gueltigBis ? ` · bis ${datumText(e.gueltigBis)}` : ''}${e.fallId ? '' : ' · gilt für alle Fälle'}${e.widerrufenAm ? ` · widerrufen ${datumText(e.widerrufenAm)}` : ''}</span>${e.inhalt ? `<br>${esc(e.inhalt)}` : ''}</span>
    ${e.widerrufenAm ? '' : `<span class="rechts">${form('erklaerung_widerrufen', `<input type="hidden" name="erklaerung_id" value="${e.id}"><input type="hidden" name="fall_id" value="${k.fallId}"><input name="grund" placeholder="Grund" maxlength="120"><button class="knopf klein warnend" data-hilfe="fall.erklaerung.widerrufen">widerrufen</button>`, { id: p.id, zurueck })}</span>`}</li>`).join('');
  const phasen = f.phasen.map((ph) => `<li><span class="zeit">${datumZeitText(ph.am)}</span><span>${ph.von ? `${esc(PHASEN_NAMEN[ph.von])} → ` : ''}<b>${esc(PHASEN_NAMEN[ph.nach])}</b> <span class="hint">${esc(ph.wer)}${ph.grund ? ` · ${esc(ph.grund)}` : ''}</span></span></li>`).join('');
  const termine = d.termine.map((t) => `<li><span class="zeit">${datumZeitText(t.beginn)}</span><span>${esc(t.art)} <span class="marke${t.verordnungId ? ' jetzt' : ''}">${t.verordnungId ? 'Rezept' : 'Individual'}</span></span></li>`).join('');
  const rechnungen = d.rechnungen.map((r) => `<li><span class="zeit">${datumText(r.datum)}</span><span>${esc(r.nummer ?? r.art)} · ${euroText(r.betrag)} <span class="chip ${r.status === 'bezahlt' ? 'preset19' : 'preset3'}">${esc(r.status)}</span></span></li>`).join('');
  return seite({
    titel: `Fall ${k.nummer} – ${name}`, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/pinnwand">Pinnwand</a> › <a href="/patienten/${p.id}">${esc(name)}</a> › Fall ${k.nummer}</p>
<div class="fall-kopf"><div>${fallKarte(k, { ziehbar: false })}</div>
  <div class="tafel"><h2>Patientenweg</h2><ol class="weg" data-hilfe="fall.weg-liste">${weg}</ol>
    ${form('phase', `<input type="hidden" name="fall_id" value="${k.fallId}"><label>Phase verschieben<select name="nach" data-hilfe="fall.phase">${phasenWahl}</select></label><label>Grund (Pflicht bei zurück)<input name="grund" maxlength="200"></label><button class="knopf klein" data-hilfe="fall.phase.setzen">Verschieben</button>`, { id: p.id, zurueck, klasse: 'formular zeile' })}
  </div>
</div>${meldungen(o)}
<div class="knopfreihe">
  <a class="knopf primaer" href="/patienten/${p.id}/neu/behandlung" data-hilfe="plus.behandlung">${symbol('haken', { groesse: 18 })} Behandlung erfassen</a>
  <a class="knopf" href="/patienten/${p.id}/akte" data-hilfe="patient.akte">${symbol('protokoll', { groesse: 18 })} Akte</a>
  <a class="knopf" href="/patienten/${p.id}" data-hilfe="fall.patient">${symbol('patient', { groesse: 18 })} Patient</a>
</div>

<section class="pat-abschnitt"><h2>${symbol('protokoll')} Fall</h2><div class="tafel"><dl class="liste-dl">
  <dt>Grundlage</dt><dd>${esc(GRUNDLAGE[k.grundlage]?.[0] ?? k.grundlage)} · ${f.steuerklasse === 'wellness_19' ? '19 % USt' : 'Heilbehandlung, steuerfrei'}</dd>
  <dt>Zeitraum</dt><dd>${datumText(f.begonnenAm)} – ${f.abgeschlossenAm ? datumText(f.abgeschlossenAm) : 'laufend'}</dd>
  ${f.anlass ? `<dt>Anlass</dt><dd>${esc(f.anlass)}</dd>` : ''}${f.diagnoseArzt ? `<dt>Diagnose (ärztlich)</dt><dd>${esc(f.diagnoseArzt)}</dd>` : ''}${f.therapieziele ? `<dt>Therapieziele</dt><dd>${esc(f.therapieziele)}</dd>` : ''}
</dl></div></section>

<section class="pat-abschnitt" id="rezepte"><h2>${symbol('rezept')} Rezepte dieses Falls</h2>
  <div class="rz-raster">${plusKachel({ text: 'Neues Rezept', hilfe: 'plus.rezept', href: `/patienten/${p.id}/neu/rezept` })}${d.verordnungen.map((v) => rezeptKachel(v, { zurueck })).join('')}</div>
  ${d.verordnungen.length ? '' : '<p class="leer">Kein Rezept am Fall.</p>'}
</section>

<section class="pat-abschnitt" id="anamnese"><h2>${symbol('protokoll')} Anamnese</h2>
  ${a ? `<div class="tafel" data-hilfe="fall.anamnese" tabindex="0"><p class="hint">${datumText(a.erhobenAm)} · ${esc(a.art)}</p><dl class="liste-dl">
    <dt>Beschwerden</dt><dd>${esc(a.beschwerden ?? '')}</dd>${a.vorgeschichte ? `<dt>Vorgeschichte</dt><dd>${esc(a.vorgeschichte)}</dd>` : ''}${a.medikamente ? `<dt>Medikamente</dt><dd>${esc(a.medikamente)}</dd>` : ''}
    ${a.allergien ? `<dt>Allergien</dt><dd>${esc(a.allergien)}</dd>` : ''}${a.risiken ? `<dt>Risiken / Kontraindikationen</dt><dd>${esc(a.risiken)}</dd>` : ''}${a.sonstiges ? `<dt>Sonstiges</dt><dd>${esc(a.sonstiges)}</dd>` : ''}</dl></div>` : '<p class="leer">Noch keine Anamnese.</p>'}
  <details class="mehr-form"><summary class="knopf klein" data-hilfe="fall.anamnese.neu">${a ? 'Neue Fassung der Anamnese' : 'Anamnese erfassen'}</summary>
  ${form('anamnese_erfassen', `<input type="hidden" name="fall_id" value="${k.fallId}">
    <div class="zwei"><label>Datum<input type="date" name="erhoben_am" value="${heuteBerlin()}"></label><label>Art<select name="art"><option value="gespraech">im Gespräch</option><option value="online">online vorab</option><option value="tablet">Tablet in der Praxis</option><option value="uebernommen">aus früherem Fall übernommen</option></select></label></div>
    <label>Beschwerden / Behandlungsanlass (Pflicht)<textarea name="beschwerden" rows="3" required>${esc(a?.beschwerden ?? '')}</textarea></label>
    <label>Relevante Vorgeschichte<textarea name="vorgeschichte" rows="2">${esc(a?.vorgeschichte ?? '')}</textarea></label>
    <div class="zwei"><label>Medikamente<input name="medikamente" value="${esc(a?.medikamente ?? '')}"></label><label>Allergien<input name="allergien" value="${esc(a?.allergien ?? '')}"></label></div>
    <label>Kontraindikationen, Risiken<input name="risiken" value="${esc(a?.risiken ?? '')}"></label><label>Sonstiges<input name="sonstiges" value="${esc(a?.sonstiges ?? '')}"></label>
    <p class="hint">Eine neue Fassung ersetzt die alte; die alte bleibt in der Akte lesbar (§ 630f).</p><button class="knopf primaer">Anamnese speichern</button>`, { id: p.id, zurueck, klasse: 'formular' })}
  </details>
</section>

<section class="pat-abschnitt" id="befunde"><h2>${symbol('auge')} Befunde</h2>
  ${befunde ? `<ul class="befunde">${befunde}</ul>` : '<p class="leer">Noch kein Befund.</p>'}
  <details class="mehr-form"><summary class="knopf klein" data-hilfe="fall.befund.neu">Befund erfassen</summary>
  ${form('befund_erfassen', `<input type="hidden" name="fall_id" value="${k.fallId}">
    <div class="zwei"><label>Datum<input type="date" name="erhoben_am" value="${heuteBerlin()}"></label><label>Art<select name="art"><option value="eingang">Eingangsbefund</option><option value="verlauf">Verlaufsbefund</option><option value="abschluss">Abschlussbefund</option></select></label></div>
    <label>Befund (Beweglichkeit, Kraft, Schmerz, Funktion …)<textarea name="text" rows="3" required></textarea></label>
    <label>Messwerte (frei, z. B. „Schulter Flexion re 120°, NRS 6/10“)<input name="messwerte" maxlength="500"></label>
    <button class="knopf primaer">Befund speichern</button>`, { id: p.id, zurueck, klasse: 'formular' })}
  </details>
</section>

<section class="pat-abschnitt" id="erklaerungen"><h2>${symbol('freigabe')} Einwilligungen und Erklärungen</h2>
  ${erklaerungen ? `<ul class="kanaele">${erklaerungen}</ul>` : '<p class="leer">Noch keine Erklärung – für die Anamnese braucht es Behandlungseinwilligung und Datenschutzinformation.</p>'}
  <details class="mehr-form"><summary class="knopf klein" data-hilfe="fall.erklaerung.neu">Erklärung erfassen</summary>
  ${form('erklaerung_erfassen', `<input type="hidden" name="fall_id" value="${k.fallId}">
    <div class="zwei"><label>Art<select name="art">${Object.entries(ERKLAERUNG_ARTEN).map(([key, t]) => `<option value="${key}">${esc(t)}</option>`).join('')}</select></label>
      <label>Form<select name="form"><option value="schriftlich">schriftlich</option><option value="muendlich">mündlich</option><option value="textform">Textform (Mail)</option><option value="elektronisch">elektronisch</option></select></label></div>
    <div class="zwei"><label>Datum<input type="date" name="am" value="${heuteBerlin()}"></label><label>Fassung des Textes<input name="fassung" placeholder="z. B. Datenschutzinfo 2026-01" maxlength="80"></label></div>
    <label>Inhalt (worüber aufgeklärt, wozu eingewilligt, welche Kosten)<textarea name="inhalt" rows="2"></textarea></label>
    <button class="knopf primaer">Erklärung speichern</button>`, { id: p.id, zurueck, klasse: 'formular' })}
  </details>
</section>

<div class="fall-zwei">
  <section class="pat-abschnitt"><h2>${symbol('kalender')} Termine</h2>${termine ? `<ul class="zeilen">${termine}</ul>` : '<p class="leer">Keine kommenden Termine.</p>'}</section>
  <section class="pat-abschnitt"><h2>${symbol('euro')} Rechnungen</h2>${rechnungen ? `<ul class="zeilen">${rechnungen}</ul>` : '<p class="leer">Keine Rechnung.</p>'}</section>
</div>

<section class="pat-abschnitt"><h2>${symbol('pinnwand')} Phasenprotokoll</h2><ul class="zeilen" data-hilfe="fall.phasen">${phasen}</ul></section>`,
  });
}
