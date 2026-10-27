/**
 * Preislisten-Seiten (W59): Übersicht mit drei Kacheln und „aktiv“, Neu, Bearbeiten (Auswahl +
 * Bearbeitungsseite mit Scroll-Tabelle), Details, Position, Archiv. Server-gerendert; Faktor ↔ Preis
 * rechnet /praxis.js im Browser mit, der Server rechnet beim Speichern verbindlich nach.
 * Mobil (≤ 640 px): nur ansehen – Eingaben und Aktionen sind ausgeblendet.
 */
import type { PositionDetail, Position, Preisliste, QuelleKurz, Vorlage } from '../preise/preislisten.ts';
import type { NeueQuelle, Pruefergebnis } from '../preise/quellen.ts';
import { esc, seite } from './layout.ts';
import { datumText, euroText, preisText } from '../format.ts';
import { heuteBerlin } from '../zeit.ts';
import { preislistenFormular as form, meldungen, type Rahmen } from './bausteine.ts';
import { symbol } from './symbole.ts';

const faktorText = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('de-DE', { maximumFractionDigits: 4 }));

export const STATUS_TEXT = (l: Preisliste) =>
  l.status === 'archiviert' ? ['archiviert', 'preset12'] : l.status === 'entwurf' ? ['erstellt', 'preset3'] : l.genutzt ? ['genutzt', 'preset7'] : ['freigegeben', 'preset4'];
const statusChip = (l: Preisliste) => {
  const [t, f] = STATUS_TEXT(l);
  return `<span class="chip ${f}">${t}</span>${l.aktiv ? ' <span class="chip preset19">aktiv</span>' : ''}${l.standard ? ' <span class="chip preset24">Standard</span>' : ''}`;
};
const quelleText = (q: QuelleKurz | null) => (q ? `${esc(q.version)}${/abgerufen/.test(q.version) ? '' : ` · abgerufen ${datumText(q.abgerufenAm)}`}` : '–');
const grundlage = (l: Preisliste) => (l.basis ? `Preisliste „${esc(l.basis.name)}“ · GKV ${quelleText(l.gkv)}` : `GKV ${quelleText(l.gkv)}`);



const kopfzeile = (titel: string, sym: Parameters<typeof symbol>[0] = 'euro', pfad = '') =>
  `<p class="hint"><a href="/preislisten">Preislisten</a>${pfad}</p><h1>${symbol(sym, { groesse: 26 })} ${titel}</h1>`;


// ── Übersicht ───────────────────────────────────────────────────────────────
export interface UebersichtDaten {
  neu: NeueQuelle[];
  listen: Preisliste[];
  stand: Partial<Record<'gkv' | 'beihilfe' | 'gebueth', QuelleKurz>>;
  pruefung?: Pruefergebnis[];
}

function kachel(l: Preisliste): string {
  return `<article class="pk${l.standard ? ' standard' : l.aktiv ? ' aktiv' : ''}" data-hilfe="preislisten.kachel">
    <a class="pk-link" href="/preislisten/${l.id}">
      <span class="pk-kopf">${symbol('euro', { groesse: 20 })}<b>${esc(l.name)}</b></span>
      <span>${statusChip(l)}</span>
      <dl class="liste-dl klein">
        <dt>Grundlage</dt><dd>${grundlage(l)}</dd>
        <dt>Beihilfe</dt><dd>${quelleText(l.beihilfe)}</dd>
        ${l.vorlage ? `<dt>Muster</dt><dd>${esc(l.vorlage.name)}</dd>` : ''}
        <dt>Erstellt</dt><dd>${datumText(l.erstelltAm)}</dd>
        <dt>Freigegeben</dt><dd>${l.freigegebenAm ? datumText(l.freigegebenAm) : 'noch nicht'}</dd>
        <dt>Positionen</dt><dd>${l.uebernommen} von ${l.positionen} übernommen</dd>
        <dt>Patienten</dt><dd>${l.patienten} zugeordnet${l.standard ? ' · plus alle ohne eigene Liste' : ''}</dd>
      </dl>
    </a>
    <div class="pk-fuss nur-desktop">
    ${form('aktiv', `<input type="hidden" name="aktiv_id" value="${l.id}"><input type="hidden" name="aktiv" value="0"><label class="pk-aktiv" data-hilfe="preislisten.aktiv"><input type="checkbox" name="aktiv" value="1"${l.aktiv ? ' checked' : ''}${l.status !== 'freigegeben' || l.standard ? ' disabled' : ''} data-auto-senden> aktiv</label><button class="knopf klein nur-ohne-js">übernehmen</button>`, { id: l.id, klasse: 'pk-aktiv-form' })}
    ${form('standard', `<input type="hidden" name="standard_id" value="${l.id}"><label class="pk-aktiv" data-hilfe="preislisten.standard"><input type="radio" name="standard_wahl" value="${l.id}"${l.standard ? ' checked' : ''}${l.status !== 'freigegeben' ? ' disabled' : ''} data-auto-senden> Standard</label><button class="knopf klein nur-ohne-js">übernehmen</button>`, { id: l.id, klasse: 'pk-aktiv-form' })}
    </div>
  </article>`;
}

