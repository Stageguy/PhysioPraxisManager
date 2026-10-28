/**
 * Gemeinsamer Rahmen der Praxisseiten: Farben (hell/dunkel), Menü, Fußzeile, Rechtsklick-Hilfe.
 * Kein Inline-Skript (Content-Security-Policy): die Hilfe kommt als /hilfe.js.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { umgebung } from '../umgebung.ts';
import { symbol } from './symbole.ts';

/** Was das Menü je Anfrage wissen muss – setzt der Server (roter Punkt bei neuen Preisgrundlagen) */
export const menueStand = new AsyncLocalStorage<{ preislistenNeu: number }>();

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
:root{--sek-rezept:#722e61;--sek-selbstzahler:#8a6440;--sek-wellness:#a8862e;--diagramm:#9a4a86;--bg:#faf7f9;--fg:#2b1f28;--grau:#6d5f68;--akzent:#722e61;--ok:#2e7d4f;--fehler:#b3261e;--karte:#fff;--rand:#e6dce3}
@media (prefers-color-scheme:dark){:root{--sek-rezept:#d9a6c9;--sek-selbstzahler:#d2ad85;--sek-wellness:#e6c977;--diagramm:#c45fab;--bg:#1b1519;--fg:#f1e9ee;--grau:#b3a5ae;--akzent:#d9a6c9;--ok:#7fd1a0;--fehler:#ff8a80;--karte:#271e24;--rand:#3d3038}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 72px}
nav{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px}
nav a{color:var(--akzent);text-decoration:none;padding:6px 12px;border-radius:999px;border:1px solid var(--rand);min-height:36px;display:inline-flex;align-items:center}
nav a[aria-current]{background:var(--akzent);color:var(--bg);border-color:var(--akzent)}
h1{color:var(--akzent);font-size:24px;margin:0 0 4px}
h2{font-size:19px;margin:28px 0 8px;color:var(--akzent)}
h3{font-size:16px;margin:16px 0 4px}
a{color:var(--akzent)}
.karte{background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:12px 16px;margin:8px 0}
.hint{color:var(--grau);font-size:14px}
.liste{list-style:none;padding:0;margin:0;background:var(--karte);border-radius:12px;overflow:hidden;border:1px solid var(--rand)}
.liste li{padding:12px 16px;border-bottom:1px solid var(--rand)}
.liste li:last-child{border-bottom:0}
.liste li span{display:inline-block;width:24px;font-weight:700}
.liste li.ok span{color:var(--ok)} .liste li.fehler span{color:var(--fehler)}
.liste li b{margin-right:6px}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--rand)}
th{color:var(--grau);font-weight:600;font-size:13px}
.tabelle{overflow-x:auto}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:14px;font-weight:600;color:#1b1519;white-space:nowrap;cursor:help}
.chip.preset0{background:#f4a3a8}.chip.preset1{background:#ffc27a}.chip.preset3{background:#fbe97a}
.chip.preset4{background:#a9e4a2}.chip.preset5{background:#9fe0d8}.chip.preset7{background:#9fd3f5}.chip.preset8{background:#d7b8e8}.chip.preset19{background:#6fbf73}
.marke{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--rand);color:var(--grau);white-space:nowrap}
.marke.jetzt{border-color:var(--ok);color:var(--ok)}
a.marke.wa{text-decoration:none;color:#1f8a4c;border-color:#1f8a4c}
/* Terminanfragen (A15) */
.an-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:12px 0}
.an-kachel{display:flex;flex-direction:column;gap:6px;background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--fg)}
.an-kachel.neu{border-color:var(--akzent)}
.an-kachel header{display:flex;align-items:center;gap:8px} .an-kachel header b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.an-betreff{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.an-spalten{display:grid;grid-template-columns:1fr 1fr;gap:12px} @media (max-width:700px){.an-spalten{grid-template-columns:1fr}}
.an-text{white-space:pre-wrap;font:inherit;font-size:14px;max-height:280px;overflow:auto;margin:0;padding:8px 10px;background:var(--bg);border-radius:8px}
.an-vorschlaege{padding-left:22px} .an-vorschlaege li{margin:8px 0} .an-vorschlaege form{display:inline-block;margin-left:8px}
.kanaele-mehr summary{cursor:pointer;margin-top:8px}
.wa-knoepfe .knopf{gap:6px}
fieldset.anhaenge{border:1px solid var(--rand);border-radius:8px;padding:6px 12px 8px;margin:8px 0}
fieldset.anhaenge legend{color:var(--grau);font-size:13px;padding:0 4px}
fieldset.anhaenge label.haken{display:block;margin:4px 0}
form.nachricht textarea{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--rand);border-radius:8px;background:var(--karte);color:var(--fg)}
ol.schritte{padding-left:22px} ol.schritte li{margin:6px 0}
footer{margin-top:32px;font-size:13px;color:var(--grau)}
kbd{font:inherit;font-size:.85em;padding:1px 5px;border:1px solid var(--rand);border-radius:4px}
/* Erklärungen per Rechtsklick */
.hilfe-karte{position:fixed;z-index:1200;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;
  background:var(--karte);border:1px solid var(--rand);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.22);
  padding:12px 14px 10px;font-size:14px;line-height:1.45}
.hilfe-kopf{display:flex;gap:10px;align-items:baseline;margin-bottom:8px}
.hilfe-kopf strong{flex:1;min-width:0;font-size:15px}
.hilfe-schliessen{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:var(--grau);min-width:32px;min-height:32px}
.hilfe-felder{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;margin:0}
.hilfe-felder dt{color:var(--grau);font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding-top:2px}
.hilfe-felder dd{margin:0}
.hilfe-fuss{margin-top:10px;padding-top:8px;border-top:1px solid var(--rand);font-size:12px;color:var(--grau)}
.hilfe-hinweis{position:fixed;right:12px;bottom:10px;z-index:900;font-size:12px;color:var(--grau);background:var(--karte);
  padding:4px 10px;border-radius:999px;border:1px solid var(--rand);max-width:calc(100vw - 24px)}
.hilfe-hinweis.neu{color:var(--akzent);border-color:var(--akzent);font-size:13px;padding:6px 12px}
.hilfe-eintrag{padding:12px 0;border-top:1px solid var(--rand)} .hilfe-eintrag:first-of-type{border-top:0}
.hilfe-eintrag h3{margin:0 0 6px}
/* Cockpit */
main.breit{max-width:1240px}
.sym{flex:none;vertical-align:-5px}
.kopf h1{margin:0}.kopf p{margin:2px 0 0;color:var(--grau)}
.cockpit{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:20px;margin-top:16px;align-items:start}
.bereiche{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;min-width:0}
.bereich h2,.tafel h2,.spaltenkopf{display:flex;gap:8px;align-items:center;margin:0 0 12px}
.uebersicht>.spaltenkopf{margin-bottom:-8px}
.kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.kachel{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;background:var(--karte);border:1px solid var(--rand);
  color:var(--fg);text-decoration:none;min-height:96px;transition:transform .12s,box-shadow .12s}
