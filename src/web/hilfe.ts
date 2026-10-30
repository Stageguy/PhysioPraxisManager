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
import type { HilfeEintrag } from './hilfe/basis.ts';
import { MENUE } from './hilfe/menue.ts';
import { COCKPIT } from './hilfe/cockpit.ts';
import { RECHNUNGS_DASHBOARD } from './hilfe/rechnungs-dashboard.ts';
import { RECHNUNGSANSICHT } from './hilfe/rechnungsansicht.ts';
import { PREISLISTEN } from './hilfe/preislisten.ts';
import { TESTUMGEBUNG } from './hilfe/testumgebung.ts';
import { STATUS } from './hilfe/status.ts';
import { PATIENTEN_LISTE } from './hilfe/patienten.ts';
import { LEXWARE } from './hilfe/lexware.ts';
import { PATIENTENSEITE } from './hilfe/patientenseite.ts';
import { REZEPTE } from './hilfe/rezepte.ts';
import { DUBLETTEN } from './hilfe/dubletten.ts';
import { RUECKMELDUNGEN } from './hilfe/rueckmeldungen.ts';
import { PINNWAND } from './hilfe/pinnwand.ts';
import { RECHNUNGEN } from './hilfe/rechnungen.ts';
import { KONFIGURATION } from './hilfe/konfiguration.ts';
import { KALENDER } from './hilfe/kalender.ts';
import { STEUER } from './hilfe/steuer.ts';
import { KATEGORIEN_HILFE } from './hilfe/kategorien.ts';

export type { HilfeEintrag } from './hilfe/basis.ts';