export function uebersichtSeite(d: UebersichtDaten, o: Rahmen): string {
  const quellen = (['gkv', 'beihilfe', 'gebueth'] as const).map((art) => {
    const q = d.stand[art];
    const name = { gkv: 'GKV-Vergütungsliste', beihilfe: 'Beihilfe-Höchstbeträge', gebueth: 'GebüTh (Buch)' }[art];
    return `<li data-hilfe="preislisten.quelle.${art}" tabindex="0"><b>${name}</b><span>${q ? quelleText(q) : 'noch nicht abgerufen'}</span>
      ${q && art !== 'gebueth' ? `<a href="/preislisten/quelle/${q.id}/original" target="_blank" rel="noopener">Original</a>` : ''}</li>`;
  }).join('');
  const pruefung = d.pruefung?.length
    ? `<ul class="pruefung">${d.pruefung.map((p) => `<li>${p.fehler ? symbol('warnung', { groesse: 16 }) : p.neu ? symbol('haken', { groesse: 16 }) : symbol('haken', { groesse: 16 })} ${esc({ gkv: 'GKV', beihilfe: 'Beihilfe', gebueth: 'GebüTh' }[p.art])}: ${p.fehler ? esc(p.fehler) : p.neu ? `neue Fassung – ${esc(p.version ?? '')}` : `unverändert – ${esc(p.version ?? '')}`}</li>`).join('')}</ul>`
    : '';
  const neu = d.neu.length
    ? `<div class="hinweis-neu" role="status" data-hilfe="preislisten.neu-hinweis" tabindex="0">
        <p><span class="punkt-rot" aria-hidden="true"></span><b>Neue Grundlage verfügbar</b></p>
        <ul>${d.neu.map((q) => `<li>${esc(q.titel)}: <b>${esc(q.version)}</b> <span class="hint">(abgerufen ${datumText(q.abgerufenAm)})</span>
          ${q.art === 'gkv' ? ` · <a href="/preislisten/neu?gkv=${q.id}">Neue Preisliste daraus</a>` : ''}${q.art === 'gebueth' ? ' · <span class="hint">neue Auflage: Buch bestellen, Faktoren in einem Muster nachtragen</span>' : ''}</li>`).join('')}</ul>
        ${form('gesehen', '<button class="knopf klein" data-hilfe="preislisten.gesehen">Als gesehen markieren</button>', { klasse: 'nur-desktop' })}
      </div>`
    : '';
  return seite({
    titel: 'Preislisten', aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<h1>${symbol('euro', { groesse: 26 })} Preislisten</h1>${meldungen(o)}${neu}${pruefung}
<div class="knopfreihe nur-desktop">
  <a class="knopf primaer" href="/preislisten/neu" data-hilfe="preislisten.neu">${symbol('rechnung', { groesse: 18 })} Neu</a>
  <a class="knopf" href="/preislisten/bearbeiten" data-hilfe="preislisten.bearbeiten">Bearbeiten</a>
  ${form('pruefen', `<button class="knopf" data-hilfe="preislisten.pruefen">${symbol('haken', { groesse: 18 })} Prüfen</button>`)}
  <a class="knopf" href="/preislisten/archiv" data-hilfe="preislisten.archiv">${symbol('archiv', { groesse: 18 })} Archiv</a>
</div>
<p class="hint nur-mobil">Am Handy lassen sich Preislisten nur ansehen – bearbeiten bitte am Rechner.</p>
<h2 class="spaltenkopf dash-kopf">Die letzten Preislisten</h2>
${d.listen.length ? `<div class="pk-raster">${d.listen.slice(0, 3).map(kachel).join('')}</div>` : '<p class="leer">Noch keine Preisliste – mit „Neu“ die erste anlegen.</p>'}
${d.listen.length > 3 ? `<p><a href="/preislisten/bearbeiten">Alle ${d.listen.length} Preislisten</a></p>` : ''}
<h2 class="spaltenkopf dash-kopf">Grundlagen</h2>
<ul class="quellen tafel">${quellen}</ul>
<p class="hint">Die GebüTh ist ein Buch (Buchner &amp; Partner, Kiel) ohne Download. Ihre Empfehlungen trägt man einmal in ein Muster ein; nachts wird nur geprüft, ob eine neue Auflage erschienen ist. GKV-Liste und Beihilfe-Höchstbeträge holt das System selbst – jede Nacht um 3 Uhr.</p>`,
  });
}

// ── Neu ─────────────────────────────────────────────────────────────────────
export interface NeuDaten {
  gkv: QuelleKurz[];
  beihilfe: QuelleKurz[];
  gebueth?: QuelleKurz;
  listen: Preisliste[];
  vorlagen: Vorlage[];
  vorwahl: { gkv?: string; basis?: string };
  pruefung?: Pruefergebnis[];
}

export function neuSeite(d: NeuDaten, o: Rahmen): string {
  const opt = (liste: { id: string; text: string }[], gewaehlt?: string) => liste.map((x) => `<option value="${x.id}"${x.id === gewaehlt ? ' selected' : ''}>${esc(x.text)}</option>`).join('');
  const mitBasis = !!d.vorwahl.basis;
  const pruefung = d.pruefung?.some((p) => p.neu) ? `<p class="meldung ok">${symbol('haken', { groesse: 18 })} Neue Fassung gefunden: ${d.pruefung.filter((p) => p.neu).map((p) => esc(p.version ?? p.art)).join(', ')}</p>` : '';
  return seite({
    titel: 'Neue Preisliste', aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile('Neue Preisliste', 'rechnung', ' › Neu')}${meldungen(o)}${pruefung}
${d.gkv.length ? '' : '<p class="meldung fehler">Noch keine GKV-Fassung abgerufen – oben „Prüfen“ wählen.</p>'}
<form method="post" action="/preislisten/aktion" class="tafel formular nur-desktop">
  <input type="hidden" name="aktion" value="anlegen"><input type="hidden" name="zurueck" value="/preislisten/neu">
  <label>Name der Preisliste<input name="name" required maxlength="120" placeholder="z. B. Privatpreise 2026" data-hilfe="preisliste.feld.name"></label>
  <fieldset data-hilfe="preisliste.grundlage"><legend>Grundlage</legend>
    <label class="wahl"><input type="radio" name="grundlage" value="gkv"${mitBasis ? '' : ' checked'}> GKV-Vergütungsliste
      <select name="gkv_id">${opt(d.gkv.map((q) => ({ id: q.id, text: `${q.version} (abgerufen ${datumText(q.abgerufenAm)})` })), d.vorwahl.gkv)}</select></label>
    <label class="wahl"><input type="radio" name="grundlage" value="preisliste"${mitBasis ? ' checked' : ''}${d.listen.length ? '' : ' disabled'}> andere Preisliste (Positionen, Faktoren und Preise übernehmen)
      <select name="basis_id">${opt(d.listen.map((l) => ({ id: l.id, text: `${l.name} – ${STATUS_TEXT(l)[0]}` })), d.vorwahl.basis)}</select></label>
  </fieldset>
  <label>Beihilfe-Höchstbeträge zum Vergleich<select name="beihilfe_id" data-hilfe="preisliste.feld.beihilfe"><option value="">keine</option>${opt(d.beihilfe.map((q) => ({ id: q.id, text: q.version })), d.beihilfe[0]?.id)}</select></label>
  <label>Muster übernehmen (Haken und Faktoren)<select name="vorlage_id" data-hilfe="preisliste.feld.vorlage"><option value="">keins – alle Positionen übernehmen</option>${opt(d.vorlagen.map((v) => ({ id: v.id, text: `${v.name}${v.standardFaktor ? ` (Faktor ${faktorText(v.standardFaktor)})` : ''}${v.aufrunden ? ' · aufgerundet' : ''}` })), mitBasis ? undefined : d.vorlagen[0]?.id)}</select></label>
  <label>Allgemeiner Faktor auf den GKV-Preis (leer lassen = wie im Muster bzw. von Hand)<input name="standard_faktor" inputmode="decimal" placeholder="z. B. 1,3" data-hilfe="preisliste.feld.faktor"></label>
  <label class="haken"><input type="checkbox" name="aufrunden" value="1" data-hilfe="preisliste.feld.aufrunden"> Eigene Preise auf volle Euro aufrunden <span class="hint">(oder wie im Muster)</span></label>
  ${d.gebueth ? `<p class="hint">GebüTh: ${esc(d.gebueth.version)} – ihre Faktoren kommen über ein Muster.</p>` : ''}
  <button class="knopf primaer" data-hilfe="preisliste.anlegen">Preisliste anlegen</button>
</form>`,
  });
}

