/**
 * Erklärungen per Rechtsklick – Muster aus mdr-Target-Search (public/js/hilfe.js).
 *
 * Kein Hover: ein Rechtsklick auf ein Element mit `data-hilfe="<schlüssel>"` öffnet eine Karte,
 * die immer dieselben fünf Fragen beantwortet, in dieser Reihenfolge:
 *
 *   Löst aus – was passiert · Bezug – worauf es sich bezieht · Ändert – was gespeichert wird
 *   Ergebnis – wie es danach aussieht · Rückweg – wie man es zurücknimmt
 *
 * HILFE ist die eine Stelle für alle Texte. test/hilfe.test.ts prüft: jedes `data-hilfe` auf
 * einer Seite hat hier eine Erklärung, und keine Erklärung bleibt ohne Element.
 * Umschalt + Rechtsklick gibt das Browser-Menü. Tastatur: ? oder F1 auf einem fokussierten
 * Element. Handy und Tablet: lange drücken. Esc schließt. Alles am Stück: /hilfe.
 */
import { KATEGORIEN } from '../mail/kategorien.ts';
import { esc, seite } from './layout.ts';

export interface HilfeEintrag {
  seite: string;
  titel: string;
  loest_aus: string;
  bezug: string;
  aendert: string;
  ergebnis: string;
  rueckweg: string;
}

const NICHTS = 'Nichts – nur die Anzeige.';
const KEIN_RUECKWEG = 'Nicht nötig; es wurde nichts verändert.';
const AUSKUNFT = 'Nichts – eine Auskunft, keine Schaltfläche.';

const statuspunkt = (titel: string, bezug: string, ergebnis: string): HilfeEintrag => ({
  seite: 'Status', titel, loest_aus: AUSKUNFT, bezug, aendert: NICHTS, ergebnis,
  rueckweg: 'Bei ✗: Christian Bescheid geben. Die Seite neu laden zeigt den aktuellen Stand.',
});

export const HILFE: Record<string, HilfeEintrag> = {
  // ── Menü ──────────────────────────────────────────────────────────────────
  'menue.status': { seite: 'Menü', titel: 'Status',
    loest_aus: 'Öffnet die Statusseite.', bezug: 'Die Verbindung der Praxis-Assistenz zu Microsoft 365 (praxis@lilli-nebel.de).',
    aendert: NICHTS, ergebnis: 'Ob Postfach, Kalender und OneDrive erreichbar sind – mit ✓ oder ✗.', rueckweg: KEIN_RUECKWEG },
  'menue.hilfe': { seite: 'Menü', titel: 'Hilfe',
    loest_aus: 'Öffnet alle Erklärungen am Stück – dieselben, die der Rechtsklick zeigt.', bezug: 'Die ganze Praxis-Assistenz.',
    aendert: NICHTS, ergebnis: 'Wie der Rechnungseingang arbeitet, was die Outlook-Kategorien bedeuten, was heute geht und was später kommt.',
    rueckweg: KEIN_RUECKWEG },

  // ── Status ────────────────────────────────────────────────────────────────
  'status.gesamt': { seite: 'Status', titel: 'Gesamtzustand',
    loest_aus: AUSKUNFT, bezug: 'Alle Prüfpunkte darunter zusammen.', aendert: NICHTS,
    ergebnis: '„Alles in Ordnung“, wenn jeder Punkt ✓ hat. Sonst ein Hinweis – dann bitte Christian Bescheid geben.',
    rueckweg: KEIN_RUECKWEG },
  'status.konto': statuspunkt('Konto', 'Das Microsoft-Konto, mit dem die Praxis-Assistenz arbeitet: praxis@lilli-nebel.de.',
    'Name und Adresse des Kontos. Steht hier ein anderes Konto, stimmt etwas nicht.'),
  'status.posteingang': statuspunkt('Posteingang', 'Der Posteingang von praxis@lilli-nebel.de.',
    'Nur die Anzahl der Mails und der ungelesenen – nie Betreff oder Absender.'),
  'status.kalender': statuspunkt('Kalender', 'Der Kalender von praxis@lilli-nebel.de.',
    'Name des Kalenders und ob die Praxis-Assistenz dort Termine eintragen darf.'),
  'status.onedrive': statuspunkt('OneDrive', 'Das OneDrive von praxis@lilli-nebel.de.',
    'Wie viel Speicher belegt ist. Dateinamen werden nicht angezeigt.'),
  'status.rechte': statuspunkt('Rechte', 'Was Microsoft der Praxis-Assistenz erlaubt hat – immer nur im Namen von praxis@lilli-nebel.de.',
    'Die erteilten Rechte: Mail, Kalender, OneDrive, Kategorien, geteilte Ordner. Fehlt eins, steht hier welches.'),

  // ── Outlook-Kategorien (aus src/mail/kategorien.ts) ──────────────────────
  ...Object.fromEntries(
    Object.entries(KATEGORIEN).map(([key, k]) => [
      `kategorie.${key}`,
      {
        seite: 'Outlook-Kategorien', titel: `Kategorie „${k.name}“ (${k.farbname})`,
        loest_aus: 'Nichts – eine farbige Markierung an der Mail in Outlook, auf iPhone und Mac.',
        bezug: 'Eine Mail im Praxispostfach.',
        aendert: `Die Praxis-Assistenz setzt die Kategorie selbst (${k.ab === 'jetzt' ? 'schon heute' : k.ab}).`,
        ergebnis: `${k.wann} Was du tust: ${k.tun}`,
        rueckweg: 'In Outlook die Kategorie entfernen. Was abgelegt wurde, bleibt abgelegt; das System legt nichts doppelt ab.',
      } satisfies HilfeEintrag,
    ]),
  ),
};

