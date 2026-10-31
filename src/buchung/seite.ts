/**
 * Die Buchungsseite (W96) – ein einzelnes HTML-Dokument in den Farben von lilli-nebel.de, zum
 * Einbetten per iframe. Ablauf: Terminart wählen → Tag im Monatsblatt → Uhrzeit → Name, Telefon,
 * Mail, Nachricht → abschicken → Bestätigung „Terminwunsch ist angekommen“. Alles Fachliche kommt
 * aus /api/angebot; die Seite rechnet nur Anfangszeiten aus freien Fenstern. Kein Cookie, kein
 * Tracking, keine fremden Skripte; der Kalender ist nur das Monatsblatt der freien Tage.
 */
export function buchungsSeite(o: { praxis: string; datenschutzUrl: string; vorwahl?: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Termin anfragen – ${esc(o.praxis)}</title>
<style>
:root{--brombeer:#722e61;--brombeer-dark:#4a1d3f;--hellgold:#ebd89b;--holzbraun:#9f7752;--gold:#b09460;--sand-hell:#F5F2ED;--sand2:#E0D0B6;--sand3:#C4B296;--taupe:#756761;--fehler:#b3261e;--ok:#2e7d4f}
*{box-sizing:border-box}
html,body{margin:0;background:transparent}
body{font:15px/1.55 Montserrat,"Segoe UI",system-ui,sans-serif;color:#2b1f28;padding:4px}
.bu{max-width:720px;margin:0 auto;background:var(--sand-hell);border:1px solid var(--sand2);border-radius:14px;padding:18px 18px 22px}
h1{font-family:"Playfair Display",Georgia,serif;font-weight:600;font-size:24px;color:var(--brombeer);margin:0 0 4px}
.hinweis{color:var(--taupe);font-size:13px;margin:0 0 14px}
.schritt{margin:14px 0;padding-top:12px;border-top:1px solid var(--sand2)}
.schritt h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--holzbraun);margin:0 0 8px;font-weight:600}
label{display:block;font-size:13px;color:var(--taupe);margin:8px 0 3px}
select,input,textarea{width:100%;font:inherit;padding:9px 10px;border:1px solid var(--sand3);border-radius:9px;background:#fff;color:#2b1f28}
select:focus,input:focus,textarea:focus,button:focus{outline:2px solid var(--brombeer);outline-offset:1px}
.lang{font-size:14px;color:#4a3d47;margin:8px 0 0;min-height:1.2em}
.sek{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:2px 9px;border-radius:999px;margin-right:6px;color:#fff;background:var(--brombeer)}
.sek.selbstzahler{background:var(--holzbraun)}.sek.wellness{background:var(--gold)}
.monat{display:flex;align-items:center;justify-content:space-between;margin:4px 0 6px}
.monat b{font-family:"Playfair Display",Georgia,serif;font-size:18px;color:var(--brombeer-dark)}
.monat button{background:none;border:1px solid var(--sand3);border-radius:999px;width:36px;height:36px;cursor:pointer;color:var(--brombeer);font-size:18px}
.tage{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.tage .wt{text-align:center;font-size:11px;color:var(--taupe);text-transform:uppercase;letter-spacing:.06em;padding:2px 0}
.tag{border:1px solid transparent;border-radius:9px;min-height:40px;font:inherit;background:transparent;color:var(--sand3);cursor:default;padding:0}
.tag.frei{background:#fff;border-color:var(--sand2);color:#2b1f28;cursor:pointer;font-weight:600}
.tag.frei:hover{border-color:var(--brombeer)}
.tag.gewaehlt{background:var(--brombeer);color:#fff;border-color:var(--brombeer)}
.zeiten{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.zeit{font:inherit;padding:7px 12px;border:1px solid var(--sand2);background:#fff;border-radius:999px;cursor:pointer;color:#2b1f28}
.zeit.gewaehlt{background:var(--brombeer);color:#fff;border-color:var(--brombeer)}
.zwei{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:520px){.zwei{grid-template-columns:1fr}}
.haken{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#4a3d47;margin-top:10px}.haken input{width:auto;margin-top:3px}
.knopf{margin-top:14px;width:100%;font:inherit;font-weight:600;letter-spacing:.04em;padding:12px;border:0;border-radius:999px;background:var(--brombeer);color:#fff;cursor:pointer}
.knopf:disabled{background:var(--sand3);cursor:default}
.zusammen{background:#fff;border:1px solid var(--sand2);border-radius:10px;padding:10px 12px;font-size:14px;margin-top:10px}
.meldung{border-radius:10px;padding:10px 12px;margin-top:12px;font-size:14px}
.meldung.fehler{background:#fbe9e7;color:var(--fehler)}.meldung.ok{background:#e7f4ec;color:var(--ok)}
.honig{position:absolute;left:-9999px;top:-9999px;height:0;overflow:hidden}
.fuss{font-size:11px;color:var(--taupe);margin-top:14px}.fuss a{color:var(--brombeer)}
[hidden]{display:none!important}
</style></head>
<body><div class="bu" id="bu">
<h1>Termin anfragen</h1>
<p class="hinweis" id="hinweis">Bitte wählen Sie Behandlung, Tag und Uhrzeit. Wir melden uns zur Bestätigung.</p>
<form id="f" novalidate>
  <section class="schritt"><h2>1 · Behandlung</h2>
    <label for="terminart">Was möchten Sie buchen?</label>
    <select id="terminart" name="terminart" required><option value="">Bitte wählen …</option></select>
    <p class="lang" id="lang"></p>
  </section>
  <section class="schritt" id="s-tag" hidden><h2>2 · Tag</h2>
    <div class="monat"><button type="button" id="zurueck" aria-label="Vorheriger Monat">‹</button><b id="monat"></b><button type="button" id="weiter" aria-label="Nächster Monat">›</button></div>
    <div class="tage" id="tage" role="grid"></div>
    <p class="lang" id="tag-hinweis"></p>
  </section>
  <section class="schritt" id="s-zeit" hidden><h2>3 · Uhrzeit</h2>
    <div class="zeiten" id="zeiten"></div>
  </section>
  <section class="schritt" id="s-daten" hidden><h2>4 · Ihre Angaben</h2>
    <div class="zwei"><div><label for="name">Vor- und Nachname</label><input id="name" name="name" required maxlength="120" autocomplete="name"></div>
    <div><label for="telefon">Telefon</label><input id="telefon" name="telefon" required maxlength="40" inputmode="tel" autocomplete="tel"></div></div>
    <label for="email">E-Mail (für die Bestätigung)</label><input id="email" name="email" type="email" maxlength="120" autocomplete="email">
    <label for="nachricht">Nachricht (optional – bitte keine Diagnosen oder Befunde, das besprechen wir in der Praxis)</label><textarea id="nachricht" name="nachricht" rows="3" maxlength="500"></textarea>
    <div class="honig" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <label class="haken"><input type="checkbox" id="einwilligung" name="einwilligung" value="1" required> <span>Ich bin einverstanden, dass meine Angaben zur Terminvereinbarung verarbeitet werden (<a href="${esc(o.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>).</span></label>
    <div class="zusammen" id="zusammen"></div>
    <button class="knopf" id="senden" type="submit">Terminwunsch senden</button>
  </section>
  <div class="meldung fehler" id="fehler" hidden></div>
</form>
<div class="meldung ok" id="fertig" hidden></div>
<p class="fuss">${esc(o.praxis)} · Ihr Wunsch ist eine Anfrage, kein fester Termin – die Praxis bestätigt ihn persönlich.</p>
</div>
<script>
(function () {
  var ZONE = 'Europe/Berlin', RASTER = 15, angebot = null, wahl = { art: null, tag: null, zeit: null }, monat = null, start = Date.now(), einladung = null;
  // Uhrzeit aus dem Link (ISO) – wird vorgewählt, sobald eine Behandlung feststeht, dann vergessen
  var vorwahl = null;
  var $ = function (id) { return document.getElementById(id); };
  var fmtTag = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fmtZeit = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
  var fmtMonat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
  var SEK = { rezept: 'Rezept', selbstzahler: 'Selbstzahler', wellness: 'Wellness' };
  function tagVon(iso) { return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(iso)); }
  function hoehe() { if (window.parent !== window) window.parent.postMessage({ buchung: 'hoehe', wert: document.body.scrollHeight + 8 }, '*'); }
  function zeige(id, an) { $(id).hidden = !an; hoehe(); }
  function fehler(t) { $('fehler').textContent = t || ''; zeige('fehler', !!t); }
  function anfangszeiten(fenster, dauer) {
    var z = [], raster = RASTER * 60000, d = dauer * 60000;
    fenster.forEach(function (f) { var bis = new Date(f.ende).getTime(); for (var t = Math.ceil(new Date(f.beginn).getTime() / raster) * raster; t + d <= bis; t += raster) z.push(new Date(t).toISOString()); });
    return z;
  }
  function freieTage() {
    var art = wahl.art, tage = {};
    if (!art) return tage;
    angebot.tage.forEach(function (t) { if (anfangszeiten(t.fenster, art.dauerMin).length) tage[t.datum] = t; });
    return tage;
  }
  function zeichneMonat() {
    var frei = freieTage(), tage = $('tage'); tage.innerHTML = '';
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(function (w) { var e = document.createElement('div'); e.className = 'wt'; e.textContent = w; tage.appendChild(e); });
    var erster = new Date(Date.UTC(monat.j, monat.m, 1)), leer = (erster.getUTCDay() + 6) % 7;
    for (var i = 0; i < leer; i++) tage.appendChild(document.createElement('div'));
    var n = new Date(Date.UTC(monat.j, monat.m + 1, 0)).getUTCDate();
    for (var d = 1; d <= n; d++) {
      var datum = monat.j + '-' + String(monat.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.className = 'tag' + (frei[datum] ? ' frei' : '') + (wahl.tag === datum ? ' gewaehlt' : '');
      if (frei[datum]) b.addEventListener('click', (function (datum) { return function () { wahl.tag = datum; wahl.zeit = null; zeichneMonat(); zeichneZeiten(); }; })(datum));
      else b.disabled = true;
      tage.appendChild(b);
    }
    $('monat').textContent = fmtMonat.format(new Date(Date.UTC(monat.j, monat.m, 15)));
    var keys = Object.keys(frei).sort();
    $('tag-hinweis').textContent = keys.length ? (wahl.tag ? fmtTag.format(new Date(wahl.tag + 'T12:00:00Z')) : 'Freie Tage sind hervorgehoben.') : 'In diesem Zeitraum ist leider nichts frei – bitte rufen Sie uns an.';
    hoehe();
  }
  function zeichneZeiten() {
    var box = $('zeiten'); box.innerHTML = '';
    var tag = freieTage()[wahl.tag];
    zeige('s-zeit', !!tag);
    if (!tag) { zeige('s-daten', false); return; }
    anfangszeiten(tag.fenster, wahl.art.dauerMin).forEach(function (iso) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'zeit' + (wahl.zeit === iso ? ' gewaehlt' : ''); b.textContent = fmtZeit.format(new Date(iso)) + ' Uhr';
      b.addEventListener('click', function () { wahl.zeit = iso; zeichneZeiten(); });
      box.appendChild(b);
    });
    zeige('s-daten', !!wahl.zeit);
    if (wahl.zeit) $('zusammen').innerHTML = '<b>' + wahl.art.kurz + '</b> · ' + fmtTag.format(new Date(wahl.zeit)) + ', ' + fmtZeit.format(new Date(wahl.zeit)) + ' Uhr · ' + wahl.art.dauerMin + ' Minuten';
  }
  function artGewaehlt() {
    var code = $('terminart').value; wahl.art = angebot.terminarten.find(function (t) { return t.code === code; }) || null; wahl.tag = null; wahl.zeit = null;
    $('lang').innerHTML = wahl.art ? '<span class="sek ' + wahl.art.sektion + '">' + SEK[wahl.art.sektion] + '</span>' + (wahl.art.lang ? wahl.art.lang + ' ' : '') + '<b>' + wahl.art.dauerMin + ' Minuten.</b>' : '';
    zeige('s-tag', !!wahl.art);
    if (wahl.art) { var k = Object.keys(freieTage()).sort(); var erst = k[0] ? new Date(k[0] + 'T12:00:00Z') : new Date(); monat = { j: erst.getUTCFullYear(), m: erst.getUTCMonth() }; zeichneMonat(); }
    zeichneZeiten();
    zeitVorwaehlen();
  }
  // Tag und Uhrzeit aus dem Link vorwählen (Schnelltermin der Praxis, W117): gleich beim Laden, wenn der Link die Behandlung bestimmt,
  // sonst sobald der Patient eine gewählt hat (W117d). Ist die Zeit weg, sagt die Seite es und zeigt den Tag
  function zeitVorwaehlen() {
    if (!vorwahl || !wahl.art) return;
    var zeit = vorwahl; vorwahl = null;
    var tag = tagVon(zeit), d0 = new Date(tag + 'T12:00:00Z');
    monat = { j: d0.getUTCFullYear(), m: d0.getUTCMonth() };
    var frei = freieTage()[tag];
    if (frei && anfangszeiten(frei.fenster, wahl.art.dauerMin).indexOf(zeit) >= 0) { wahl.tag = tag; wahl.zeit = zeit; }
    else { wahl.tag = frei ? tag : null; fehler('Die vorgeschlagene Zeit ist leider schon vergeben – bitte wählen Sie eine andere.'); }
    zeichneMonat(); zeichneZeiten();
  }
  function laden() {
    fetch('api/angebot', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (a) {
      angebot = a; RASTER = a.rasterMin || 15;
      if (a.hinweis) $('hinweis').textContent = a.hinweis;
      // Vorwahl aus dem Link: ?terminart=<code> von der Website, ?dauer=30&zeit=<ISO> aus dem Schnelltermin der Praxis (W117) –
      // dann stehen nur Behandlungen dieser Dauer zur Wahl, die erste ist gewählt, Tag und Uhrzeit sind vorgewählt, falls noch frei.
      // Hat keine Behandlung diese Dauer (alter Link, Terminarten geändert): alle zur Wahl, Tag und Uhrzeit folgen der Wahl (W117d)
      var params = new URLSearchParams(location.search), vor = params.get('terminart'), dauer = Number(params.get('dauer')), zeit = params.get('zeit');
      if (zeit && !isNaN(new Date(zeit).getTime())) vorwahl = new Date(zeit).toISOString();
      // Einladung zum Schnelltermin (W117b): ?e=<Kennung> – die Praxis hat Name, Telefon und Mail hinterlegt, die Felder bleiben änderbar
      var e = params.get('e');
      if (e && /^[A-Za-z0-9_-]{8,40}$/.test(e)) fetch('api/einladung/' + e, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
        if (!p) return;
        einladung = e;
        if (p.name && !$('name').value) $('name').value = p.name;
        if (p.telefon && !$('telefon').value) $('telefon').value = p.telefon;
        if (p.email && !$('email').value) $('email').value = p.email;
      }).catch(function () { /* ohne Vorbelegung geht es auch */ });
      var passend = dauer > 0 && a.terminarten.some(function (t) { return t.dauerMin === dauer; });
      var liste = passend ? a.terminarten.filter(function (t) { return t.dauerMin === dauer; }) : a.terminarten;
      var sel = $('terminart'), gruppen = {};
      liste.forEach(function (t) { (gruppen[t.sektion] = gruppen[t.sektion] || []).push(t); });
      ['rezept', 'selbstzahler', 'wellness'].forEach(function (s) {
        if (!gruppen[s]) return;
        var g = document.createElement('optgroup'); g.label = { rezept: 'Physiotherapie auf Rezept', selbstzahler: 'Physiotherapie als Selbstzahler', wellness: 'Wellness & Ayurveda' }[s];
        gruppen[s].forEach(function (t) { var o = document.createElement('option'); o.value = t.code; o.textContent = t.kurz + ' (' + t.dauerMin + ' Min.)'; g.appendChild(o); });
        sel.appendChild(g);
      });
      if (vor && liste.some(function (t) { return t.code === vor; })) { sel.value = vor; artGewaehlt(); }
      else if (passend) { sel.value = liste[0].code; artGewaehlt(); }
      else if (vorwahl) $('lang').textContent = 'Bitte wählen Sie Ihre Behandlung – Tag und Uhrzeit aus Ihrem Link sind dann vorgewählt.';
      hoehe();
    }).catch(function () { fehler('Die Terminwahl ist gerade nicht erreichbar – bitte rufen Sie uns an.'); });
  }
  $('terminart').addEventListener('change', artGewaehlt);
  $('zurueck').addEventListener('click', function () { monat.m--; if (monat.m < 0) { monat.m = 11; monat.j--; } zeichneMonat(); });
  $('weiter').addEventListener('click', function () { monat.m++; if (monat.m > 11) { monat.m = 0; monat.j++; } zeichneMonat(); });
  $('f').addEventListener('submit', function (e) {
    e.preventDefault(); fehler('');
    if (!wahl.art || !wahl.zeit) return fehler('Bitte Behandlung, Tag und Uhrzeit wählen.');
    var daten = { terminart: wahl.art.code, beginn: wahl.zeit, name: $('name').value, telefon: $('telefon').value, email: $('email').value, nachricht: $('nachricht').value, einwilligung: $('einwilligung').checked, website: $('f').elements.website.value, dauerMs: Date.now() - start, einladung: einladung };
    $('senden').disabled = true;
    fetch('api/buchung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok) { $('senden').disabled = false; return fehler(x.j.fehler || 'Das hat nicht geklappt – bitte rufen Sie uns an.'); }
      $('f').hidden = true; $('fertig').innerHTML = '<b>Vielen Dank, Ihr Terminwunsch ist angekommen.</b><br>' + wahl.art.kurz + ' am ' + fmtTag.format(new Date(wahl.zeit)) + ' um ' + fmtZeit.format(new Date(wahl.zeit)) + ' Uhr. Die Praxis meldet sich zur Bestätigung' + ($('email').value ? ' per E-Mail oder Telefon.' : ' telefonisch.'); zeige('fertig', true);
    }).catch(function () { $('senden').disabled = false; fehler('Keine Verbindung – bitte später noch einmal versuchen oder anrufen.'); });
  });
  laden();
})();
</script></body></html>`;
}

/** Kleines Skript für die Website: fügt den iframe ein und passt seine Höhe an die Seite an */
export const EINBETTEN_SKRIPT = String.raw`(function () {
  var s = document.currentScript, ziel = s.getAttribute('data-ziel'), art = s.getAttribute('data-terminart');
  var src = new URL(s.src); src.pathname = src.pathname.replace(/einbetten\.js$/, ''); src.search = art ? '?terminart=' + encodeURIComponent(art) : '';
  var f = document.createElement('iframe'); f.src = src.toString(); f.title = 'Termin anfragen'; f.style.cssText = 'width:100%;border:0;min-height:520px;display:block'; f.setAttribute('loading', 'lazy');
  (ziel ? document.querySelector(ziel) : s.parentNode).insertBefore(f, ziel ? null : s);
  window.addEventListener('message', function (e) { if (e.origin === src.origin && e.data && e.data.buchung === 'hoehe') f.style.height = e.data.wert + 'px'; });
})();`;