// ── Bearbeiten: Auswahl ─────────────────────────────────────────────────────
export function auswahlSeite(listen: Preisliste[], o: Rahmen & { titel?: string; archiv?: boolean }): string {
  const zeilen = listen.map((l) => `<tr data-href="/preislisten/${l.id}${l.status === 'entwurf' && !o.archiv ? '/bearbeiten' : ''}">
    <td><a href="/preislisten/${l.id}${l.status === 'entwurf' && !o.archiv ? '/bearbeiten' : ''}"><b>${esc(l.name)}</b></a><br><span class="hint">${grundlage(l)}</span></td>
    <td>erstellt ${datumText(l.erstelltAm)}<br><span class="hint">${l.freigegebenAm ? `freigegeben ${datumText(l.freigegebenAm)}` : 'nicht freigegeben'}${l.archiviertAm ? ` · archiviert ${datumText(l.archiviertAm)}` : ''}</span></td>
    <td>${statusChip(l)}</td>
    ${o.archiv ? `<td class="nur-desktop">${form('wiederherstellen', `<button class="knopf klein" data-hilfe="preislisten.wiederherstellen">Wiederherstellen</button>`, { id: l.id, zurueck: '/preislisten/archiv' })}
      ${form('wiederherstellen_aktiv', `<button class="knopf klein" data-hilfe="preislisten.wiederherstellen-aktiv">… und aktiv setzen</button>`, { id: l.id, zurueck: '/preislisten/archiv' })}${l.nachfolger ? `<br><span class="hint">Patienten gingen zu „${esc(l.nachfolger.name)}“</span>` : ''}</td>` : ''}
  </tr>`).join('');
  return seite({
    titel: o.titel ?? 'Preislisten bearbeiten', aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile(o.titel ?? 'Preislisten bearbeiten', o.archiv ? 'archiv' : 'euro', o.archiv ? ' › Archiv' : ' › Bearbeiten')}${meldungen(o)}
<p class="hint">${o.archiv ? 'Archivierte Preislisten stehen für Rechnungen nicht zur Verfügung. Wiederherstellen macht sie wieder wählbar.' : 'Entwürfe öffnen sich zum Bearbeiten, freigegebene in der Detailansicht (dort: als neue Preisliste kopieren).'}</p>
${listen.length ? `<div class="tabelle scrollliste" data-hilfe="${o.archiv ? 'preislisten.archivliste' : 'preislisten.auswahl'}"><table><thead><tr><th>Name · Grundlage</th><th>Daten</th><th>Status</th>${o.archiv ? '<th class="nur-desktop"></th>' : ''}</tr></thead><tbody>${zeilen}</tbody></table></div>`
  : `<p class="leer" data-hilfe="${o.archiv ? 'preislisten.archivliste' : 'preislisten.auswahl'}" tabindex="0">${o.archiv ? 'Das Archiv ist leer.' : 'Noch keine Preislisten.'}</p>`}`,
  });
}

// ── Bearbeitungsseite ───────────────────────────────────────────────────────
function zweiteZeile(p: Position): string {
  const teile = [p.regelzeit ? `${esc(p.regelzeit)}` : '', p.gruppe ? esc(p.gruppe) : ''];
  const bh = p.beihilfeHoechstbetrag !== null ? `Beihilfe ${euroText(p.beihilfeHoechstbetrag)}${p.beihilfeNummer ? ` (Nr. ${esc(p.beihilfeNummer)})` : ''}` : 'Beihilfe –';
  const ueber = p.eigenerPreis !== null && p.beihilfeHoechstbetrag !== null && p.eigenerPreis > p.beihilfeHoechstbetrag
    ? ` <span class="warn">+${euroText(p.eigenerPreis - p.beihilfeHoechstbetrag)} über Beihilfe</span>` : '';
  return `${teile.filter(Boolean).join(' · ')}${teile.some(Boolean) ? ' · ' : ''}${bh}${ueber}`;
}

export function editorSeite(
  l: Preisliste,
  pos: Position[],
  o: Rahmen & { muster?: Vorlage[]; abweichung?: { muster: Vorlage; unterschiede: number } },
): string {
  const fest = l.status !== 'entwurf';
  const heute = datumText(heuteBerlin());
  // Nach dem Speichern: weicht die Liste vom Muster ab, fragen, ob es ein neues Muster geben soll
  const frage = o.abweichung && !fest
    ? `<div class="hinweis-muster" role="alertdialog" aria-labelledby="muster-frage" data-hilfe="preisliste.muster-frage" tabindex="0">
        <p id="muster-frage"><b>Neues Muster speichern?</b> Die Preisliste weicht an ${o.abweichung.unterschiede} Stelle(n) vom Muster „${esc(o.abweichung.muster.name)}“ ab (Haken, Faktoren, allgemeiner Faktor oder Aufrunden).</p>
        <div class="knopfreihe">
          ${form('muster_neu', `<input name="muster_name" value="${esc(`${o.abweichung.muster.name} (${heute})`)}" maxlength="120" required aria-label="Name des neuen Musters"><button class="knopf primaer" data-hilfe="preisliste.muster-neu">Als neues Muster speichern</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten?muster_frage=1`, klasse: 'inline vorlage-form' })}
          ${form('muster_aktualisieren', `<button class="knopf" data-hilfe="preisliste.muster-aktualisieren">Muster „${esc(o.abweichung.muster.name)}“ aktualisieren</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten` })}
          ${form('muster_nein', '<button class="knopf" data-hilfe="preisliste.muster-nein">Nein, Muster lassen</button>', { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten` })}
        </div>
      </div>`
    : '';
  const hakenAusMuster = !fest && o.muster?.length
    ? form('muster_haken', `<label>Haken aus Muster<select name="vorlage_id" data-hilfe="preisliste.muster-anwenden">${o.muster.map((m) => `<option value="${m.id}"${m.id === l.vorlage?.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><button class="knopf klein">übernehmen</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten`, klasse: 'inline vorlage-form nur-desktop' })
    : '';
  const zeilen = pos.map((p) => `<tr data-href="/preislisten/${l.id}/positionen/${p.id}" data-basis="${p.gkvPreis ?? ''}"${p.uebernehmen ? '' : ' class="ab"'}>
    <td class="mitte"><input type="hidden" name="z_nummer" value="${esc(p.nummer)}"><input type="checkbox" name="z_uebernehmen_${esc(p.nummer)}" value="1"${p.uebernehmen ? ' checked' : ''}${fest ? ' disabled' : ''} data-hilfe="preisliste.uebernehmen" aria-label="${esc(p.nummer)} übernehmen"></td>
    <td><b>${esc(p.nummer)}</b><br><span class="hint kuerzel">${esc(p.kuerzel ?? '')}</span></td>
    <td><a href="/preislisten/${l.id}/positionen/${p.id}" data-hilfe="preisliste.position">${esc(p.bezeichnung)}</a><br><span class="hint">${zweiteZeile(p)}</span></td>
    <td class="zahlspalte">${euroText(p.gkvPreis)}</td>
    <td class="zahlspalte"><input class="zahl-eingabe nur-desktop" name="z_faktor_${esc(p.nummer)}" value="${faktorText(p.faktor)}" inputmode="decimal" data-faktor${fest ? ' disabled' : ''} data-hilfe="preisliste.faktor" aria-label="Faktor ${esc(p.nummer)}"><span class="nur-mobil">${faktorText(p.faktor) || '–'}</span></td>
    <td class="zahlspalte"><input class="zahl-eingabe nur-desktop" name="z_preis_${esc(p.nummer)}" value="${preisText(p.eigenerPreis)}" inputmode="decimal" data-preis${fest ? ' disabled' : ''} data-hilfe="preisliste.preis" aria-label="Eigener Preis ${esc(p.nummer)}"><span class="nur-mobil">${euroText(p.eigenerPreis)}</span></td>
  </tr>`).join('');
  return seite({
    titel: `Preisliste ${l.name}`, aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile(esc(l.name), 'euro', ` › <a href="/preislisten/bearbeiten">Bearbeiten</a>`)}${meldungen(o)}${frage}
${fest ? `<p class="meldung ok">${symbol('schloss', { groesse: 18 })} Diese Preisliste ist ${STATUS_TEXT(l)[0]} und lässt sich nicht mehr ändern. <a href="/preislisten/neu?basis=${l.id}">Als neue Preisliste kopieren</a></p>` : ''}
<form method="post" action="/preislisten/aktion" class="editor" id="editor">
  <input type="hidden" name="aktion" value="speichern"><input type="hidden" name="id" value="${l.id}"><input type="hidden" name="zurueck" value="/preislisten/${l.id}/bearbeiten">
  <div class="tafel editor-kopf">
    <label>Name<input name="name" value="${esc(l.name)}" maxlength="120"${fest ? ' disabled' : ''} data-hilfe="preisliste.feld.name"></label>
    <dl class="liste-dl klein" data-hilfe="preisliste.kopfdaten" tabindex="0">
      <dt>Grundlage</dt><dd>${grundlage(l)}${l.gkv ? ` · <a href="/preislisten/quelle/${l.gkv.id}/original" target="_blank" rel="noopener">Original</a>` : ''}</dd>
      <dt>Beihilfe</dt><dd>${quelleText(l.beihilfe)}</dd>
      <dt>Muster</dt><dd>${l.vorlage ? esc(l.vorlage.name) : 'keins'}</dd>
      <dt>Erstellt</dt><dd>${datumText(l.erstelltAm)}${l.erstelltVon ? ` von ${esc(l.erstelltVon)}` : ''} <span class="hint">(fest)</span></dd>
      <dt>Status</dt><dd>${statusChip(l)}</dd>
    </dl>
    <div class="faktor-alle"><label>Allgemeiner Faktor<span class="zeile"><input name="standard_faktor" value="${faktorText(l.standardFaktor)}" inputmode="decimal" data-faktor-standard${fest ? ' disabled' : ''} data-hilfe="preisliste.feld.faktor">
      <button type="button" class="knopf klein nur-desktop" data-faktor-alle${fest ? ' disabled' : ''} data-hilfe="preisliste.faktor-alle">auf alle übernommenen anwenden</button></span></label>
      <label class="haken" data-hilfe="preisliste.aufrunden"><input type="checkbox" name="aufrunden" value="1" data-aufrunden${l.aufrunden ? ' checked' : ''}${fest ? ' disabled' : ''}> Aufrunden <span class="hint">auf volle Euro</span></label>
    </div>
  </div>
  <div class="tabelle scrollliste editor-tabelle" data-hilfe="preisliste.tabelle"><table>
    <thead><tr><th>Übern.</th><th>ID · Kürzel</th><th>Position</th><th class="zahlspalte">GKV-Preis</th><th class="zahlspalte">Faktor</th><th class="zahlspalte">Eigener Preis</th></tr></thead>
    <tbody>${zeilen}</tbody></table></div>
  ${fest ? '' : `<div class="knopfreihe nur-desktop">
    <button class="knopf primaer" data-hilfe="preisliste.speichern">Speichern</button>
    <a class="knopf" href="/preislisten/${l.id}/bearbeiten" data-hilfe="preisliste.verwerfen">Verwerfen</a>
  </div>`}
</form>
${hakenAusMuster}
${fest ? '' : `<div class="knopfreihe nur-desktop editor-aktionen">
  ${form('freigeben', `<button class="knopf" data-hilfe="preisliste.freigeben">${symbol('freigabe', { groesse: 18 })} Freigeben</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten` })}
  ${form('vorlage', `<input name="vorlage_name" placeholder="Name des Musters" maxlength="120" required data-hilfe="preisliste.vorlage-name"><button class="knopf" data-hilfe="preisliste.vorlage">Als Muster speichern</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten`, klasse: 'inline vorlage-form' })}
  ${form('loeschen', `<button class="knopf warnend" data-hilfe="preisliste.loeschen">${symbol('kreuz', { groesse: 18 })} Löschen</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/bearbeiten` })}
</div>`}
<p class="hint">Faktor und eigener Preis rechnen sich gegenseitig um (Grundlage: GKV-Preis). Mit „Aufrunden“ wird jeder eigene Preis auf den nächsten vollen Euro aufgerundet. Beim Speichern zählt der Preis; der Faktor wird daraus auf vier Stellen gerechnet.</p>`,
  });
}