/** Alle Erklärungen – je Seite eine Datei in ./hilfe/, hier in der Reihenfolge der Seiten zusammengesetzt */
export const HILFE: Record<string, HilfeEintrag> = {
  ...MENUE,
  ...COCKPIT,
  ...RECHNUNGS_DASHBOARD,
  ...RECHNUNGSANSICHT,
  ...PREISLISTEN,
  ...TESTUMGEBUNG,
  ...STATUS,
  ...PATIENTEN_LISTE,
  ...LEXWARE,
  ...PATIENTENSEITE,
  ...REZEPTE,
  ...DUBLETTEN,
  ...RUECKMELDUNGEN,
  ...PINNWAND,
  ...RECHNUNGEN,
  ...KONFIGURATION,
  ...KALENDER,
  ...STEUER,
  ...KATEGORIEN_HILFE,
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
      '<div class="hilfe-fuss">Esc schließt · <a href="/hilfe#hilfe-' + esc(key.replace(/\./g, '-')) + '">in der Hilfe ansehen</a> · <a href="#" data-rm-melden="' + esc(key) + '">Hinweis oder Fehler melden</a></div></div>';
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
  { name: 'Cockpit', was: 'Startseite: Finanzen und Patienten mit ihren Seiten, Termine heute, neue Rechnungen, Anfragen, Änderungen der Woche.', stand: 'jetzt', woher: 'erste Fassung, Prompt 10' },
  { name: 'Rechnungs-Dashboard', was: 'Neue Rechnungen als Kacheln, PDF-Ansicht, Freigabe, Haken „privat“, Summen je Monat und Lieferant, Suche.', stand: 'jetzt', woher: 'Prompt 15' },
  { name: 'Preislisten', was: 'Eigene Preise je Leistung auf Grundlage der GKV-Liste, mit Faktor, Aufrunden, Beihilfe-Vergleich, Mustern (z. B. GebüTh), Freigabe (danach unveränderlich), mehrere aktive Listen und genau ein Standard, Archiv mit Nachfolger; nachts Prüfung auf neue Grundlagen mit rotem Punkt. Rechnungen frieren Preisliste und Einzelpreise ein – eine Preisänderung ist immer eine neue Liste.', stand: 'jetzt', woher: 'W59, W97' },
  { name: 'Rechnungsentwürfe', was: 'Jedes Rezept und jede Serie legt sofort einen Rechnungsentwurf an (Positionen mit Terminen, Preise aus der Preisliste des Patienten, Textbausteine). Positionen und Texte als Kacheln, Statusweg Entwurf → Fertig → In Lexware → Versendet → Bezahlt, Storno mit Grund; Heilbehandlung und Wellness immer getrennt.', stand: 'jetzt', woher: 'W79, W81' },
  { name: 'Steuerfreie Umsätze', was: 'Liste aller gestellten Rechnungen ohne USt (§ 4 Nr. 14, § 19) für das Finanzamt – Namen maskiert oder ausgeschrieben, Export CSV (GoBD) und PDF.', stand: 'jetzt', woher: 'W85' },
  { name: 'Konfiguration', was: 'Textbausteine für Rechnungen (R1 § 4 Nr. 14, R2 § 19, R3 Dank), Kleinunternehmerregelung, Steuersatz, Verweise auf Preislisten und Wellness-Katalog.', stand: 'jetzt', woher: 'W80' },
  { name: 'Kalenderseite', was: 'Alle Termine der Kartei als Tag oder Woche, Initialen oder Namen; über das Kalender-Symbol bei „Heute im Blick“.', stand: 'jetzt', woher: 'W82' },
  { name: 'Rezepte und Serien', was: 'Rezepte als Kacheln mit sieben Rezeptarten (Erst, Folge unverändert/angepasst, Wiederaufnahme, Korrektur, Zweitschrift, Langzeit), Behandlung ohne Rezept (Direktzugang) und Wellness-Serien aus dem eigenen Katalog.', stand: 'jetzt', woher: 'W73, W74' },
  { name: 'Dubletten', was: 'Die Kartei erkennt, wenn es einen Patienten womöglich schon gibt (Name, Mail, Mobilnummer, Festnetz oder Geburtsdatum mit Nachname), und zeigt ein Symbol oben links an der Kachel. Lilli klärt je Paar: keine Dublette, zusammenführen (alles Verknüpfte wandert, die Dublette verweist) oder löschen (nur ohne jede Verknüpfung). Bis dahin keine neuen Termine, Behandlungen, Rezepte oder Rechnungen an dem Patienten.', stand: 'jetzt', woher: 'W119' },
  { name: 'Rückmeldungen', was: 'Am Rechner ein kleines Fähnchen an jedem erklärten Element und an jeder Seite, am Handy der Link „melden“ in jeder Erklärung: Hinweis oder Fehler mit Screenshot und Text melden – landet in einer eigenen Entwicklungs-Datenbank, Sammelseite /rueckmeldungen.', stand: 'jetzt', woher: 'W72, W118' },
  { name: 'Patientenkartei', was: 'Kacheln mit Anrufen, WhatsApp, Mail, letzter Behandlung und nächstem Termin; Kontaktverlauf mit Gesprächsgrund; Adressen mit Rechnungsadresse; Akte nach § 630f (unveränderlich, verschlüsselt); Termine, Rezepte als Stempelkarte.', stand: 'jetzt', woher: 'W63–W68' },
  { name: 'Terminarten für die Online-Anfrage', was: 'Kacheln mit Kennung, Kurz- und Langbeschreibung und Dauer in drei Sektionen (Rezept, Selbstzahler, Wellness); Haken „aktiv“ = im Dropdown der Website; Vorschau und HTML-Baustein für das Formular. Farbe und Symbol der Sektion kehren in Kalenderseite, Cockpit und Outlook wieder.', stand: 'jetzt', woher: 'W94, W95' },
  { name: 'Buchungsseite', was: 'Eigene Buchungsseite zum Einbetten in lilli-nebel.de: Patient wählt Terminart (die aktiven Kacheln), Tag im Monatsblatt und freie Uhrzeit, gibt Name, Telefon, Mail an – der Wunsch kommt als Anfrage mit reserviertem Termin, Lilli bestätigt mit einem Klick. Eigener kleiner Dienst ohne Zugang zu Kartei, Postfach oder Tresor; öffentlich erst nach Freigabe.', stand: 'jetzt', woher: 'W96, E29' },
  { name: 'Akte-Einsicht (§ 630g)', was: 'Die ganze Akte eines Patienten als PDF – Stammdaten, Rezepte, Anamnese, Befunde, Erklärungen, Behandlungen, Termine; jeder Export im Protokoll.', stand: 'jetzt', woher: 'A19d, W68' },
  { name: 'Statusseite', was: 'Zeigt, ob die Verbindung zu Postfach, Kalender und OneDrive steht.', stand: 'jetzt', woher: 'diese Seiten' },
  { name: 'Outlook-Kategorien', was: 'Fünf farbige Kategorien zeigen in Outlook, was mit einer Mail passiert ist.', stand: 'jetzt', woher: 'angelegt am 20.10.2026' },
  { name: 'Finanzordner je Jahr', was: 'Legt „01 Finanzen/<Jahr>“ nach der Vorlage des Vorjahres an, mit „Eingangsrechnungen“.', stand: 'jetzt', woher: '2026 angelegt am 20.10.2026' },
  { name: 'Rechnungseingang', was: 'Erkennt Lieferantenrechnungen im Postfach und legt sie in „Eingangsrechnungen“ ab. Läuft bisher nur als Probelauf – es wird nichts verändert.', stand: 'jetzt', woher: 'Prompt 4' },
  { name: 'Mail-Entwürfe mit Anhängen', was: 'Auf der Patientenseite: Vorlage wählen (Termin, Rezept, Rechnung, Rückruf, Dank, freier Text), Rechnungs-PDF oder Unterlagen anhängen – der fertige Entwurf liegt im Postfach unter „Entwürfe“, gesendet wird in Outlook oder Apple Mail.', stand: 'jetzt', woher: 'W91, Prompt 13, Leitplanke 3' },
  { name: 'WhatsApp', was: 'Knöpfe an Patient und Termin öffnen WhatsApp mit fertigem Text (Bestätigung, Erinnerung, Rezept, Rückruf …) – gesendet wird vom Handy. Mit WhatsApp-Business-Zugang und Einwilligung des Patienten auch direkter Versand und Empfang in den Kontaktverlauf.', stand: 'jetzt', woher: 'W90, Prompt 7, E8' },
  { name: 'Freigabe', was: 'Rechnungen freigeben, ablehnen (mit Grund) oder zurückstellen – am Handy und am Rechner.', stand: 'jetzt', woher: 'Prompt 15' },
  { name: 'Lexware', was: 'Freigegebene Belege landen in Lexware unter „Belege – zu prüfen“; fertige Rechnungsentwürfe werden nach Lexware übertragen, Nummer und PDF kommen zurück, Storno und Zahlung werden abgeglichen.', stand: 'später', woher: 'Prompt 5, 11, E28' },
  { name: 'Bezahlt ins Archiv (Übergang)', was: 'Du setzt „Rechnung: bezahlt“ in Outlook, das System verschiebt die Mail ins Archiv und merkt sich den Stand.', stand: 'jetzt', woher: 'bis zum Tarif XL' },
  { name: 'Übernahme des Bestands', was: 'Rechnungen aus Archiv, Unterordnern und Papierkorb rückwirkend ablegen; was du als bezahlt bestätigst, kommt gleich ins Archiv.', stand: 'jetzt', woher: 'Fragen an Lilli, Nr. 1' },
  { name: 'Zahlungsstand aus Lexware', was: 'Liest aus Lexware, ob eine Rechnung zur Zahlung angestoßen oder bezahlt ist, setzt die Kategorie und archiviert die Mail.', stand: 'später', woher: 'Tarif XL, Prompt 5' },
  { name: 'Terminanfragen', was: 'Liest den Ordner „Terminanfragen“ des Postfachs (freie Mails und Website-Formulare), erkennt Anliegen und Zeitwünsche, ordnet den Patienten zu, schlägt drei freie Zeiten vor (Öffnungszeiten, Feiertage, Kartei, Haupt- und Praxiskalender), reserviert sie im Kalender, legt die Antwort als Entwurf an und trägt den bestätigten Termin in die Kartei ein. Telefon und WhatsApp von Hand.', stand: 'jetzt', woher: 'A15, Prompt 6, W92' },
  { name: 'Cockpit – weitere Teile', was: 'Offene Zahlungen aus Lexware, Freigabe direkt in der Übersicht, Diskret-Schalter für alle Seiten.', stand: 'später', woher: 'Prompt 8, 10' },
  { name: 'Patienten-Pinnwand', was: 'Acht Phasen von der Anfrage bis zur Nachsorge als Spalten oder Zeilen; Fall-Karten ziehen (Regeln prüfen die Daten des vorherigen Schritts), Fall-Details mit Anamnese, Befunden, Erklärungen, Phasenprotokoll.', stand: 'jetzt', woher: 'W76, Prompt 12' },
  { name: 'Schnellaktionen auf der Pinnwand', was: 'Mail-Entwurf direkt aus der Fall-Karte, passend zur Phase; Erkennung „gesendet“ aus „Gesendete Elemente“.', stand: 'später', woher: 'Prompt 13 – der Entwurf selbst geht heute auf der Patientenseite' },
  { name: 'Terminbuchung von der Website', was: 'Das Kontaktformular der Website schickt eine Mail mit festen Feldern; die Praxis-Assistenz liest sie, legt die Anfrage an und schlägt Termine vor.', stand: 'später', woher: 'W92, Prompt 6' },
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
<p><b>Etwas melden:</b> Am Rechner erscheint, wenn du mit der Maus über ein erklärtes Element fährst, an seiner Ecke ein winziges
<b>Fähnchen</b>; unten links steht eines für die ganze Seite. Am Handy gibt es keine Fähnchen – sie würden dort jeden ersten Tipp
verschlucken; stattdessen hat jede Erklärung (lange drücken) den Link „Hinweis oder Fehler melden“. Ein Klick macht einen Screenshot
des Kastens, fragt <b>Hinweis oder Fehler</b> und nimmt deinen Text auf. Alles landet in einer eigenen Entwicklungs-Datenbank –
<a href="/rueckmeldungen">alle Rückmeldungen</a>.</p>
</div>

<h2>Das Cockpit</h2>
<div class="karte">
<p>Das Cockpit ist die Startseite. <b>Links</b> stehen die beiden Bereiche <b>Finanzen</b> und <b>Patienten</b>
mit ihren Seiten – farbige Kacheln kannst du öffnen, graue kommen später. <b>Rechts</b> „Heute im Blick“:
<b>Termine heute</b> (als Leiste und Liste, Namen nur als Initialen), <b>neue Rechnungseingänge</b> und
<b>Terminanfragen</b> – jede Anfrage trägt das Symbol ihres Wegs: E-Mail, WhatsApp, Telefon, Website,
Online-Buchung. <b>Unten</b> steht, was sich in der letzten Woche geändert hat.</p>
<p class="hint">Das Cockpit zeigt nur echte Daten. Ist eine Quelle noch nicht angebunden, steht das dort –
es werden keine Zahlen erfunden. Am iPhone stehen die Teile untereinander, die Übersicht zuerst.</p>
</div>

<h2>Das Rechnungs-Dashboard</h2>
<div class="karte">
<p>Oben die <b>neuen Rechnungen</b> als Kacheln: Dateiname, Lieferant, Betrag, wann die Mail kam und von wem.
Fährst du mit der Maus darüber, steht da, <b>in welchem Ordner die Mail liegt</b>. Der Haken <b>„privat“</b>
nimmt eine Rechnung aus der Praxisbuchhaltung – die Datei wandert nach „Privat“, zurück geht es mit demselben Haken.</p>
<p>Ein <b>Klick auf die Kachel</b> zeigt das PDF. Daneben: <b>Freigeben</b>, <b>Später</b> oder <b>Ablehnen</b> (mit Grund),
und die Angaben Lieferant, Rechnungsnummer, Betrag und Datum zum Korrigieren.</p>
<p>Unten die <b>Auswertung</b>: Summen je Monat und je Lieferant für ein Jahr, ohne private und abgelehnte Rechnungen,
dazu Suche und Filter und die Liste aller Rechnungen.</p>
</div>

<h2>Die Patientenkartei</h2>
<div class="karte">
<p>Jeder Patient ist eine <b>Kachel</b>: Name, Telefon, WhatsApp und Mail als echte Links – am Handy startet ein Tipp den Anruf.
Danach fragt die Patientenseite, <b>worum es ging</b> (Terminverschiebung, Absage, Rückfrage …); so entsteht der Kontaktverlauf von selbst.
Auf der Kachel stehen außerdem <b>Patient seit</b>, die <b>letzte Behandlung</b> (Klick öffnet die Akte) und der <b>nächste Termin</b>
(Rezept oder Individual). Ist eine Rechnung überfällig, wird der Rand <b>gelb</b>, bei mehr als 14 Tagen oder nach Mahnung <b>rot</b>.
Das <b>„+“</b> legt Termin, Behandlung oder Rezept an.</p>
<p>Die <b>Akte</b> folgt § 630f BGB: Anlass, Diagnose, Maßnahmen, Verlauf, Reaktionen, Übungen – verschlüsselt gespeichert, nie geändert oder gelöscht,
sondern durch Folgeeinträge ergänzt; jedes Öffnen steht im Protokoll. Ein <b>Rezept</b> ist eine Stempelkarte: jede erfasste Behandlung mit Rezept setzt einen Haken.
Adressen gibt es mehrere; genau eine ist die <b>Rechnungsadresse</b>. Patienten werden nicht gelöscht, sondern <b>archiviert</b> – die Akte bleibt zehn Jahre.</p>
<p class="hint">Kontaktdaten erscheinen später zusätzlich als Kontakte im Postfach (für das Handy); Termine wandern in den Kalender – beides kommt mit dem nächsten Schritt.</p>
</div>

<h2>Preislisten</h2>
<div class="karte">
<p>Eine Preisliste legt fest, was eine Leistung bei dir kostet. Grundlage ist die <b>amtliche GKV-Vergütungsliste</b>:
dein Preis ist GKV-Preis × <b>Faktor</b> – so rechnet auch die GebüTh. Faktor und Preis rechnen sich gegenseitig um.
Daneben steht der <b>Beihilfe-Höchstbetrag</b>: liegt dein Preis darüber, zahlt ein beihilfeberechtigter Patient die Differenz selbst.</p>
<p>Die <b>GebüTh</b> ist ein Buch zum Kaufen, es gibt sie nicht zum Herunterladen. Ihre Empfehlungen trägst du einmal in eine
Preisliste ein und speicherst sie als <b>Muster</b> – jede neue Preisliste kann es dann übernehmen, mit allen Haken und Faktoren.
<b>Aufrunden</b> rundet eigene Preise auf volle Euro auf. Weicht eine Preisliste beim Speichern von ihrem Muster ab, fragt das System, ob es ein neues Muster geben soll.</p>
<p>Jede Nacht prüft das System, ob es eine neue GKV-Liste, neue Beihilfe-Höchstbeträge oder eine neue GebüTh-Auflage gibt.
Dann steht am Menü „Preislisten“ ein <b>roter Punkt</b>. Eine Preisliste ist erst ein Entwurf, nach „Freigeben“ ist sie fest;
genau eine ist <b>aktiv</b>. Alte kommen ins <b>Archiv</b> und lassen sich zurückholen. Am Handy lassen sich Preislisten nur ansehen.</p>
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
