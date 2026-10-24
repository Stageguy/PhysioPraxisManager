/**
 * Rezepte als eigene Entität (W73): Kacheln für Rezepte (sieben Rezeptarten) und für Serien ohne
 * Rezept – Direktzugang (sektorale Heilpraktikererlaubnis) und Wellness aus dem eigenen Katalog (W74).
 * /rezepte zeigt alle, die Patientenseite nur die des Patienten.
 */
import type { NeuAktionDaten, RezepteDaten } from '../kartei/dienst.ts';
import { VERORDNUNG_ARTEN, type Patient, type Serie, type VerordnungKurz, type WellnessLeistung } from '../kartei/patienten.ts';
import { esc, seite } from './layout.ts';
import { symbol } from './symbole.ts';

const datum = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : '–';
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

const form = (aktion: string, inhalt: string, o: { id?: string; zurueck: string; klasse?: string }) =>
  `<form method="post" action="/patienten/aktion" class="${o.klasse ?? 'inline'}"><input type="hidden" name="aktion" value="${aktion}">${o.id ? `<input type="hidden" name="id" value="${o.id}">` : ''}<input type="hidden" name="zurueck" value="${esc(o.zurueck)}">${inhalt}</form>`;
const meldungen = (o: { meldung?: string; fehler?: string }) =>
  `${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}`;

const STATUS: Record<string, [string, string]> = { aktiv: ['aktiv', 'preset4'], abgeschlossen: ['abgeschlossen', 'preset19'], abgebrochen: ['abgebrochen', 'preset0'], ersetzt: ['ersetzt (korrigiert)', 'preset12'] };

/** Rezept-Kachel: Stempelkarte, Rezeptart, Langzeit, Vorgänger, Zweitschrift */
export function rezeptKachel(v: VerordnungKurz, o: { mitPatient?: boolean; zurueck: string }): string {
  const [st, farbe] = STATUS[v.status] ?? [v.status, 'preset12'];
  const punkte = Array.from({ length: Math.min(v.anzahlVerordnet, 30) }, (_, i) => `<i class="${i < v.abgehakt ? 'voll' : ''}"></i>`).join('');
  const aktionen = v.status === 'aktiv' ? `<details class="rz-mehr"><summary class="knopf klein" data-hilfe="rezept.mehr">mehr …</summary><div class="rz-aktionen">
      ${form('zweitschrift', `<input type="hidden" name="verordnung_id" value="${v.id}"><button class="knopf klein" data-hilfe="rezept.zweitschrift">Zweitschrift vermerken</button>`, { id: v.patientId, zurueck: o.zurueck })}
      ${form('verordnung_abbrechen', `<input type="hidden" name="verordnung_id" value="${v.id}"><input name="grund" placeholder="Grund (Pflicht)" required maxlength="200"><button class="knopf klein warnend" data-hilfe="rezept.abbrechen">Rezept abbrechen</button>`, { id: v.patientId, zurueck: o.zurueck })}
      <a class="knopf klein" href="/patienten/${v.patientId}/neu/rezept?vorgaenger=${v.id}" data-hilfe="rezept.folge">Folgerezept / Korrektur</a>
    </div></details>` : '';
  return `<article class="rz ${v.status}" data-hilfe="rezepte.kachel" id="rz-${v.id}">
    <header class="rz-kopf">${symbol('rezept', { groesse: 20 })}<b>${esc(v.massnahme)}</b><span class="chip ${farbe}">${st}</span></header>
    ${o.mitPatient ? `<a class="rz-patient" href="/patienten/${v.patientId}#rezepte">${esc(v.patientName)}</a>` : ''}
    <p class="rz-marken"><span class="marke">${esc(VERORDNUNG_ARTEN[v.art])}</span>${v.langzeit ? '<span class="marke jetzt">Langzeitbehandlung</span>' : ''}${v.zweitschriftAm ? `<span class="marke">Zweitschrift ${datum(v.zweitschriftAm)}</span>` : ''}${v.vorgaengerId ? `<a class="marke" href="#rz-${v.vorgaengerId}">↑ Vorgänger</a>` : ''}</p>
    <dl class="liste-dl klein">
      <dt>Ausgestellt</dt><dd>${datum(v.ausgestelltAm)}${v.arzt ? ` · ${esc(v.arzt)}` : ''}</dd>
      ${v.leistungNummer || v.frequenz ? `<dt>Leistung</dt><dd>${v.leistungNummer ? `Nr. ${esc(v.leistungNummer)}` : ''}${v.frequenz ? ` · ${esc(v.frequenz)}` : ''}</dd>` : ''}
      ${v.gueltigBis ? `<dt>Gültig bis</dt><dd>${datum(v.gueltigBis)}${v.gueltigBis < heute() && v.status === 'aktiv' ? ' <span class="warn">abgelaufen</span>' : ''}</dd>` : ''}
      ${v.fallNummer ? `<dt>Fall</dt><dd>Fall ${v.fallNummer}</dd>` : ''}
      ${v.notiz ? `<dt>Notiz</dt><dd>${esc(v.notiz)}</dd>` : ''}
    </dl>
    <div class="stempel" aria-label="${v.abgehakt} von ${v.anzahlVerordnet}">${punkte}<span>${v.abgehakt} von ${v.anzahlVerordnet}</span></div>
    ${aktionen}
  </article>`;
}