// ── Das Skript im Browser ────────────────────────────────────────────────────
// Bewusst ohne Bibliothek und ohne Inline-Handler: die Seiten erlauben nur Skripte von /hilfe.js.
const CLIENT = String.raw`
(function () {
  var FELDER = [['loest_aus', 'Löst aus'], ['bezug', 'Bezug'], ['aendert', 'Ändert'], ['ergebnis', 'Ergebnis'], ['rueckweg', 'Rückweg']];
  var offenFuer = null, druck = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function platz() {
    var p = document.getElementById('hilfePlatz');
    if (!p) { p = document.createElement('div'); p.id = 'hilfePlatz'; document.body.appendChild(p); }
    return p;
  }
  function karteHtml(key) {
    var e = HILFE[key];
    if (!e) return '<div class="hilfe-karte" id="hilfeKarte" role="dialog"><div class="hilfe-kopf"><strong>Keine Erklärung</strong>' +
      '<button class="hilfe-schliessen" aria-label="Schließen">×</button></div><p>Für dieses Element fehlt die Erklärung („' + esc(key) + '“).</p></div>';
    return '<div class="hilfe-karte" id="hilfeKarte" role="dialog" aria-label="Erklärung: ' + esc(e.titel) + '">' +
      '<div class="hilfe-kopf"><strong>' + esc(e.titel) + '</strong><button class="hilfe-schliessen" aria-label="Schließen">×</button></div>' +
      '<dl class="hilfe-felder">' + FELDER.map(function (f) { return '<dt>' + f[1] + '</dt><dd>' + esc(e[f[0]]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="hilfe-fuss">Esc schließt · <a href="/hilfe#hilfe-' + esc(key.replace(/\./g, '-')) + '">in der Hilfe ansehen</a></div></div>';
  }
  function setzen(k, el) {
    var r = el.getBoundingClientRect(), b = k.offsetWidth || 420, h = k.offsetHeight || 280;
    var links = r.left, oben = r.bottom + 6;
    if (links + b > window.innerWidth - 12) links = Math.max(12, window.innerWidth - b - 12);
    if (oben + h > window.innerHeight - 12) oben = Math.max(12, r.top - h - 6);
    k.style.left = Math.round(links) + 'px'; k.style.top = Math.round(oben) + 'px';
  }
  function zeige(el) {
    if (offenFuer === el) { schliesse(); return; }
    offenFuer = el;
    var p = platz(); p.innerHTML = karteHtml(el.getAttribute('data-hilfe'));
    var k = document.getElementById('hilfeKarte'); setzen(k, el);
    k.querySelector('.hilfe-schliessen').addEventListener('click', schliesse);
    try { localStorage.setItem('hilfeGesehen', '1'); } catch (x) { /* privates Fenster */ }
    var hw = document.getElementById('hilfeHinweis'); if (hw) hw.className = 'hilfe-hinweis';
  }
  function schliesse() { var p = document.getElementById('hilfePlatz'); if (p) p.innerHTML = ''; offenFuer = null; }
  function ziel(t) { return t && t.closest ? t.closest('[data-hilfe]') : null; }
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey) return;
    var el = ziel(e.target); if (!el) return;
    e.preventDefault(); zeige(el);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { schliesse(); return; }
    if (e.key !== '?' && e.key !== 'F1') return;
    var el = ziel(document.activeElement);
    if (!el || (e.key === '?' && /^(INPUT|TEXTAREA)$/.test(el.tagName))) return;
    e.preventDefault(); zeige(el);
  });
  document.addEventListener('mousedown', function (e) {
    if (offenFuer && !(e.target.closest && e.target.closest('#hilfeKarte'))) schliesse();
  });
  document.addEventListener('touchstart', function (e) {
    var el = ziel(e.target); if (!el) return;
    druck = setTimeout(function () { zeige(el); }, 600);
  }, { passive: true });
  ['touchend', 'touchmove'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(druck); druck = null; }); });
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('hilfeListe')) return; // die Hilfeseite erklärt sich selbst
    var gesehen = false; try { gesehen = localStorage.getItem('hilfeGesehen') === '1'; } catch (x) { /* privat */ }
    var hw = document.createElement('div'); hw.id = 'hilfeHinweis';
    hw.className = 'hilfe-hinweis' + (gesehen ? '' : ' neu');
    hw.innerHTML = 'Rechtsklick (am Handy: lange drücken) erklärt jedes Element · <a href="/hilfe">alle Erklärungen</a>';
    document.body.appendChild(hw);
  });
})();
`;