a.kachel:hover,a.kachel:focus-visible{transform:translateY(-2px);box-shadow:0 6px 18px rgba(114,46,97,.15);border-color:var(--akzent)}
.kachel.aus{opacity:.62;cursor:default}
.kachel-sym{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:color-mix(in srgb,var(--akzent) 12%,transparent);color:var(--akzent);flex:none}
.kachel-text{display:flex;flex-direction:column;gap:4px;font-size:14px}.kachel-text b{font-size:16px}
.kachel-text{min-width:0}.kachel-text .marke{align-self:flex-start;margin-top:2px;white-space:normal}
.uebersicht{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;min-width:0}
.tafel{min-width:0;background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:16px}
.tafel.breit{grid-column:1/-1}
.zaehler{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.zahl{display:flex;flex-direction:column;align-items:flex-start;padding:8px 10px;border-radius:10px;border:1px solid var(--rand)}
.zahl b{font-size:24px;line-height:1.1}.zahl span:last-child{font-size:13px;color:var(--grau)}
.punkt{width:10px;height:10px;border-radius:50%;margin-bottom:4px}
.punkt.preset3,.balken .preset3{background:#f2d43a}.punkt.preset1,.balken .preset1{background:#ff9a2e}
.punkt.preset5,.balken .preset5{background:#3fbfae}.punkt.preset19,.balken .preset19{background:#3f8f4a}
.balken{display:flex;height:12px;border-radius:999px;overflow:hidden;background:var(--rand);margin:4px 0 8px}
.balken span{display:block}.leer-balken{opacity:.5}
.zeilen{list-style:none;margin:8px 0 0;padding:0}
.zeilen li{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--rand);font-size:15px;flex-wrap:wrap}
.zeilen li .rechts,.kanaele .rechts{margin-left:auto;display:flex;gap:8px;align-items:center}
.zeit{font-variant-numeric:tabular-nums;color:var(--grau);min-width:96px}
.kanaele{list-style:none;margin:0;padding:0}
.kanaele li{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--rand)}
.kanaele li:first-child{border-top:0}
.kanaele li>span:nth-child(2){display:flex;flex-direction:column;min-width:0}
.kanal-sym{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--akzent) 10%,transparent);color:var(--akzent);flex:none}
.zahl-klein{font-size:18px;color:var(--grau)}
.leer{color:var(--grau);display:flex;gap:8px;align-items:center;margin:8px 0}
.mehr{display:inline-flex;gap:6px;align-items:center;margin-top:10px;min-height:36px}
.tagesleiste{width:100%;height:auto;display:block;margin:4px 0}
.tagesleiste .raster{stroke:var(--rand)}.tagesleiste .std{fill:var(--grau);font-size:11px;text-anchor:middle}
.tagesleiste .block{fill:var(--akzent);opacity:.85}.tagesleiste .block.frei{opacity:.3}
.tagesleiste .jetzt{stroke:var(--fehler);stroke-width:2}
.protokoll{list-style:none;margin:0;padding:0;columns:2 380px;column-gap:24px}
.protokoll li{display:flex;gap:10px;align-items:baseline;padding:6px 0;border-top:1px solid var(--rand);break-inside:avoid;font-size:14px}
.protokoll time{color:var(--grau);font-variant-numeric:tabular-nums;min-width:110px}
.log-sym{color:var(--akzent)}
.zahlspalte{text-align:right;font-variant-numeric:tabular-nums}
.chip.preset5{background:#9fe0d8}.chip.preset19{background:#6fbf73}.chip.preset0{background:#f4a3a8}.chip.preset12{background:#cfcfd4}.chip.preset9{background:#f0a6bf}.chip.preset24{background:#722e61;color:#fff}
/* Testumgebung: nicht zu übersehen, auf jeder Seite */
.testband{position:sticky;top:0;z-index:1000;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;
  padding:8px 16px;font-size:14px;font-weight:600;color:#1b1519;text-align:center;
  background:repeating-linear-gradient(135deg,#ffd54a 0 16px,#ffe58a 16px 32px);border-bottom:2px solid #1b1519}
/* Rechnungs-Dashboard */
h3{font-size:15px;margin:0 0 8px}
.umbruch{overflow-wrap:anywhere}
.js .nur-ohne-js{display:none}
.knopf{font:inherit;font-size:15px;display:inline-flex;gap:6px;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;
  border-radius:10px;border:1px solid var(--rand);background:var(--karte);color:var(--fg);cursor:pointer}
.knopf.klein{min-height:32px;padding:4px 10px;font-size:13px}
.knopf.primaer{background:var(--akzent);border-color:var(--akzent);color:var(--bg);font-weight:600}
.knopf.warnend{border-color:var(--fehler);color:var(--fehler)}
.knopf:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--akzent);outline-offset:2px}
.meldung{display:flex;gap:8px;align-items:center;padding:10px 14px;border-radius:10px;margin:12px 0}
.meldung[hidden]{display:none}
.meldung.ok{background:color-mix(in srgb,var(--ok) 14%,transparent)}.meldung.fehler{background:color-mix(in srgb,var(--fehler) 14%,transparent)}
.rk-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin:12px 0 20px}
.rk{position:relative;display:flex;flex-direction:column;background:var(--karte);border:1px solid var(--rand);border-radius:14px;min-width:0}
.rk.spaeter{opacity:.7}
.rk-link{display:flex;flex-direction:column;gap:6px;padding:14px 14px 8px;color:var(--fg);text-decoration:none;border-radius:14px 14px 0 0}
.rk-link:hover .rk-datei{text-decoration:underline}
.rk-kopf{display:flex;gap:8px;align-items:flex-start;color:var(--akzent)}
.rk-datei{color:var(--fg);overflow-wrap:anywhere}
.rk-zeile{display:flex;justify-content:space-between;gap:8px;font-size:15px}
.rk-meta{font-size:13px;color:var(--grau);overflow-wrap:anywhere}
.rk-link .marke{align-self:flex-start}
.rk-betrag{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.rk-netto{font-size:12px;color:var(--grau);font-variant-numeric:tabular-nums}
.dash-kopf{margin-top:28px}
.rk-ort{position:absolute;left:10px;right:10px;top:-12px;transform:translateY(-100%);z-index:5;display:flex;gap:6px;align-items:center;
  background:var(--fg);color:var(--bg);font-size:13px;padding:6px 10px;border-radius:8px;visibility:hidden;opacity:0;transition:opacity .12s}
.rk:hover .rk-ort,.rk:focus-within .rk-ort{visibility:visible;opacity:1}
@media (hover:none){.rk-ort{position:static;transform:none;visibility:visible;opacity:1;background:none;color:var(--grau);padding:0 14px}}
.rk-privat{display:flex;gap:10px;align-items:center;padding:8px 14px 12px;margin-top:auto;border-top:1px solid var(--rand)}
.rk-privat label{display:flex;gap:8px;align-items:center;min-height:32px;cursor:pointer}
.rk-privat input[type=checkbox]{width:20px;height:20px;accent-color:var(--akzent)}
.privatliste summary{cursor:pointer;color:var(--grau);min-height:32px}
.filter{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:0 0 12px}
.filter label{display:flex;flex-direction:column;font-size:13px;color:var(--grau);gap:4px}
.filter label.suche{flex:1 1 220px}
.filter select,.filter input,.korrektur input,.ablehnen textarea{font:inherit;font-size:15px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:8px 10px;min-height:40px}
.diagramme{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;margin-bottom:16px}
.diagramm{width:100%;height:auto;display:block}
.diagramm .raster{stroke:var(--rand);stroke-width:1}.diagramm .basis{stroke:var(--grau);stroke-width:1}
.diagramm .achse{fill:var(--grau);font-size:11px;text-anchor:middle}.diagramm .achse.ende{text-anchor:end}
.diagramm .wert{fill:var(--fg);font-size:12px;text-anchor:middle;font-weight:600}
.diagramm .marke-d{fill:var(--diagramm)}.diagramm .treffer{fill:transparent}
.diagramm .ziel:hover .marke-d{opacity:.8}
.balkenliste{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.balkenliste li{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:14px}
.bl-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl-spur{display:block;height:14px}
.bl-fuellung{display:block;height:14px;background:var(--diagramm);border-radius:0 4px 4px 0;min-width:2px}
.bl-wert{font-variant-numeric:tabular-nums;color:var(--fg)}
.ansicht{display:grid;grid-template-columns:minmax(0,3fr) minmax(300px,2fr);gap:16px;align-items:start;margin-top:12px}
.pdf-rahmen{background:var(--karte);border:1px solid var(--rand);border-radius:14px;overflow:hidden;min-height:200px}
.pdf-rahmen iframe{display:block;width:100%;height:80vh;border:0;background:#fff}
.angaben{display:grid;gap:12px;min-width:0}
.angaben h2{font-size:17px;margin:0 0 10px}
.liste-dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin:0}
.liste-dl dt{color:var(--grau);font-size:13px;padding-top:2px}.liste-dl dd{margin:0;overflow-wrap:anywhere}
.links{display:flex;flex-wrap:wrap;gap:6px 16px;margin:12px 0 0}.links a{display:inline-flex;gap:6px;align-items:center;min-height:32px}
.knopfreihe{display:flex;gap:8px;flex-wrap:wrap}.knopfreihe form{margin:0}
.ablehnen{display:grid;gap:8px;margin-top:12px}.ablehnen label,.korrektur label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--grau)}
.korrektur{display:grid;gap:10px}
/* Preislisten */
nav a{position:relative}
.menue-punkt{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#d93025;color:#fff;
  font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 0 0 2px var(--bg)}