/** Serie ohne Rezept: Direktzugang oder Wellness */
export function serieKachel(s: Serie, o: { mitPatient?: boolean; zurueck: string }): string {
  const wellness = s.grundlage === 'praevention';
  return `<article class="rz serie ${s.abgeschlossenAm ? 'abgeschlossen' : 'aktiv'}" data-hilfe="${wellness ? 'serie.wellness' : 'serie.direktzugang'}" id="fall-${s.id}">
    <header class="rz-kopf">${symbol(wellness ? 'wellness' : 'freigabe', { groesse: 20 })}<b>${esc(s.bezeichnung ?? (wellness ? 'Wellness' : 'Behandlung ohne Rezept'))}</b><span class="chip ${s.abgeschlossenAm ? 'preset19' : 'preset4'}">${s.abgeschlossenAm ? 'abgeschlossen' : 'laufend'}</span></header>
    ${o.mitPatient ? `<a class="rz-patient" href="/patienten/${s.patientId}#rezepte">${esc(s.patientName)}</a>` : ''}
    <p class="rz-marken"><span class="marke${wellness ? '' : ' jetzt'}">${wellness ? 'Wellness · 19 % USt' : 'Direktzugang · Heilpraktikererlaubnis'}</span></p>
    <dl class="liste-dl klein">
      ${s.wellness ? `<dt>Leistung</dt><dd>${esc(s.wellness.bezeichnung)} · ${euro(s.wellness.preis)}</dd>` : ''}
      <dt>Fall</dt><dd>Fall ${s.nummer} · seit ${datum(s.begonnenAm)}${s.abgeschlossenAm ? ` bis ${datum(s.abgeschlossenAm)}` : ''}</dd>
      <dt>Behandlungen</dt><dd>${s.behandlungen}${s.letzteAm ? ` · zuletzt ${datum(s.letzteAm)}` : ''}</dd>
    </dl>
    ${s.abgeschlossenAm ? '' : form('serie_abschliessen', `<input type="hidden" name="fall_id" value="${s.id}"><button class="knopf klein" data-hilfe="serie.abschliessen">Serie abschließen</button>`, { id: s.patientId, zurueck: o.zurueck })}
  </article>`;
}

/** Die Knöpfe zum Hinzufügen – auf der Patientenseite unter den Kacheln */
export const serienKnoepfe = (patientId: string) => `<div class="knopfreihe">
  <a class="knopf klein" href="/patienten/${patientId}/neu/rezept" data-hilfe="plus.rezept">${symbol('rezept', { groesse: 16 })} Neues Rezept</a>
  <a class="knopf klein" href="/patienten/${patientId}/neu/direktzugang" data-hilfe="plus.direktzugang">${symbol('freigabe', { groesse: 16 })} Behandlung ohne Rezept</a>
  <a class="knopf klein" href="/patienten/${patientId}/neu/wellness" data-hilfe="plus.wellness">${symbol('wellness', { groesse: 16 })} Wellness</a>
</div>`;

