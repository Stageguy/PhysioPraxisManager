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
@media (max-width:640px){th,td{padding:6px}.hilfe-felder{grid-template-columns:1fr}.hilfe-felder dt{padding-top:6px}}
`;

export type Menuepunkt = 'status' | 'hilfe';

export function seite(o: {
  titel: string;
  aktiv: Menuepunkt;
  inhalt: string;
  wer: string;
  fassung: string;
  /** Für die Vorschau ohne Server: Skript direkt einbetten statt /hilfe.js laden */
  skriptInline?: string;
}): string {
  const menue = ([['status', '/', 'Status'], ['hilfe', '/hilfe', 'Hilfe']] as const)
    .map(([key, href, text]) =>
      `<a href="${href}" data-hilfe="menue.${key}"${o.aktiv === key ? ' aria-current="page"' : ''}>${text}</a>`)
    .join('');
  const skript = o.skriptInline !== undefined ? `<script>${o.skriptInline}</script>` : '<script src="/hilfe.js"></script>';
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.titel)}</title>
<style>${CSS}</style></head><body><main>
<nav aria-label="Menü">${menue}</nav>
${o.inhalt}
<footer>Angemeldet als ${esc(o.wer)} · PhysioPraxisManager ${esc(o.fassung)}</footer>
</main>
${skript}
</body></html>`;
}