/** Inhalt von /hilfe.js: die Texte und das Skript in einer Datei */
export function hilfeSkript(): string {
  return `var HILFE = ${JSON.stringify(HILFE)};\n${CLIENT}`;
}

const FUNKTIONEN: { name: string; was: string; stand: 'jetzt' | 'später'; woher: string }[] = [
  { name: 'Statusseite', was: 'Zeigt, ob die Verbindung zu Postfach, Kalender und OneDrive steht.', stand: 'jetzt', woher: 'diese Seiten' },
  { name: 'Outlook-Kategorien', was: 'Fünf farbige Kategorien zeigen in Outlook, was mit einer Mail passiert ist.', stand: 'jetzt', woher: 'angelegt am 20.10.2026' },
  { name: 'Finanzordner je Jahr', was: 'Legt „01 Finanzen/<Jahr>“ nach der Vorlage des Vorjahres an, mit „Eingangsrechnungen“.', stand: 'jetzt', woher: '2026 angelegt am 20.10.2026' },
  { name: 'Rechnungseingang', was: 'Erkennt Lieferantenrechnungen im Postfach und legt sie in „Eingangsrechnungen“ ab. Läuft bisher nur als Probelauf – es wird nichts verändert.', stand: 'jetzt', woher: 'Prompt 4' },
  { name: 'Mail-Entwürfe', was: 'Legt eine Mail als Entwurf in „Entwürfe“ – senden tust du.', stand: 'jetzt', woher: 'Leitplanke 3' },
  { name: 'Freigabe', was: 'Rechnungen auf einen Blick: Freigeben, Ablehnen oder Später – am Handy und am Rechner.', stand: 'später', woher: 'Prompt 5' },
  { name: 'Lexware', was: 'Freigegebene Belege landen in Lexware unter „Belege – zu prüfen“; später auch Rechnungsentwürfe an Patienten.', stand: 'später', woher: 'Prompt 5, 11' },
  { name: 'Bezahlt ins Archiv (Übergang)', was: 'Du setzt „Rechnung: bezahlt“ in Outlook, das System verschiebt die Mail ins Archiv und merkt sich den Stand.', stand: 'jetzt', woher: 'bis zum Tarif XL' },
  { name: 'Übernahme des Bestands', was: 'Rechnungen aus Archiv, Unterordnern und Papierkorb rückwirkend ablegen; was du als bezahlt bestätigst, kommt gleich ins Archiv.', stand: 'jetzt', woher: 'Fragen an Lilli, Nr. 1' },
  { name: 'Zahlungsstand aus Lexware', was: 'Liest aus Lexware, ob eine Rechnung zur Zahlung angestoßen oder bezahlt ist, setzt die Kategorie und archiviert die Mail.', stand: 'später', woher: 'Tarif XL, Prompt 5' },
  { name: 'Terminanfragen', was: 'Erkennt Terminwünsche in Mails, schlägt drei freie Zeiten vor und legt die Antwort als Entwurf an.', stand: 'später', woher: 'Prompt 6, 7' },
  { name: 'Cockpit', was: 'Eine Seite für heute: Termine, neue Rechnungen, offene Zahlungen, was auf dich wartet.', stand: 'später', woher: 'Prompt 8, 10' },
  { name: 'Patientenweg', was: 'Acht Phasen von der Anfrage bis zur Nachsorge – die Pinnwand zeigt, wer wo steht.', stand: 'später', woher: 'Prompt 12, PDF Patientenweg' },
  { name: 'Schnellaktionen', was: 'Ein Tipp auf die Patientenkarte legt eine fertige Mail als Entwurf an.', stand: 'später', woher: 'Prompt 13' },
  { name: 'Rezepte', was: 'Stempelkarte je Rezept, Abhaken nach jeder Behandlung, Zwischen- und Abschlussrechnung.', stand: 'später', woher: 'Prompt 14, PDF Patientenweg S. 5' },
];