// ── /rezepte ────────────────────────────────────────────────────────────────
export function rezepteSeite(d: RezepteDaten, o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const zurueck = `/rezepte?filter=${d.filter}`;
  const kacheln = [...d.verordnungen.map((v) => rezeptKachel(v, { mitPatient: true, zurueck })), ...d.serien.map((s) => serieKachel(s, { mitPatient: true, zurueck }))];
  return seite({
    titel: 'Rezepte', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<h1>${symbol('rezept', { groesse: 26 })} Rezepte und Behandlungsserien</h1>${meldungen(o)}
<form method="get" action="/rezepte" class="filter">
  <label>Anzeigen<select name="filter" data-auto-senden data-hilfe="rezepte.filter"><option value="aktiv"${d.filter === 'aktiv' ? ' selected' : ''}>nur aktive</option><option value="alle"${d.filter === 'alle' ? ' selected' : ''}>alle</option></select></label>
  <button class="knopf klein nur-ohne-js">anzeigen</button>
  <a class="knopf" href="/patienten" data-hilfe="rezepte.patient-waehlen">${symbol('patient', { groesse: 18 })} Neu: beim Patienten über „+“</a>
  <a class="knopf" href="/rezepte/wellness" data-hilfe="rezepte.wellness-katalog">${symbol('wellness', { groesse: 18 })} Wellness-Katalog</a>
</form>
<p class="hint">Rezeptarten: Erstrezept · Folgerezept (unverändert / angepasst) · erneute Verordnung bei Wiederaufnahme · Korrektur (ersetzt ein Rezept, kein neues Kontingent) · Zweitschrift (nur Vermerk). „Langzeitbehandlung“ ist ein Zusatzmerkmal. Behandlung ohne Rezept (Direktzugang) und Wellness sind eigene Serien, keine Rezeptart.</p>
${kacheln.length ? `<div class="rz-raster">${kacheln.join('')}</div>` : '<p class="leer">Keine Rezepte oder Serien in dieser Ansicht.</p>'}`,
  });
}

// ── Wellness-Katalog ────────────────────────────────────────────────────────
export function wellnessSeite(liste: WellnessLeistung[], o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const zurueck = '/rezepte/wellness';
  const zeilen = liste.map((w) => `<tr class="${w.aktiv ? '' : 'ab'}" data-hilfe="wellness.zeile">
    <td class="kuerzel">${esc(w.code)}</td><td>${esc(w.bezeichnung)}</td><td class="zahlspalte">${w.dauerMin ?? '–'}</td><td class="zahlspalte">${euro(w.preis)}</td>
    <td>${form('wellness_aktiv', `<input type="hidden" name="wellness_id" value="${w.id}"><input type="hidden" name="aktiv" value="${w.aktiv ? '0' : '1'}"><button class="knopf klein" data-hilfe="wellness.aktiv">${w.aktiv ? 'ausblenden' : 'anbieten'}</button>`, { zurueck })}</td>
  </tr>`).join('');
  return seite({
    titel: 'Wellness-Katalog', aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/rezepte">Rezepte</a> › Wellness-Katalog</p><h1>${symbol('wellness', { groesse: 26 })} Wellness-Katalog</h1>${meldungen(o)}
<p class="hint">Leistungen ohne Krankheitsbezug – nicht aus der GKV-Liste, immer mit 19 % Umsatzsteuer und nie mit Heilbehandlung auf einer Rechnung gemischt. Preise und Dauer legt Lilli fest (Frage 10, E9).</p>
${liste.length ? `<div class="tabelle"><table><thead><tr><th>Kürzel</th><th>Leistung</th><th class="zahlspalte">Minuten</th><th class="zahlspalte">Preis</th><th></th></tr></thead><tbody>${zeilen}</tbody></table></div>` : '<p class="leer">Noch keine Wellness-Leistung – unten die erste anlegen.</p>'}
<h2>Leistung anlegen oder ändern</h2>
${form('wellness_speichern', `<div class="zwei"><label>Kürzel<input name="code" required maxlength="12" placeholder="z. B. WM60" class="kurz"></label><label>Bezeichnung<input name="bezeichnung" required maxlength="120" placeholder="z. B. Wellnessmassage 60 Minuten"></label></div>
  <div class="zwei"><label>Dauer (Minuten)<input type="number" name="dauer_min" min="5" step="5" class="kurz"></label><label>Preis in Euro (brutto, 19 %)<input name="preis" required inputmode="decimal" placeholder="z. B. 65,00" class="kurz"></label></div>
  <p class="hint">Dasselbe Kürzel noch einmal speichern ändert die Leistung.</p>
  <button class="knopf primaer" data-hilfe="wellness.speichern">Speichern</button>`, { zurueck, klasse: 'tafel formular' })}`,
  });
}

