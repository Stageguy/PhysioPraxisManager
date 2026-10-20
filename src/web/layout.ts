/**
 * Gemeinsamer Rahmen der Praxisseiten: Farben (hell/dunkel), Menü, Fußzeile, Rechtsklick-Hilfe.
 * Kein Inline-Skript (Content-Security-Policy): die Hilfe kommt als /hilfe.js.
 */

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `
:root{--bg:#faf7f9;--fg:#2b1f28;--grau:#6d5f68;--akzent:#722e61;--ok:#2e7d4f;--fehler:#b3261e;--karte:#fff;--rand:#e6dce3}
@media (prefers-color-scheme:dark){:root{--bg:#1b1519;--fg:#f1e9ee;--grau:#b3a5ae;--akzent:#d9a6c9;--ok:#7fd1a0;--fehler:#ff8a80;--karte:#271e24;--rand:#3d3038}}
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
.bereich h2,.tafel h2{display:flex;gap:8px;align-items:center;margin:0 0 12px}
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
.chip.preset5{background:#9fe0d8}.chip.preset19{background:#6fbf73}.chip.preset0{background:#f4a3a8}
@media (max-width:900px){.cockpit{grid-template-columns:minmax(0,1fr)}.uebersicht{order:-1}}
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
  const skript = o.skriptInline !== undefined ? `<script>${o.skriptInline}</script>` : '<script src="/hilfe.js"></script>';
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.titel)}</title>
<style>${CSS}</style></head><body><main${o.breit ? ' class="breit"' : ''}>
<nav aria-label="Menü">${menue}</nav>
${o.inhalt}
<footer>Angemeldet als ${esc(o.wer)} · PhysioPraxisManager ${esc(o.fassung)}</footer>
</main>
${skript}
</body></html>`;
}