// ── Details ─────────────────────────────────────────────────────────────────
export function detailsSeite(l: Preisliste, pos: Position[], verw: { patienten: string[]; rechnungen: string[] }, o: Rahmen & { andere?: Preisliste[] }): string {
  const andere = o.andere ?? [];
  const nachWahl = (name: string, hilfe: string) => `<select name="${name}" data-hilfe="${hilfe}"><option value="">auf den Standard (keine feste Zuordnung)</option>${andere.map((x) => `<option value="${x.id}">${esc(x.name)}${x.standard ? ' – Standard' : ''}</option>`).join('')}</select>`;
  const zeilen = pos.filter((p) => p.uebernehmen).map((p) => `<tr data-href="/preislisten/${l.id}/positionen/${p.id}"><td><b>${esc(p.nummer)}</b><br><span class="hint">${esc(p.kuerzel ?? '')}</span></td>
    <td><a href="/preislisten/${l.id}/positionen/${p.id}">${esc(p.bezeichnung)}</a><br><span class="hint">${zweiteZeile(p)}</span></td>
    <td class="zahlspalte">${euroText(p.gkvPreis)}<br><span class="hint">× ${faktorText(p.faktor) || '–'}</span></td><td class="zahlspalte"><b>${euroText(p.eigenerPreis)}</b></td></tr>`).join('');
  const zurueck = `/preislisten/${l.id}`;
  return seite({
    titel: `Preisliste ${l.name}`, aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile(esc(l.name), 'euro', ' › Details')}${meldungen(o)}
<div class="diagramme">
  <section class="tafel" data-hilfe="preisliste.metadaten"><h2>Angaben</h2><dl class="liste-dl">
    <dt>Status</dt><dd>${statusChip(l)}</dd>
    <dt>Grundlage</dt><dd>${grundlage(l)}${l.gkv ? ` · <a href="/preislisten/quelle/${l.gkv.id}/original" target="_blank" rel="noopener">Original</a>` : ''}</dd>
    <dt>Beihilfe</dt><dd>${quelleText(l.beihilfe)}${l.beihilfe ? ` · <a href="/preislisten/quelle/${l.beihilfe.id}/original" target="_blank" rel="noopener">Original</a>` : ''}</dd>
    <dt>Muster</dt><dd>${l.vorlage ? esc(l.vorlage.name) : 'keins'}</dd>
    <dt>Allg. Faktor</dt><dd>${faktorText(l.standardFaktor) || '–'}${l.aufrunden ? ' · auf volle Euro aufgerundet' : ''}</dd>
    <dt>Erstellt</dt><dd>${datumText(l.erstelltAm)}${l.erstelltVon ? ` · ${esc(l.erstelltVon)}` : ''}</dd>
    <dt>Freigegeben</dt><dd>${l.freigegebenAm ? `${datumText(l.freigegebenAm)}${l.freigegebenVon ? ` · ${esc(l.freigegebenVon)}` : ''}` : 'noch nicht'}</dd>
    ${l.archiviertAm ? `<dt>Archiviert</dt><dd>${datumText(l.archiviertAm)}</dd>` : ''}
    <dt>Positionen</dt><dd>${l.uebernommen} von ${l.positionen} übernommen</dd>
  </dl></section>
  <section class="tafel" data-hilfe="preisliste.verwendung"><h2>Verwendet</h2>
    <p><b>${l.patienten}</b> Patienten zugeordnet${l.standard ? ' – dazu alle ohne eigene Liste (Standard)' : ''} · <b>${verw.rechnungen.length}</b> Rechnungen</p>
    ${l.patienten && l.status !== 'archiviert' ? form('umstellen', `<label>Patienten dieser Liste umstellen ${nachWahl('nach_id', 'preisliste.umstellen')}</label><button class="knopf klein">Umstellen</button>`, { id: l.id, zurueck, klasse: 'formular zeile' }) : ''}
    ${verw.rechnungen.length ? `<ul>${verw.rechnungen.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="hint">Noch in keiner Rechnung – Rechnungen an Patienten kommen mit dem Patientenbereich.</p>'}
  </section>
</div>
<div class="knopfreihe nur-desktop" data-hilfe="preisliste.aktionen">
  ${l.status === 'entwurf' ? `<a class="knopf primaer" href="/preislisten/${l.id}/bearbeiten">Bearbeiten</a>${form('freigeben', '<button class="knopf">Freigeben</button>', { id: l.id, zurueck })}` : ''}
  ${l.status === 'freigegeben' && !l.aktiv ? form('aktiv', `<input type="hidden" name="aktiv_id" value="${l.id}"><input type="hidden" name="aktiv" value="1"><button class="knopf primaer">Aktiv setzen</button>`, { id: l.id, zurueck }) : ''}
  ${l.status === 'freigegeben' && l.aktiv && !l.standard ? form('aktiv', `<input type="hidden" name="aktiv_id" value="${l.id}"><input type="hidden" name="aktiv" value="0"><button class="knopf">Nicht mehr aktiv</button>`, { id: l.id, zurueck }) : ''}
  ${l.status === 'freigegeben' && !l.standard ? form('standard', `<input type="hidden" name="standard_id" value="${l.id}"><button class="knopf primaer" data-hilfe="preislisten.standard">Als Standard</button>`, { id: l.id, zurueck }) : ''}
  ${l.status === 'freigegeben' && !l.standard ? form('archivieren', `${l.patienten ? `<label class="hint">${l.patienten} Patienten ${nachWahl('nachfolger_id', 'preisliste.nachfolger')}</label>` : ''}<button class="knopf" data-hilfe="preisliste.archivieren">${symbol('archiv', { groesse: 18 })} Archivieren</button>`, { id: l.id, zurueck, klasse: l.patienten ? 'formular zeile' : 'inline' }) : ''}
  ${l.status === 'archiviert' ? form('wiederherstellen', '<button class="knopf">Wiederherstellen</button>', { id: l.id, zurueck }) : ''}
  <a class="knopf" href="/preislisten/neu?basis=${l.id}" data-hilfe="preisliste.kopieren">Als neue Preisliste kopieren</a>
  ${l.status === 'entwurf' && !l.genutzt ? form('loeschen', '<button class="knopf warnend">Löschen</button>', { id: l.id, zurueck: '/preislisten' }) : ''}
</div>
<section class="tafel"><h2>Übernommene Positionen</h2>
${zeilen ? `<div class="tabelle scrollliste"><table><thead><tr><th>ID</th><th>Position</th><th class="zahlspalte">GKV × Faktor</th><th class="zahlspalte">Eigener Preis</th></tr></thead><tbody>${zeilen}</tbody></table></div>` : '<p class="leer">Keine Position übernommen.</p>'}
</section>`,
  });
}