// ── Serie ohne Rezept anlegen (Direktzugang / Wellness) ─────────────────────
export function serieNeuSeite(d: NeuAktionDaten, grundlage: 'direktzugang' | 'praevention', o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const p: Patient = d.patient;
  const wellness = grundlage === 'praevention';
  const titel = wellness ? 'Wellness-Serie' : 'Behandlung ohne Rezept';
  const pfad = `/patienten/${p.id}/neu/${wellness ? 'wellness' : 'direktzugang'}`;
  const name = `${p.vorname} ${p.nachname}`;
  return seite({
    titel, aktiv: 'patienten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: `<p class="hint"><a href="/patienten">Patienten</a> › <a href="/patienten/${p.id}">${esc(name)}</a> › ${titel}</p><h1>${symbol(wellness ? 'wellness' : 'freigabe', { groesse: 26 })} ${titel} <span class="hint">${esc(name)}</span></h1>${meldungen(o)}
${wellness && !d.wellness.length ? `<p class="meldung fehler">${symbol('warnung', { groesse: 18 })} Der Wellness-Katalog ist leer – erst unter <a href="/rezepte/wellness">Wellness-Katalog</a> eine Leistung anlegen.</p>` : ''}
<form method="post" action="/patienten/aktion" class="tafel formular" data-hilfe="${wellness ? 'serie.wellness.formular' : 'serie.direktzugang.formular'}">
  <input type="hidden" name="aktion" value="serie_anlegen"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="zurueck" value="${pfad}"><input type="hidden" name="grundlage" value="${grundlage}">
  ${wellness
    ? `<label>Leistung aus dem Wellness-Katalog<select name="wellness_id" required>${d.wellness.map((w) => `<option value="${w.id}">${esc(w.bezeichnung)}${w.dauerMin ? ` · ${w.dauerMin} min` : ''} · ${euro(w.preis)}</option>`).join('')}</select></label>
       <p class="hint">Ohne Krankheitsbezug, 19 % Umsatzsteuer. Jede erfasste Behandlung in dieser Serie übernimmt die Leistung und ihren Preis.</p>`
    : `<p class="hint">Eigenverantwortliche Behandlung einer Erkrankung ohne ärztliche Verordnung – nur mit sektoraler Heilpraktikererlaubnis (Frage 15). Steuerfrei als Heilbehandlung. Die Kosteninformation in Textform (§ 630c Abs. 3 BGB) nicht vergessen.</p>`}
  <label>Kurzbezeichnung${wellness ? ' (optional)' : ''}<input name="bezeichnung" maxlength="80" placeholder="${wellness ? 'z. B. Entspannung Rücken' : 'z. B. Nacken, Verspannung'}"${wellness ? '' : ' required'}></label>
  <label>Anlass / Beschwerden${wellness ? ' (optional)' : ''}<textarea name="anlass" rows="2"></textarea></label>
  <label>Beginn<input type="date" name="begonnen_am" value="${heute()}"></label>
  <button class="knopf primaer" data-hilfe="${wellness ? 'serie.wellness.anlegen' : 'serie.direktzugang.anlegen'}">${titel} anlegen</button>
</form>`,
  });
}
