/**
 * Rückmeldungen (W72): ein sehr kleines Fähnchen an jedem erklärten Element (data-hilfe) und eines
 * für die ganze Seite. Ein Klick macht einen Screenshot des Kastens, in dem das Element liegt, und
 * öffnet ein Fenster: Hinweis oder Fehler, Richtext, Senden. Alles landet in der Entwicklungs-
 * Datenbank – getrennt von den Patientendaten. Die Seite /rueckmeldungen sammelt sie ein.
 */
import type { Rueckmeldung } from '../entwicklung/rueckmeldung.ts';
import { esc, seite } from './layout.ts';
import { datumZeitText } from '../format.ts';
import { symbol } from './symbole.ts';


/** Nur die erlaubten Auszeichnungen stehen in text_html (htmlBereinigen) – trotzdem alles andere maskieren */
const sicheresHtml = (html: string) =>
  html.replace(/<(\/?)(b|i|u|p|br|ul|ol|li)>/g, '\u0000$1$2\u0001').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/\u0000(\/?)(\w+)\u0001/g, '<$1$2>');

export function rueckmeldungenSeite(d: { liste: Rueckmeldung[]; status: string; offen: number }, o: { wer: string; fassung: string; meldung?: string; fehler?: string; skriptInline?: string }): string {
  const eintraege = d.liste.map((r) => `<article class="rm-eintrag ${r.status}" id="rm-${r.id}" data-hilfe="rueckmeldungen.eintrag">
    <header><span class="chip ${r.art === 'fehler' ? 'preset0' : 'preset7'}">${r.art === 'fehler' ? 'Fehler' : 'Hinweis'}</span>
      <b>${esc(r.elementTitel ?? r.element ?? 'Seite')}</b> <span class="hint">${esc(r.seite)}${r.element ? ` · ${esc(r.element)}` : ''}</span>
      <span class="rechts hint">Nr. ${r.id} · ${datumZeitText(r.erstelltAm, { wochentag: false, jahr: true })} · ${esc(r.von)}${r.status === 'erledigt' ? ` · erledigt ${r.erledigtAm ? datumZeitText(r.erledigtAm, { wochentag: false, jahr: true }) : ''}` : ''}</span></header>
    <div class="rm-inhalt">
      ${r.hatBild ? `<a href="/rueckmeldungen/${r.id}/bild" target="_blank" rel="noopener" data-hilfe="rueckmeldungen.bild"><img src="/rueckmeldungen/${r.id}/bild" alt="Screenshot zu Rückmeldung ${r.id}" loading="lazy"></a>` : '<span class="hint">kein Screenshot</span>'}
      <div class="rm-text">${sicheresHtml(r.textHtml)}
        <p class="hint">${esc([r.fassung, r.umgebung, r.fenster, r.browser].filter(Boolean).join(' · '))}</p>
        ${r.antwort ? `<p class="rm-antwort"><b>Antwort:</b> ${esc(r.antwort)}</p>` : ''}
      </div>
    </div>
    <form method="post" action="/rueckmeldungen/aktion" class="rm-fuss"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="zurueck" value="/rueckmeldungen?status=${esc(d.status)}">
      ${r.status === 'offen'
        ? `<input name="antwort" placeholder="Antwort oder Vermerk (optional)" maxlength="500"><button class="knopf klein" name="aktion" value="erledigt" data-hilfe="rueckmeldungen.erledigt">Erledigt</button>`
        : `<button class="knopf klein" name="aktion" value="offen" data-hilfe="rueckmeldungen.offen">Wieder öffnen</button>`}
    </form>
  </article>`).join('');
  return seite({
    titel: 'Rückmeldungen', aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline, breit: true,
    inhalt: `<p class="hint"><a href="/hilfe">Hilfe</a> › Rückmeldungen</p><h1>${symbol('fahne', { groesse: 26 })} Rückmeldungen <span class="hint">${d.offen} offen</span></h1>
${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}
<p class="hint">Was Lilli und Christian über das kleine Fähnchen gemeldet haben. Die Rückmeldungen liegen in einer eigenen Entwicklungs-Datenbank, getrennt von den Patientendaten.</p>
<form method="get" action="/rueckmeldungen" class="filter"><label>Stand<select name="status" data-auto-senden data-hilfe="rueckmeldungen.filter">${['offen', 'erledigt', 'alle'].map((s) => `<option value="${s}"${s === d.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label><button class="knopf klein nur-ohne-js">anzeigen</button></form>
${eintraege || '<p class="leer">Keine Rückmeldungen in dieser Ansicht.</p>'}`,
  });
}

/** /rueckmeldung.js – Fähnchen, Screenshot (html2canvas, nachgeladen), Fenster, Senden. Keine Inline-Skripte (CSP). */
export const RUECKMELDUNG_SKRIPT = String.raw`
(function () {
  var FAHNE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/></svg>';
  var marke, aktuell = null, dialog, geladen = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fassung() { var f = document.querySelector('footer'); var m = f && /PhysioPraxisManager (\S+)/.exec(f.textContent); return m ? m[1] : ''; }
  function umgebung() { return document.querySelector('.testband') ? 'test' : 'prod'; }
  function titelVon(el) { var k = el && el.getAttribute('data-hilfe'); return k && window.HILFE && HILFE[k] ? HILFE[k].titel : ''; }

  // ── Fähnchen am Element (erscheint beim Überfahren / Fokus) und für die ganze Seite ──
  function markeFuer(el) {
    if (!marke) { marke = document.createElement('button'); marke.type = 'button'; marke.id = 'rmMarke'; marke.className = 'rm-marke'; marke.title = 'Hinweis oder Fehler zu diesem Element melden'; marke.setAttribute('aria-label', marke.title); marke.innerHTML = FAHNE; document.body.appendChild(marke);
      marke.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (aktuell) oeffne(aktuell); }); }
    aktuell = el;
    var r = el.getBoundingClientRect();
    marke.style.left = Math.round(Math.min(r.right - 8, window.innerWidth - 20) + window.scrollX) + 'px';
    marke.style.top = Math.round(Math.max(0, r.top - 8) + window.scrollY) + 'px';
    marke.style.display = 'grid';
  }
  function markeWeg() { if (marke) marke.style.display = 'none'; }
  document.addEventListener('mouseover', function (e) {
    if (e.target.closest && e.target.closest('#rmMarke, #rmDialog, #hilfeKarte')) return;
    var el = e.target.closest && e.target.closest('[data-hilfe]');
    if (el) markeFuer(el); else markeWeg();
  });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-hilfe]'); if (el) markeFuer(el); });
  document.addEventListener('DOMContentLoaded', function () {
    var s = document.createElement('button'); s.type = 'button'; s.id = 'rmSeite'; s.className = 'rm-seite'; s.title = 'Hinweis oder Fehler zu dieser Seite melden'; s.setAttribute('aria-label', s.title); s.innerHTML = FAHNE;
    s.addEventListener('click', function () { oeffne(null); });
    document.body.appendChild(s);
  });
  // Aus der Erklärungskarte (Rechtsklick / lange drücken): Link „melden“
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-rm-melden]');
    if (!a) return;
    e.preventDefault();
    var k = a.getAttribute('data-rm-melden'), el = document.querySelector('[data-hilfe="' + k.replace(/"/g, '') + '"]');
    var p = document.getElementById('hilfePlatz'); if (p) p.innerHTML = '';
    oeffne(el);
  });

  // ── Screenshot: der Kasten, in dem das Element liegt ──
  function html2canvasLaden() {
    if (window.html2canvas) return Promise.resolve();
    if (!geladen) geladen = new Promise(function (ok, nein) { var s = document.createElement('script'); s.src = '/html2canvas.js'; s.onload = ok; s.onerror = nein; document.head.appendChild(s); });
    return geladen;
  }
  function kasten(el) {
    if (!el) return null;
    var k = el.closest('article, section, .tafel, .karte, form, nav, header, tr, .hinweis-muster, .hinweis-neu') || el;
    if (k.getBoundingClientRect().height > window.innerHeight * 1.5) k = el;
    return k;
  }
  function screenshot(el) {
    return html2canvasLaden().then(function () {
      var ziel = kasten(el), o = { logging: false, useCORS: false, scale: Math.min(2, window.devicePixelRatio || 1), backgroundColor: getComputedStyle(document.body).backgroundColor, ignoreElements: function (n) { return n.id === 'rmMarke' || n.id === 'rmSeite' || n.id === 'rmDialog' || n.id === 'hilfeHinweis'; } };
      if (!ziel) { ziel = document.documentElement; o.x = window.scrollX; o.y = window.scrollY; o.width = window.innerWidth; o.height = window.innerHeight; o.windowWidth = window.innerWidth; o.windowHeight = window.innerHeight; }
      return html2canvas(ziel, o);
    }).then(function (c) {
      var max = 1400, s = Math.min(1, max / c.width), out = c;
      if (s < 1) { out = document.createElement('canvas'); out.width = Math.round(c.width * s); out.height = Math.round(c.height * s); out.getContext('2d').drawImage(c, 0, 0, out.width, out.height); }
      return out.toDataURL('image/jpeg', 0.82);
    }).catch(function () { return ''; });
  }

  // ── Fenster ──
  function dialogHtml(el, bild) {
    var key = el ? el.getAttribute('data-hilfe') : '', titel = el ? (titelVon(el) || key) : 'Diese Seite';
    return '<form method="dialog" class="rm-form">' +
      '<div class="rm-kopf"><strong>' + FAHNE + ' Rückmeldung</strong><span class="hint">' + esc(titel) + ' · ' + esc(location.pathname) + '</span><button type="button" class="hilfe-schliessen" value="abbrechen" aria-label="Schließen">×</button></div>' +
      (bild ? '<img class="rm-bild" src="' + bild + '" alt="Screenshot des Elements">' : '<p class="hint">Kein Screenshot möglich – der Text genügt.</p>') +
      '<div class="rm-art"><label class="wahl-chip"><input type="radio" name="art" value="hinweis" checked> Hinweis</label><label class="wahl-chip"><input type="radio" name="art" value="fehler"> Fehler</label></div>' +
      '<div class="rm-werkzeuge"><button type="button" data-cmd="bold" title="Fett"><b>F</b></button><button type="button" data-cmd="italic" title="Kursiv"><i>K</i></button><button type="button" data-cmd="underline" title="Unterstrichen"><u>U</u></button><button type="button" data-cmd="insertUnorderedList" title="Aufzählung">•</button><button type="button" data-cmd="insertOrderedList" title="Nummerierung">1.</button></div>' +
      '<div class="rm-text-eingabe" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Was fällt auf?" data-platzhalter="Was fällt auf? Was würdest du anders machen?"></div>' +
      '<p class="rm-status hint" aria-live="polite"></p>' +
      '<div class="knopfreihe"><button type="button" class="knopf primaer" data-senden>Senden</button><button type="button" class="knopf" value="abbrechen" data-abbrechen>Abbrechen</button></div></form>';
  }
  function oeffne(el) {
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'rmDialog'; dialog.className = 'rm-dialog'; document.body.appendChild(dialog);
      dialog.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-cmd')) { e.preventDefault(); dialog.querySelector('.rm-text-eingabe').focus(); document.execCommand(b.getAttribute('data-cmd'), false, null); }
        else if (b.hasAttribute('data-abbrechen') || b.classList.contains('hilfe-schliessen')) dialog.close();
        else if (b.hasAttribute('data-senden')) senden(el);
      }); }
    markeWeg();
    screenshot(el).then(function (bild) {
      dialog.innerHTML = dialogHtml(el, bild);
      dialog.dataset.bild = bild;
      dialog.dataset.element = el ? el.getAttribute('data-hilfe') : '';
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      dialog.querySelector('.rm-text-eingabe').focus();
    });
  }
  function senden(el) {
    var st = dialog.querySelector('.rm-status'), text = dialog.querySelector('.rm-text-eingabe').innerHTML, art = (dialog.querySelector('input[name=art]:checked') || {}).value;
    if (!dialog.querySelector('.rm-text-eingabe').textContent.trim()) { st.textContent = 'Bitte kurz beschreiben, was auffällt.'; return; }
    st.textContent = 'Wird gesendet …';
    fetch('/rueckmeldung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      art: art, seite: location.pathname + location.search, element: dialog.dataset.element || '', elementTitel: titelVon(el), textHtml: text, bild: dialog.dataset.bild || '',
      fassung: fassung(), umgebung: umgebung(), browser: navigator.userAgent, fenster: window.innerWidth + '×' + window.innerHeight,
    }) }).then(function (r) { return r.json(); }).then(function (a) {
      if (!a.ok) { st.textContent = a.fehler || 'Das hat nicht geklappt.'; return; }
      dialog.querySelector('.rm-form').innerHTML = '<div class="rm-kopf"><strong>Danke!</strong></div><p>Rückmeldung Nr. ' + esc(a.id) + ' ist gespeichert. <a href="/rueckmeldungen">Alle Rückmeldungen</a></p><div class="knopfreihe"><button type="button" class="knopf primaer" data-abbrechen>Schließen</button></div>';
    }).catch(function () { st.textContent = 'Keine Verbindung – bitte später noch einmal.'; });
  }
})();
`;