// ── Position ────────────────────────────────────────────────────────────────
export function positionSeite(l: Preisliste, d: PositionDetail, o: Rahmen): string {
  const p = d.position;
  const fest = l.status !== 'entwurf';
  const daten = d.gkv ? Object.entries(d.gkv.daten).filter(([k]) => k !== 'originaltext').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('') : '';
  const diff = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? euroText(a - b) : '–');
  return seite({
    titel: `${p.nummer} – ${l.name}`, aktiv: 'preislisten', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `${kopfzeile(`${esc(p.nummer)} ${esc(p.kuerzel ?? '')}`, 'rechnung', ` › <a href="/preislisten/${l.id}${fest ? '' : '/bearbeiten'}" data-hilfe="position.zurueck">${esc(l.name)}</a> › Position`)}${meldungen(o)}
<p class="umbruch"><b>${esc(p.bezeichnung)}</b></p>
<div class="diagramme">
  <section class="tafel" data-hilfe="position.eigene"><h2>Eigene Angaben</h2><dl class="liste-dl">
    <dt>Übernommen</dt><dd>${p.uebernehmen ? 'ja' : 'nein'}</dd>
    <dt>Faktor</dt><dd>${faktorText(p.faktor) || '–'}</dd>
    <dt>Eigener Preis</dt><dd><b>${euroText(p.eigenerPreis)}</b></dd>
    <dt>GKV-Preis</dt><dd>${euroText(p.gkvPreis)} <span class="hint">(Differenz ${diff(p.eigenerPreis, p.gkvPreis)})</span></dd>
    <dt>Beihilfe</dt><dd>${euroText(p.beihilfeHoechstbetrag)} <span class="hint">(Differenz ${diff(p.eigenerPreis, p.beihilfeHoechstbetrag)} – trägt der Patient selbst, wenn positiv)</span></dd>
    ${p.notiz ? `<dt>Notiz</dt><dd>${esc(p.notiz)}</dd>` : ''}
  </dl></section>
  <section class="tafel" data-hilfe="position.gkv"><h2>GKV-Vergütungsliste</h2>${d.gkv ? `<dl class="liste-dl">
    <dt>Nummer</dt><dd>${esc(d.gkv.nummer)} <span class="hint">(${esc(d.gkv.code ?? '')})</span></dd>
    <dt>Gruppe</dt><dd>${esc(d.gkv.gruppe ?? '–')}</dd>
    <dt>Regelzeit</dt><dd>${esc(d.gkv.regelzeit ?? '–')}</dd>
    <dt>Preis</dt><dd>${euroText(d.gkv.preis)}</dd>
    <dt>Zuzahlung</dt><dd>${d.gkv.zuzahlung === undefined ? 'keine' : euroText(d.gkv.zuzahlung)}</dd>
    ${d.gkv.hinweise ? `<dt>Hinweise</dt><dd>${esc(d.gkv.hinweise)}</dd>` : ''}
    ${daten}
    <dt>Originaltext</dt><dd class="hint">${esc(String(d.gkv.daten.originaltext ?? ''))}</dd>
  </dl>` : '<p class="leer">Keine GKV-Position verknüpft.</p>'}</section>
</div>
<section class="tafel" data-hilfe="position.beihilfe"><h2>Beihilfe (Anlage 9 BBhV)</h2>
  ${d.beihilfe ? `<p>Nr. <b>${esc(d.beihilfe.nummer)}</b> · ${esc(d.beihilfe.gruppe ?? '')} · <b>${euroText(d.beihilfe.preis)}</b><br><span class="hint">${esc(d.beihilfe.bezeichnung)}</span></p>` : '<p class="leer">Keine Beihilfe-Position zugeordnet.</p>'}
  ${!fest && d.kandidaten.length ? form('beihilfe', `<label>Zuordnung<select name="beihilfe_position_id" data-hilfe="position.zuordnung"><option value="">keine</option>${d.kandidaten.slice(0, 40).map((k) => `<option value="${k.id}"${k.id === d.beihilfe?.id ? ' selected' : ''}>${esc(k.nummer)} · ${euroText(k.preis)} · ${esc(k.bezeichnung.slice(0, 90))}${k.passt >= 0.45 ? ' ★' : ''}</option>`).join('')}</select></label>
    <label>Notiz<input name="notiz" value="${esc(p.notiz ?? '')}" maxlength="1000"></label><input type="hidden" name="position_id" value="${p.id}"><button class="knopf" data-hilfe="position.speichern">Speichern</button>`, { id: l.id, zurueck: `/preislisten/${l.id}/positionen/${p.id}`, klasse: 'formular nur-desktop' }) : ''}
</section>`,
  });
}
