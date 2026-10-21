/**
 * Gemeinsamer Rahmen der Praxisseiten: Farben (hell/dunkel), Menü, Fußzeile, Rechtsklick-Hilfe.
 * Kein Inline-Skript (Content-Security-Policy): die Hilfe kommt als /hilfe.js.
 */

import { umgebung } from '../umgebung.ts';

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
:root{--diagramm:#9a4a86;--bg:#faf7f9;--fg:#2b1f28;--grau:#6d5f68;--akzent:#722e61;--ok:#2e7d4f;--fehler:#b3261e;--karte:#fff;--rand:#e6dce3}
@media (prefers-color-scheme:dark){:root{--diagramm:#c45fab;--bg:#1b1519;--fg:#f1e9ee;--grau:#b3a5ae;--akzent:#d9a6c9;--ok:#7fd1a0;--fehler:#ff8a80;--karte:#271e24;--rand:#3d3038}}
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
.chip.preset5{background:#9fe0d8}.chip.preset19{background:#6fbf73}.chip.preset0{background:#f4a3a8}.chip.preset12{background:#cfcfd4}.chip.preset9{background:#f0a6bf}
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
@media (max-width:900px){.cockpit{grid-template-columns:minmax(0,1fr)}.uebersicht{order:-1}
  .diagramme,.ansicht{grid-template-columns:minmax(0,1fr)}.pdf-rahmen iframe{height:60vh}}
@media (max-width:640px){th,td{padding:6px}.hilfe-felder{grid-template-columns:1fr}.hilfe-felder dt{padding-top:6px}
  .zaehler{grid-template-columns:repeat(2,1fr)}.kacheln{grid-template-columns:1fr}.protokoll time{min-width:auto}}
`;

export type Menuepunkt = 'cockpit' | 'status' | 'hilfe';

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
  const menue = ([['cockpit', '/', 'Cockpit'], ['status', '/status', 'Status'], ['hilfe', '/hilfe', 'Hilfe']] as const)
    .map(([key, href, text]) =>
      `<a href="${href}" data-hilfe="menue.${key}"${o.aktiv === key ? ' aria-current="page"' : ''}>${text}</a>`)
    .join('');
  const skript = o.skriptInline !== undefined ? `<script>${o.skriptInline}</script>` : '<script src="/hilfe.js"></script><script src="/praxis.js"></script>';
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
${skript}
</body></html>`;
}