.punkt-rot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#d93025;margin-right:8px}
.hinweis-neu{border:1px solid #d93025;background:color-mix(in srgb,#d93025 8%,var(--karte));border-radius:12px;padding:12px 16px;margin:12px 0}
.hinweis-neu p{margin:0 0 6px}.hinweis-neu ul{margin:0 0 8px;padding-left:20px}
.pruefung{list-style:none;padding:0;margin:8px 0;font-size:14px}.pruefung li{display:flex;gap:6px;align-items:center;padding:2px 0}
.pk-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:12px 0 8px}
.pk{display:flex;flex-direction:column;background:var(--karte);border:1px solid var(--rand);border-radius:14px;min-width:0}
.pk.aktiv{border:2px solid var(--ok)}.pk.standard{border:2px solid var(--akzent)}
.pk-fuss{display:flex;gap:14px;flex-wrap:wrap;border-top:1px solid var(--rand);margin-top:auto;padding:4px 14px 8px}.pk-fuss .pk-aktiv-form{border-top:0;padding:4px 0;margin:0}
.pk-link{display:flex;flex-direction:column;gap:8px;padding:14px;color:var(--fg);text-decoration:none}
.pk-link:hover b{text-decoration:underline}
.pk-kopf{display:flex;gap:8px;align-items:center;color:var(--akzent)}.pk-kopf b{color:var(--fg);overflow-wrap:anywhere}
.pk-aktiv-form{padding:8px 14px 12px;border-top:1px solid var(--rand);margin-top:auto;display:flex;gap:10px;align-items:center}
.pk-aktiv{display:flex;gap:8px;align-items:center;min-height:32px;cursor:pointer}.pk-aktiv input{width:20px;height:20px;accent-color:var(--ok)}
.liste-dl.klein{font-size:13px;gap:3px 10px}
form.inline{display:inline-flex;gap:8px;align-items:center;margin:0}
.quellen{list-style:none;margin:8px 0;padding:8px 16px}.quellen li{display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--rand)}
.quellen li:last-child{border-bottom:0}.quellen li span{color:var(--grau);font-size:14px;flex:1}
.formular{display:grid;gap:12px;max-width:760px}
.formular label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--grau)}
.formular input,.formular select,.editor-kopf input,.vorlage-form input{font:inherit;font-size:15px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:8px 10px;min-height:40px}
.formular fieldset{border:1px solid var(--rand);border-radius:10px;padding:10px 14px;display:grid;gap:8px}
.formular .wahl{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;color:var(--fg);font-size:15px}
.scrollliste{max-height:62vh;overflow:auto;border:1px solid var(--rand);border-radius:12px;background:var(--karte)}
.scrollliste thead th{position:sticky;top:0;background:var(--karte);z-index:2;box-shadow:0 1px 0 var(--rand)}
tr[data-href]{cursor:pointer}tr[data-href]:hover td{background:color-mix(in srgb,var(--akzent) 5%,transparent)}
tr.ab td{opacity:.5}
td.mitte{text-align:center}td.mitte input{width:20px;height:20px;accent-color:var(--akzent)}
.zahl-eingabe{width:7.5em;text-align:right;font:inherit;font-variant-numeric:tabular-nums;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:6px 8px;min-height:36px}
.warn{color:var(--fehler)}
.kuerzel{white-space:nowrap}
label.haken{flex-direction:row!important;align-items:center;gap:8px;color:var(--fg)!important;font-size:15px!important;min-height:36px;cursor:pointer}
label.haken input{width:20px;height:20px;min-height:0;accent-color:var(--akzent)}
.faktor-alle{display:grid;gap:6px}
.hinweis-muster{border:1px solid var(--akzent);background:color-mix(in srgb,var(--akzent) 8%,var(--karte));border-radius:12px;padding:12px 16px;margin:12px 0}
.hinweis-muster p{margin:0 0 10px}
.vorlage-form label{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--grau)}
.vorlage-form select{font:inherit;font-size:15px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:6px 8px;min-height:36px}
.editor-kopf{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:16px;align-items:start;margin-bottom:12px}
.editor-kopf label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--grau)}
.faktor-alle .zeile{display:flex;gap:8px;align-items:center}.faktor-alle input{width:7em}
.editor-aktionen{margin-top:12px}.vorlage-form input{min-height:36px}
.nur-mobil{display:none}
@media (max-width:640px){.nur-desktop{display:none!important}.nur-mobil{display:inline}p.nur-mobil{display:block}
  .editor-kopf{grid-template-columns:minmax(0,1fr)}.scrollliste{max-height:none}}