export function hilfeSeite(o: { wer: string; fassung: string; skriptInline?: string }): string {
  const seitenNamen = [...new Set(Object.values(HILFE).map((e) => e.seite))];
  const kategorien = Object.entries(KATEGORIEN)
    .map(([key, k]) => `<tr><td><span class="chip ${k.farbe}" data-hilfe="kategorie.${key}" tabindex="0">${esc(k.name)}</span></td>
      <td>${esc(k.wann)}</td><td>${esc(k.tun)}</td><td><span class="marke${k.ab === 'jetzt' ? ' jetzt' : ''}">${esc(k.ab)}</span></td></tr>`)
    .join('');
  const funktionen = FUNKTIONEN.map((f) => `<tr><td><b>${esc(f.name)}</b></td><td>${esc(f.was)}</td>
    <td><span class="marke${f.stand === 'jetzt' ? ' jetzt' : ''}">${f.stand}</span></td><td class="hint">${esc(f.woher)}</td></tr>`).join('');
  const liste = seitenNamen
    .map((name) => `<div class="karte"><h3>${esc(name)}</h3>${Object.entries(HILFE)
      .filter(([, e]) => e.seite === name)
      .map(([key, e]) => `<div class="hilfe-eintrag" id="hilfe-${esc(key.replace(/\./g, '-'))}"><h3>${esc(e.titel)}</h3>
        <dl class="hilfe-felder"><dt>Löst aus</dt><dd>${esc(e.loest_aus)}</dd><dt>Bezug</dt><dd>${esc(e.bezug)}</dd>
        <dt>Ändert</dt><dd>${esc(e.aendert)}</dd><dt>Ergebnis</dt><dd>${esc(e.ergebnis)}</dd><dt>Rückweg</dt><dd>${esc(e.rueckweg)}</dd></dl></div>`)
      .join('')}</div>`)
    .join('');

  return seite({
    titel: 'Hilfe – Praxis Lilli Nebel', aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: `
<h1>Hilfe</h1>
<p>Die Praxis-Assistenz nimmt dir Büroarbeit ab: Sie sortiert Post, legt Rechnungen ab und bereitet
Antworten vor. <b>Entscheiden tust du.</b> Nichts geht an Patienten, ohne dass du es freigibst.</p>

<h2>Bedienen</h2>
<div class="karte">
<p><b>Rechtsklick</b> auf einen Knopf, eine Kategorie oder einen Prüfpunkt erklärt ihn – am iPhone und iPad
<b>lange drücken</b>. Jede Erklärung beantwortet fünf Fragen: <i>Löst aus</i> (was passiert), <i>Bezug</i>
(worauf), <i>Ändert</i> (was gespeichert wird), <i>Ergebnis</i> (wie es danach aussieht), <i>Rückweg</i>
(wie man es zurücknimmt).</p>
<p class="hint"><kbd>Esc</kbd> schließt die Erklärung. Tastatur: <kbd>?</kbd> oder <kbd>F1</kbd> auf einem
ausgewählten Element. Umschalt + Rechtsklick öffnet das normale Browser-Menü.</p>
</div>

<h2>So arbeitet der Rechnungseingang</h2>
<div class="karte"><ol class="schritte">
<li><b>Einsammeln:</b> Mails mit PDF-Anhang im Ordner „Rechnungen“ (sonst im Posteingang).</li>
<li><b>Erkennen:</b> nach festen Regeln, ohne KI. Eine Rechnung ist nur, was von einem <b>bekannten Lieferanten</b>
kommt und nach Rechnung aussieht (Rechnungsnummer, Betrag, Steuer, IBAN).</li>
<li><b>Ablegen:</b> nach <i>01 Finanzen / &lt;Jahr&gt; / Eingangsrechnungen</i>, Name
<i>Datum_Lieferant_Kennung.pdf</i>. Dieselbe Rechnung kommt nie zweimal hinein. Rechnungsnummer, Betrag und
Rechnungsdatum merkt sich das System – darüber findet es die Rechnung später in Lexware wieder.</li>
<li><b>Markieren:</b> die Mail bekommt „Rechnung: eingegangen“ und wandert nach „Rechnungen/Verarbeitet“ –
gelöscht wird nie etwas.</li>
<li><b>Du entscheidest:</b> Unklares und Patientenpost bleiben bei dir. Später gibst du Rechnungen frei, dann
gehen sie nach Lexware.</li>
<li><b>Bezahlt → Archiv:</b> Ist die Rechnung bezahlt, bekommt die Mail „Rechnung: bezahlt“ und wandert ins
Outlook-Archiv.
<br><b>Heute (bis zum Lexware-Tarif XL):</b> Setze bei einer bezahlten Rechnung die Kategorie „Rechnung: bezahlt“
selbst – in Outlook am Rechner oder auf dem iPhone. Das Verschieben ins Archiv übernimmt das System.
<br><b>Später (mit XL):</b> Das System liest den Zahlungsstand selbst aus Lexware. Stößt du dort die Zahlung an,
zeigt Outlook „Zahlung angestoßen“; hat die Bank gebucht, „bezahlt“ – du musst nichts doppelt eintragen.</li>
</ol>
<p class="hint">Patientenpost (Rezept, Verordnung, Befund, Arztbrief) wird nie im Büro-Ordner abgelegt
und nicht gespeichert – sie bekommt nur die Kategorie „Prüfen – Patient“.</p></div>

<h2>Outlook-Kategorien</h2>
<p class="hint">Die Reihenfolge ist der Weg einer Rechnung: eingegangen → freigegeben → in Lexware → Zahlung
angestoßen → bezahlt (dann im Archiv). An einer Mail steht immer nur die aktuelle Stufe; deine eigenen Kategorien
bleiben. Die beiden „Prüfen“ heißen: hier entscheidest du.</p>
<div class="tabelle"><table><thead><tr><th>Kategorie</th><th>Wann</th><th>Was du tust</th><th>Ab wann</th></tr></thead>
<tbody>${kategorien}</tbody></table></div>

<h2>Was es heute gibt – und was kommt</h2>
<div class="tabelle"><table><thead><tr><th>Funktion</th><th>Was sie tut</th><th>Stand</th><th>Grundlage</th></tr></thead>
<tbody>${funktionen}</tbody></table></div>
<p class="hint">Wie alles zusammenspielt, zeigen die beiden Übersichten „Büro &amp; Rechnungen“ und „Patientenweg“ (PDF).</p>

<h2>Wo was liegt</h2>
<div class="tabelle"><table><tbody>
<tr><th>Postfach, Kalender</th><td>Microsoft 365, Konto praxis@lilli-nebel.de</td></tr>
<tr><th>Büro-Ablage</th><td>OneDrive-Ordner „Praxis Lilli Nebel“ (01 Finanzen … 07 Technik) – nur Kaufmännisches, keine Gesundheitsdaten</td></tr>
<tr><th>Testordner</th><td>07 Technik / „_TEST PhysioPraxisManager – Probeläufe“ – darf gelöscht werden</td></tr>
<tr><th>Praxis-Kartei</th><td>Datenbank auf dem Praxis-Server bei Strato in Deutschland, verschlüsselt</td></tr>
<tr><th>Zugang</th><td>nur über Tailscale, nur für freigegebene Konten</td></tr>
<tr><th>Programm</th><td>PhysioPraxisManager ${esc(o.fassung)}, betreut von Christian</td></tr>
</tbody></table></div>

<h2>Alle Erklärungen</h2>
<div id="hilfeListe">${liste}</div>`,
  });
}