@media (max-width:900px){.cockpit{grid-template-columns:minmax(0,1fr)}.uebersicht{order:-1}
  .diagramme,.ansicht{grid-template-columns:minmax(0,1fr)}.pdf-rahmen iframe{height:60vh}}
@media (max-width:640px){th,td{padding:6px}.hilfe-felder{grid-template-columns:1fr}.hilfe-felder dt{padding-top:6px}
  .zaehler{grid-template-columns:repeat(2,1fr)}.kacheln{grid-template-columns:1fr}.protokoll time{min-width:auto}}
/* Patienten */
.patienten-filter{align-items:flex-end}
.pat-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:12px 0 20px}
.pat{position:relative;display:flex;flex-direction:column;gap:8px;background:var(--karte);border:1px solid var(--rand);border-left:6px solid var(--rand);border-radius:14px;padding:12px 14px;min-width:0}
.pat.gelb{border-left-color:#f2d43a}.pat.rot{border-left-color:#d93025}
.pat.kopf{margin-top:8px}.pat.kopf h1{font-size:22px;margin:0}
.pat.lexware{border-left-style:dashed;border-left-color:var(--grau)}.pat.lexware.vermutet{border-left-color:#f2d43a}.pat.lexware.verknuepft{border-left-style:solid;border-left-color:#2e7d32}
.pat.lexware span.pat-kontakt{color:var(--fg)}.pat.lexware .pat-fuss{gap:8px;align-items:center}.pat.lexware .pat-fuss form.inline{display:inline}
.pat-kopf{display:flex;gap:10px;align-items:center}.pat-name{color:var(--fg);text-decoration:none;font-size:17px;min-width:0;overflow-wrap:anywhere}.pat-name:hover b{text-decoration:underline}
.pat-nr{color:var(--grau);font-size:13px;margin-left:auto;white-space:nowrap}
.pat-hinweise{margin:0;display:flex;gap:6px;flex-wrap:wrap}.marke.warn-marke{border-color:#ff9a2e;color:var(--fg)}
.pat-kontakte{display:flex;gap:6px;flex-wrap:wrap}
.pat-kontakt{display:inline-flex;gap:6px;align-items:center;min-height:44px;padding:6px 12px;border-radius:999px;border:1px solid var(--rand);color:var(--akzent);text-decoration:none;font-size:15px;max-width:100%}
.pat-kontakt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.pat-kontakt:hover,a.pat-kontakt:focus-visible{background:color-mix(in srgb,var(--akzent) 10%,transparent)}
.pat-kontakt.fehlt{color:var(--grau);border-style:dashed}
.pat-fuss{margin:0;display:flex;gap:6px;flex-wrap:wrap;min-height:0}.pat-fuss:empty{display:none}.pat-fuss a.chip{text-decoration:none}
.plus{position:relative;flex:none}.plus summary{list-style:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--akzent);color:var(--bg);font-size:26px;line-height:1;cursor:pointer}
.plus summary::-webkit-details-marker{display:none}
.plus-menue{position:absolute;right:0;top:46px;z-index:20;display:grid;gap:2px;min-width:230px;background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.plus-menue a,.plus-menue .aus{display:flex;gap:8px;align-items:center;min-height:44px;padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--fg)}
.plus-menue a:hover{background:color-mix(in srgb,var(--akzent) 10%,transparent)}.plus-menue .aus{color:var(--grau)}.plus-menue small{margin-left:auto;font-size:11px}
.pat-aktionen{margin:12px 0}
.pat-abschnitt{margin-top:24px}.pat-abschnitt h2{display:flex;gap:8px;align-items:center;margin:0 0 10px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.wahl-chip{display:inline-flex;gap:6px;align-items:center;min-height:40px;padding:4px 12px;border-radius:999px;border:1px solid var(--rand);cursor:pointer;font-size:15px}
.formular label.wahl-chip{flex-direction:row;color:var(--fg);font-size:15px;gap:6px}
.wahl-chip:has(input:checked){background:var(--akzent);color:var(--bg);border-color:var(--akzent)}.wahl-chip input{accent-color:var(--akzent);min-height:0;width:18px;height:18px}
.formular textarea{font:inherit;font-size:15px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:8px 10px}
.formular .zwei{display:grid;grid-template-columns:1fr 1fr;gap:12px}.formular input.kurz{max-width:8em}
.formular.zeile{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:end}.formular.zeile .haken{grid-column:1/-1}.formular.zeile .knopf{grid-column:1/-1;justify-self:start}
.mehr-form summary{display:inline-flex;list-style:none;margin-top:8px}.mehr-form summary::-webkit-details-marker{display:none}.mehr-form .formular{margin-top:10px}
.adr-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.adr{background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.adr.aktiv{border:2px solid var(--ok)}.adr p{margin:0}.adr-fuss{display:flex;gap:8px;align-items:center;margin-top:auto}
.rezepte{list-style:none;margin:0;padding:0;display:grid;gap:8px}.rezepte li{background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:10px 14px}
.stempel{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:6px}.stempel i{width:14px;height:14px;border-radius:50%;border:1px solid var(--akzent)}.stempel i.voll{background:var(--akzent)}
.stempel span{margin-left:6px;font-size:13px;color:var(--grau)}
.stammdaten summary{cursor:pointer;list-style:none}.stammdaten summary::-webkit-details-marker{display:none}.stammdaten summary h2{display:inline-flex}
.stammdaten summary h2::after{content:' ▸';color:var(--grau)}.stammdaten[open] summary h2::after{content:' ▾'}
.fall{margin-top:16px}.behandlungen{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px}
.behandlungen li{border-top:1px solid var(--rand);padding:10px 0}.b-kopf{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px}
@media (max-width:640px){.pat-raster{grid-template-columns:1fr}.formular .zwei{grid-template-columns:1fr}}
/* Pinnwand */
.pw-titel{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.pw-titel h1{display:flex;gap:8px;align-items:center}
.pinnwand{display:grid;gap:12px;margin-top:12px}
.pinnwand.horizontal{grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);overflow-x:auto;padding-bottom:8px;align-items:start}
.pinnwand.vertikal{grid-template-columns:1fr}
.pw-phase{background:color-mix(in srgb,var(--akzent) 5%,var(--bg));border:1px solid var(--rand);border-radius:14px;padding:10px;min-width:0;min-height:120px;transition:background .12s,border-color .12s}
.pw-phase.ziel{border-color:var(--akzent);background:color-mix(in srgb,var(--akzent) 14%,var(--bg))}
.pw-kopf{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}.pw-kopf h2{margin:0;font-size:16px;display:flex;gap:8px;align-items:center}.pw-kopf p{margin:0}
.pw-kopf .knopf{align-self:flex-start;margin-top:4px}
.pw-zahl{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--akzent);color:var(--bg);font-size:12px}
.pw-karten{display:grid;gap:8px}.pinnwand.vertikal .pw-karten{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.pinnwand.vertikal .pw-phase{display:grid;grid-template-columns:200px minmax(0,1fr);gap:12px;align-items:start}.pinnwand.vertikal .pw-kopf{margin:0}
.pw-leer{color:var(--grau);margin:4px 0;text-align:center}
.fk{position:relative;display:flex;flex-direction:column;background:var(--karte);border:1px solid var(--rand);border-left:5px solid var(--rand);border-radius:12px;min-width:0;cursor:grab}
.fk.gelb{border-left-color:#f2d43a}.fk.rot{border-left-color:#d93025}.fk.ziehend{opacity:.5}.fk.wartet{opacity:.6;pointer-events:none}.fk[draggable=false],.fall-kopf .fk{cursor:default}
.fk-link{display:flex;flex-direction:column;gap:4px;padding:10px 40px 10px 12px;color:var(--fg);text-decoration:none;font-size:14px}.fk-link:hover .fk-kopf b{text-decoration:underline}
.fk-kopf{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.fk-kopf b{font-size:15px}.fk-titel{color:var(--akzent)}
.fk-balken{display:block;height:8px;border-radius:999px;background:var(--rand);overflow:hidden;margin-top:2px}.fk-balken span{display:block;height:100%;background:var(--akzent)}
.fk-warn{display:flex;gap:4px;align-items:center;color:#b3261e;font-size:13px}
.fk .plus{position:absolute;right:8px;top:8px}.plus.klein summary{width:30px;height:30px;font-size:20px}
.fall-kopf{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,2fr);gap:16px;margin-top:8px;align-items:start}
.weg{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.weg li{display:flex;flex-direction:column;padding:6px 10px;border-radius:10px;border:1px solid var(--rand);font-size:13px;min-width:90px}
.weg li.vorbei{opacity:.55}.weg li.jetzt{background:var(--akzent);color:var(--bg);border-color:var(--akzent)}.weg li.jetzt .hint{color:var(--bg)}.weg li.bereit{border-color:var(--ok)}
.befunde{list-style:none;margin:0;padding:0;display:grid;gap:8px}.befunde li{background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:10px 14px}
.fall-zwei{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:900px){.pinnwand.horizontal{grid-auto-flow:row;grid-auto-columns:auto}.pinnwand.vertikal .pw-phase{grid-template-columns:1fr}.fall-kopf,.fall-zwei{grid-template-columns:1fr}.fk{cursor:default}}
/* Patientenseite: Termin- und Rechnungskacheln, Kontaktverlauf-Fenster, Stammdaten */
.tk-raster,.rk-pat-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:8px 0}
.tk,.rk-pat{display:flex;flex-direction:column;gap:4px;background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:10px 12px;min-width:0}
.tk.rezept{border-color:var(--ok)}.tk b{font-size:15px}.tk-fuss{display:flex;gap:6px;align-items:center;margin-top:4px}
.tk-fuss select{font:inherit;font-size:13px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:4px 6px;min-height:32px}
.rk-pat{border-left:6px solid var(--rand)}.rk-pat.gelb{border-left-color:#f2d43a}.rk-pat.rot{border-left-color:#d93025}
.rk-pat header{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:var(--akzent)}.rk-pat header b{color:var(--fg);flex:1;min-width:0}
.rk-pat-betrag{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.rk-pat.lexware{border-left-style:dashed;border-left-color:#8a6d3b}.rk-pat.lexware.gelb{border-left-color:#f2d43a}.rk-pat.lexware.rot{border-left-color:#d93025}
/* Rechnungen je Jahr (W104): zuklappbar, Legende oben rechts, Dokumentfenster seitlich */
details.rk-jahr{margin:10px 0 0}details.rk-jahr summary{cursor:pointer;list-style:none;display:flex;gap:8px;align-items:center;font-size:15px;color:var(--grau);min-height:36px}
details.rk-jahr summary::-webkit-details-marker{display:none}details.rk-jahr summary::before{content:'▸';color:var(--akzent);width:14px}details.rk-jahr[open] summary::before{content:'▾'}
details.rk-jahr summary b{color:var(--fg);font-size:16px}
.rk-legende{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;font-weight:400;color:var(--grau);align-items:center;cursor:help}
.rk-legende span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.rk-legende i{display:inline-block;width:18px;height:12px;border-radius:3px;border:1px solid var(--rand);border-left:5px solid var(--rand);background:var(--karte)}
.rk-legende i.lexware{border-left-style:dashed;border-left-color:#8a6d3b}.rk-legende i.gelb{border-left-color:#f2d43a}.rk-legende i.rot{border-left-color:#d93025}
.pdf-fenster{position:fixed;top:0;right:0;height:100dvh;width:min(760px,100vw);background:var(--karte);border-left:1px solid var(--rand);box-shadow:-10px 0 30px rgba(0,0,0,.2);z-index:1100;display:flex;flex-direction:column}
.pdf-fenster[hidden]{display:none}.pdf-fenster header{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--rand);color:var(--akzent)}
.pdf-fenster header b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg)}.pdf-fenster iframe{flex:1;border:0;width:100%;background:#fff}
body.pdf-offen{overflow:hidden}
.pdf-fenster.seite iframe{background:var(--bg)}.pdf-fenster.seite header svg:first-child{display:none}
/* Kachel-Regeln (W114): „+“-Kachel zuerst, Stift bei bearbeitbaren Kacheln, „+“-Menü oben rechts; Seitenfenster für Erfassungsseiten */
.plus-kachel{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;min-width:0;border:2px dashed var(--akzent);border-radius:14px;background:color-mix(in srgb,var(--akzent) 5%,var(--karte));color:var(--akzent);text-decoration:none;cursor:pointer;padding:12px}
a.plus-kachel:hover,a.plus-kachel:focus-visible,.plus-kachel summary:hover{background:color-mix(in srgb,var(--akzent) 12%,var(--karte))}
details.plus-kachel{padding:0}.plus-kachel summary{list-style:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex:1;width:100%;min-height:120px;cursor:pointer;padding:12px;border-radius:12px}
.plus-kachel summary::-webkit-details-marker{display:none}
.plus-zeichen{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--akzent);color:var(--bg);font-size:40px;line-height:1;font-weight:300}
.plus-text{font-size:15px;font-weight:600;text-align:center}
details.plus-kachel[open]::before{content:"";position:fixed;inset:0;background:rgba(27,21,25,.38);z-index:1140}
.plus-popup{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1150;width:min(600px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:var(--karte);color:var(--fg);border:1px solid var(--rand);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);padding:12px 16px 16px;text-align:left;font-weight:400}
.plus-popup header{display:flex;gap:8px;align-items:center;margin-bottom:10px}.plus-popup header b{flex:1;font-size:17px;color:var(--akzent)}
.plus-popup .formular,.plus-popup form{margin:0}
.plus-menue-liste{display:grid;gap:4px}.plus-menue-liste a{display:flex;gap:8px;align-items:center;min-height:44px;padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--fg);font-weight:400}.plus-menue-liste a:hover{background:color-mix(in srgb,var(--akzent) 10%,transparent)}
.plus-menue form.inline{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:4px 8px}
.plus-menue form input:not([type]),.plus-menue form input[type=text],.plus-menue form select{font:inherit;font-size:14px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:4px 8px;min-height:32px;flex:1 1 120px}
.rz,.tk,.tbk,.ta-kachel,.pk,.adr{position:relative}.rz .plus,.tk .plus{position:absolute;right:8px;top:8px}.rz.mit-plus>.rz-kopf,.tk.mit-plus>b{padding-right:36px}
.kachel-stift{position:absolute;right:10px;bottom:10px;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--karte);border:1px solid var(--rand);color:var(--akzent);opacity:0;transition:opacity .12s;z-index:2}
article:hover>.kachel-stift,article:focus-within>.kachel-stift,.kachel-stift:focus-visible{opacity:1}
@media (hover:none){.kachel-stift{opacity:1}}
.im-fenster nav,.im-fenster footer,.im-fenster .testband,.im-fenster .hilfe-hinweis,.im-fenster .rueckmeldung-knopf{display:none}.im-fenster main{padding:12px 16px 32px;max-width:none}
.pw-karten .plus-kachel{min-height:88px}.pw-karten .plus-kachel summary{min-height:88px}.pw-karten .plus-zeichen{width:40px;height:40px;font-size:28px}
.lx-auswahl{display:inline-flex;align-items:center}.lx-auswahl input{width:20px;height:20px}.lx-mehrere h2 .knopf{margin-left:auto}
.lx-abweichungen{margin:6px 0 0;padding-left:18px}.lx-abweichungen li{margin:4px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
fieldset.bestaetigung .wahl-zeile{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px}
canvas.unterschrift{display:block;width:100%;max-width:600px;aspect-ratio:3/1;background:#fff;border:1px dashed var(--akzent);border-radius:10px;touch-action:none;cursor:crosshair;margin:4px 0 8px}
.b-bestaetigung{margin:4px 0 6px;font-size:14px}
figure.girocode{margin:10px 0 0;display:flex;gap:12px;align-items:center}figure.girocode img{border:1px solid var(--rand);border-radius:8px;background:#fff;flex:none}figure.girocode figcaption{font-size:13px;color:var(--grau)}
.verlauf-fenster{max-height:360px;overflow:auto;background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:4px 14px}
details.stammdaten.tafel{padding:10px 16px;margin:0 0 12px}details.stammdaten.tafel>summary{display:inline-flex;gap:6px;align-items:center;min-height:36px;color:var(--akzent);font-weight:600}
details.stammdaten.tafel[open]>summary{margin-bottom:8px}
.js details.stammdaten.tafel:not([open]){display:none}
/* Rezepte als Kacheln */
.rz-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:8px 0 12px}
.tv-kopf{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 10px;font-size:15px}.tv-kopf b{font-weight:600}
.tv-wochen{list-style:none;padding:0;margin:8px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.tv-wochen>li{background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:10px 12px}.tv-wochen>li>b{display:block;margin-bottom:4px}
.tv-wochen ul{list-style:none;padding:0;margin:0}.tv-wochen label.haken{min-height:32px}
table.regelzeiten td input.kurz{width:64px;min-height:32px}table.regelzeiten form.inline{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}
table.regelzeiten td:nth-child(3){white-space:nowrap}details.regelzeiten-liste>summary{margin:8px 0}
.rz{display:flex;flex-direction:column;gap:6px;background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:12px 14px;min-width:0}
.rz.aktiv{border-color:var(--ok)}.rz.ersetzt,.rz.abgebrochen{opacity:.7}
.rz-kopf{display:flex;gap:8px;align-items:center;color:var(--akzent);flex-wrap:wrap}.rz-kopf b{color:var(--fg);flex:1;min-width:0;overflow-wrap:anywhere}
.rz-patient{font-size:15px}.rz-marken{margin:0;display:flex;gap:6px;flex-wrap:wrap}.rz-marken a.marke{text-decoration:none}
/* Rechnungsseite, Konfiguration, Kalender */
.kopf-kalender{margin-left:auto;display:inline-flex;gap:4px;align-items:center;color:var(--akzent);text-decoration:none;font-size:18px;font-weight:400}
.konfig-link{margin-left:12px;display:inline-flex;gap:4px;align-items:center}
.re-kopf{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:8px}.re-kopf h2{font-size:16px;margin:0 0 6px}.re-kopf p{margin:0}
.rp-liste{display:grid;gap:8px}
.rp{display:grid;grid-template-columns:110px 70px minmax(0,1fr) 150px 110px auto auto;gap:10px;align-items:center;background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:8px 14px;min-height:52px}
.rp.erledigt{border-left:5px solid var(--ok)}.rp-nr{font-variant-numeric:tabular-nums;color:var(--grau)}.rp-menge{text-align:right;color:var(--grau);font-variant-numeric:tabular-nums}.rp-betrag{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.rp-edit{grid-column:6}.rp-edit summary{list-style:none;cursor:pointer}.rp-edit summary::-webkit-details-marker{display:none}.rp-edit[open]{grid-column:1/-1}.rp-edit[open] .formular{margin-top:8px}
.rp.neu,.tb.neu,.tbk.neu{display:block;border-style:dashed}.rp.neu summary,.tb.neu summary,.tbk.neu summary{cursor:pointer;display:flex;gap:8px;align-items:center;min-height:36px;list-style:none;color:var(--akzent)}
.rp.neu summary::-webkit-details-marker,.tb.neu summary::-webkit-details-marker,.tbk.neu summary::-webkit-details-marker{display:none}.rp.neu .formular,.tb.neu .formular,.tbk.neu .formular{margin-top:8px}
.rp-plus{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--akzent);color:var(--bg);font-size:20px}
.re-summen{display:flex;gap:16px;justify-content:flex-end;align-items:baseline;margin:10px 0 4px;font-variant-numeric:tabular-nums}.re-summen b{font-size:20px}
.tb-liste,.tbk-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.tb,.tbk{background:var(--karte);border:1px solid var(--rand);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.tb header,.tbk header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tb header form{margin-left:auto}.tb textarea{width:100%}.tb p{margin:0;white-space:pre-wrap}
.tbk.ab{opacity:.6}.tbk-code{display:inline-grid;place-items:center;min-width:34px;height:26px;padding:0 6px;border-radius:8px;background:var(--akzent);color:var(--bg);font-weight:700;font-size:13px}
.tbk-text{margin:0;white-space:pre-wrap;color:var(--grau);font-size:14px}.tbk details summary{list-style:none;display:inline-flex}.tbk details summary::-webkit-details-marker{display:none}.tbk details .formular{margin:8px 0}
.re-aktionen form{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.re-aktionen input[name=grund]{font:inherit;font-size:14px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:6px 10px;min-height:44px}
.kal{display:grid;gap:10px;margin-top:12px}.kal.woche{grid-template-columns:repeat(7,minmax(150px,1fr));overflow-x:auto}.kal.tag{grid-template-columns:minmax(0,1fr)}
.kal-tag{background:color-mix(in srgb,var(--akzent) 5%,var(--bg));border:1px solid var(--rand);border-radius:12px;padding:8px;min-height:120px}.kal-tag.heute{border-color:var(--akzent)}
.kal-tag h2{font-size:15px;margin:0 0 6px;display:flex;gap:6px;align-items:center}.kal-tag h2 a{text-decoration:none}
.kal-termin{display:flex;flex-direction:column;gap:2px;background:var(--karte);border:1px solid var(--rand);border-left:5px solid var(--rand);border-radius:10px;padding:6px 10px;margin-bottom:6px;color:var(--fg);text-decoration:none;font-size:14px}
.kal-termin.rezept{border-left-color:var(--ok)}
.kal-termin.block{border-left-color:var(--grau);color:var(--grau);background:color-mix(in srgb,var(--grau) 9%,var(--karte))}.kal-termin.outlook-patient{border-left-color:var(--akzent);border-style:dashed}
.kal-oeff{margin:-2px 0 6px;font-size:12px;color:var(--grau)}.kal-tag.zu{opacity:.7}
table.oeffnungszeiten input[type=time]{min-height:34px;width:112px}table.oeffnungszeiten input[type=checkbox]{width:20px;height:20px;accent-color:var(--akzent)}
/* Sektionen (W95): Teilrahmen links und Symbol in der Farbe der Sektion */
.kal-termin.sek-rezept{border-left-color:var(--sek-rezept)}.kal-termin.sek-selbstzahler{border-left-color:var(--sek-selbstzahler)}.kal-termin.sek-wellness{border-left-color:var(--sek-wellness)}
.sek-sym{display:inline-flex;align-items:center;vertical-align:-2px;margin-right:4px}.sek-sym.sek-rezept{color:var(--sek-rezept)}.sek-sym.sek-selbstzahler{color:var(--sek-selbstzahler)}.sek-sym.sek-wellness{color:var(--sek-wellness)}
.sek-legende{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--grau);margin:6px 0}.sek-teil{border-left:4px solid;padding-left:6px}.sek-teil.sek-rezept{border-color:var(--sek-rezept)}.sek-teil.sek-selbstzahler{border-color:var(--sek-selbstzahler)}.sek-teil.sek-wellness{border-color:var(--sek-wellness)}
.chip.preset17{background:#c9a27a}.chip.preset18{background:#e3c46a}.chip.preset24{background:#c98bb6}
/* Terminarten (W94) */
.ta-sektion{border-left:6px solid var(--rand);padding-left:14px;margin:22px 0}.ta-sektion.sek-rezept{border-color:var(--sek-rezept)}.ta-sektion.sek-selbstzahler{border-color:var(--sek-selbstzahler)}.ta-sektion.sek-wellness{border-color:var(--sek-wellness)}
.ta-sektion h2{display:flex;align-items:center;gap:8px}
.ta-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.ta-kachel{background:var(--karte);border:1px solid var(--rand);border-top:4px solid var(--rand);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
.ta-kachel.sek-rezept{border-top-color:var(--sek-rezept)}.ta-kachel.sek-selbstzahler{border-top-color:var(--sek-selbstzahler)}.ta-kachel.sek-wellness{border-top-color:var(--sek-wellness)}
.ta-kachel.aus{opacity:.62}.ta-kachel header{display:flex;align-items:center;gap:6px}.ta-kachel header b{flex:1;min-width:0}
.ta-kachel .ta-lang{font-size:14px;margin:0}.ta-kachel .ta-fuss{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ta-kachel form.ta-aktiv{margin-left:auto}.ta-code{font-weight:700;font-size:12px;padding:1px 7px;border-radius:6px;background:var(--bg);border:1px solid var(--rand)}
.ta-vorschau{max-width:520px}.ta-vorschau select{width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--rand);background:var(--karte);color:var(--fg)}
.ta-baustein{width:100%;font:12px/1.4 ui-monospace,monospace;min-height:140px;padding:8px;border-radius:8px;border:1px solid var(--rand);background:var(--bg);color:var(--fg)}.kal-termin.erledigt{opacity:.6}.kal.tag .kal-termin{flex-direction:row;gap:12px;align-items:center;flex-wrap:wrap}
@media (max-width:900px){.re-kopf{grid-template-columns:1fr}.rp{grid-template-columns:1fr 1fr;grid-auto-rows:auto}.rp-edit{grid-column:auto}.kal.woche{grid-template-columns:1fr}}
/* Steuerfreie Umsätze */
.steuer-pos{list-style:none;margin:0;padding:0;font-size:13px}.steuer-pos li{display:grid;grid-template-columns:80px 60px minmax(0,1fr) 110px 90px;gap:8px;padding:2px 0;border-top:1px dashed var(--rand)}.steuer-pos li:first-child{border-top:0}
.spaltenkopf .knopf{margin-left:auto;font-weight:400}
@media (max-width:640px){.steuer-pos li{grid-template-columns:1fr 1fr}}
/* Rückmeldungen: Fähnchen und Fenster */
.rm-marke{position:absolute;z-index:1100;display:none;place-items:center;width:16px;height:16px;padding:0;border-radius:50%;border:1px solid var(--akzent);background:var(--karte);color:var(--akzent);cursor:pointer;opacity:.85}
.rm-marke:hover{opacity:1;transform:scale(1.25)}
.rm-seite{position:fixed;left:10px;bottom:10px;z-index:900;display:grid;place-items:center;width:22px;height:22px;padding:0;border-radius:50%;border:1px solid var(--rand);background:var(--karte);color:var(--grau);cursor:pointer}
.rm-seite:hover{color:var(--akzent);border-color:var(--akzent)}
.rm-dialog{border:1px solid var(--rand);border-radius:14px;padding:0;width:min(720px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:var(--karte);color:var(--fg);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.rm-dialog::backdrop{background:rgba(0,0,0,.45)}
.rm-form{display:grid;gap:12px;padding:16px;margin:0}
.rm-kopf{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.rm-kopf strong{display:inline-flex;gap:6px;align-items:center;font-size:17px;color:var(--akzent)}.rm-kopf .hilfe-schliessen{margin-left:auto}
.rm-bild{max-width:100%;max-height:40vh;object-fit:contain;border:1px solid var(--rand);border-radius:10px;background:var(--bg)}
.rm-art{display:flex;gap:8px}
.rm-werkzeuge{display:flex;gap:4px}.rm-werkzeuge button{font:inherit;min-width:36px;min-height:32px;border:1px solid var(--rand);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.rm-text-eingabe{min-height:120px;max-height:40vh;overflow:auto;padding:10px 12px;border:1px solid var(--rand);border-radius:8px;background:var(--bg);font-size:15px;line-height:1.5}
.rm-text-eingabe:empty::before{content:attr(data-platzhalter);color:var(--grau)}
.rm-status:empty{display:none}
.rm-eintrag{background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:12px 16px;margin:12px 0}
.rm-eintrag.erledigt{opacity:.7}
.rm-eintrag header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.rm-eintrag header .rechts{margin-left:auto}
.rm-inhalt{display:grid;grid-template-columns:minmax(0,280px) minmax(0,1fr);gap:16px;align-items:start}
.rm-inhalt img{max-width:100%;border:1px solid var(--rand);border-radius:8px;background:var(--bg)}
.rm-text p{margin:0 0 6px}.rm-antwort{border-top:1px solid var(--rand);padding-top:6px}
.rm-fuss{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}.rm-fuss input{flex:1 1 220px;font:inherit;font-size:14px;color:var(--fg);background:var(--bg);border:1px solid var(--rand);border-radius:8px;padding:6px 10px;min-height:32px}
@media (max-width:640px){.rm-inhalt{grid-template-columns:1fr}}
`;

export type Menuepunkt = 'cockpit' | 'patienten' | 'status' | 'preislisten' | 'hilfe';

export function seite(o: {
  titel: string;
  aktiv: Menuepunkt;
  inhalt: string;
  wer: string;
  fassung: string;
  /** Für die Vorschau ohne Server: Skript direkt einbetten statt /hilfe.js laden */
  skriptInline?: string;
  /** Breites Raster (Cockpit) statt Lesespalte */
  breit?: boolean;
}): string {
  const neu = menueStand.getStore()?.preislistenNeu ?? 0;
  const menue = ([['cockpit', '/', 'Cockpit'], ['patienten', '/patienten', 'Patienten'], ['status', '/status', 'Status'], ['preislisten', '/preislisten', 'Preislisten'], ['hilfe', '/hilfe', 'Hilfe']] as const)
    .map(([key, href, text]) => {
      const punkt = key === 'preislisten' && neu
        ? `<span class="menue-punkt" data-hilfe="menue.preislisten-neu" role="status" aria-label="${neu} neue Preisgrundlage(n)">${neu}</span>` : '';
      return `<a href="${href}" data-hilfe="menue.${key}"${o.aktiv === key ? ' aria-current="page"' : ''}>${text}${punkt}</a>`;
    })
    .join('');
  const skript = o.skriptInline !== undefined ? `<script>${o.skriptInline}</script>` : '<script src="/hilfe.js"></script><script src="/praxis.js"></script><script src="/rueckmeldung.js"></script>';
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${umgebung() === 'test' ? 'TEST · ' : ''}${esc(o.titel)}</title>
<style>${CSS}</style></head><body>${umgebung() === 'test'
  ? '<div class="testband" role="note" data-hilfe="umgebung.test" tabindex="0">TESTUMGEBUNG – erfundene Patienten · Mails nur an Testadressen · Termine im Kalender „Praxis-Test“</div>'
  : ''}<main${o.breit ? ' class="breit"' : ''}>
<nav aria-label="Menü">${menue}</nav>
${o.inhalt}
<footer>Angemeldet als ${esc(o.wer)} · PhysioPraxisManager ${esc(o.fassung)}</footer>
</main>
<aside class="pdf-fenster" id="pdf-fenster" hidden aria-label="Seitenfenster">
  <header>${symbol('rechnung', { groesse: 18 })}<b id="pdf-titel"></b><a id="pdf-oeffnen" class="knopf klein" href="#" data-hilfe="pdf.oeffnen">Öffnen</a><button type="button" class="knopf klein" id="pdf-schliessen" data-hilfe="pdf.schliessen">${symbol('kreuz', { groesse: 16 })} Schließen</button></header>
  <iframe id="pdf-rahmen" title="Seitenfenster" src="about:blank"></iframe>
</aside>
${skript}
</body></html>`;
}
