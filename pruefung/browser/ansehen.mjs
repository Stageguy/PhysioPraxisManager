/**
 * Seiten im Browser ansehen und vermessen – Kopie des Prüfbrowsers aus
 * mdr-Infrastruktur/pruefung/browser (dort beschlossen 16.10.2026), angepasst für die Praxis.
 *
 * Läuft im Container am Server (ansehen.sh), mit WebKit – der Engine von Safari. Auf dem Mac wird
 * kein Browser gebraucht, Chrome wird nicht benutzt. Ein Auftrag (JSON) nennt Seiten, Fensterbreiten,
 * Kopfzeilen (etwa Tailscale-User-Login für den Praxisdienst) und optional eine zu vermessende Tabelle.
 * Je Seite und Breite: Foto des Fensters, auf Wunsch der ganzen Seite, und eine Messung:
 *
 *   - läuft die Seite waagerecht über (document breiter als das Fenster) – und welche Elemente ragen hinaus;
 *   - bei `tabelle`: passt sie in ihren Behälter, welche Spalten liegen außerhalb, welche Zellen sind abgeschnitten.
 *
 *   node ansehen.mjs auftrag.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { webkit, firefox } from 'playwright-core';

const auftrag = JSON.parse(readFileSync(process.argv[2] ?? 'auftrag.json', 'utf8'));
const aus = auftrag.ausgabe ?? 'ergebnisse';
mkdirSync(aus, { recursive: true });

const browser = await (auftrag.browser === 'firefox' ? firefox : webkit).launch();
const bericht = [];

for (const breite of auftrag.breiten ?? [1440]) {
  const kontext = await browser.newContext({
    viewport: { width: breite, height: auftrag.hoehe ?? 900 },
    locale: 'de-DE',
    colorScheme: auftrag.farbschema ?? 'light',
    extraHTTPHeaders: auftrag.kopfzeilen ?? {},
    // `beruehrung`: Handy nachstellen (Touch, keine Maus) – prüft, was unter `(hover: none)` erscheint
    ...(auftrag.beruehrung ? { hasTouch: true, isMobile: true } : {}),
  });
  const seite = await kontext.newPage();
  for (const ansicht of auftrag.ansichten) {
    const name = `${ansicht.name}-${breite}`;
    const antwort = await seite.goto(new URL(ansicht.pfad, auftrag.basis).href, { waitUntil: 'networkidle' });
    if (ansicht.warte) await seite.waitForSelector(ansicht.warte, { timeout: 30_000 });
    await seite.waitForTimeout(300);
    const messung = await seite.evaluate((auswahl) => {
      const doc = document.documentElement;
      const fenster = window.innerWidth;
      // Elemente, deren rechter Rand über das Fenster hinausragt (die äußersten, nicht jedes Kind)
      const hinaus = [...document.body.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > fenster + 1 && !el.closest('.tabelle'))
        .filter((el, _, alle) => !alle.some((a) => a !== el && a.contains(el)))
        .slice(0, 10)
        .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} (${Math.round(el.getBoundingClientRect().right)}px)`);
      const ergebnis = { fenster, seite: doc.scrollWidth, ueberlaeuft: doc.scrollWidth > fenster + 1, hinaus,
        hover: matchMedia('(hover: hover)').matches ? 'hover' : 'none',
        ...(auswahl.zaehlen ? { gezaehlt: document.querySelectorAll(auswahl.zaehlen).length } : {}) };
      if (!auswahl.tabelle) return ergebnis;
      const tabelle = document.querySelector(auswahl.tabelle);
      if (!tabelle) return { ...ergebnis, tabelleFehlt: auswahl.tabelle };
      const behaelter = tabelle.closest('.tabelle') ?? tabelle.parentElement;
      const sicht = Math.min(behaelter.getBoundingClientRect().right, fenster);
      const spalten = [...tabelle.querySelectorAll('thead th')].map((th) => {
        const r = th.getBoundingClientRect();
        return { kopf: th.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), breite: Math.round(r.width), sichtbar: r.right <= sicht + 1 };
      });
      return {
        ...ergebnis,
        tabelle: Math.round(tabelle.getBoundingClientRect().width),
        behaelter: Math.round(behaelter.clientWidth),
        tabelleUeberlauf: behaelter.scrollWidth > behaelter.clientWidth + 1,
        unsichtbar: spalten.filter((s) => !s.sichtbar).map((s) => s.kopf),
        abgeschnitten: [...tabelle.querySelectorAll('tbody td')].filter((td) => td.scrollWidth > td.clientWidth + 1).length,
      };
    }, { tabelle: ansicht.tabelle ?? null, zaehlen: ansicht.zaehlen ?? auftrag.zaehlen ?? null });
    await seite.screenshot({ path: path.join(aus, `${name}-fenster.png`) });
    if (auftrag.ganzeSeite) await seite.screenshot({ path: path.join(aus, `${name}-ganz.png`), fullPage: true });
    bericht.push({ ansicht: ansicht.name, breite, status: antwort?.status(), ...messung });
  }
  await kontext.close();
}
await browser.close();
writeFileSync(path.join(aus, 'bericht.json'), JSON.stringify(bericht, null, 2));
for (const b of bericht) {
  console.log(`${b.ansicht} @ ${b.breite}px (${b.hover}): HTTP ${b.status}, Seite ${b.seite}px in ${b.fenster}px – ${b.ueberlaeuft ? `läuft über: ${b.hinaus.join(', ')}` : 'passt'}${b.gezaehlt !== undefined ? `; gezählt: ${b.gezaehlt}` : ''}`
    + `${b.tabelle ? `; Tabelle ${b.tabelle}px in ${b.behaelter}px${b.unsichtbar?.length ? `, nicht im Blick: ${b.unsichtbar.join(', ')}` : ''}${b.abgeschnitten ? `, ${b.abgeschnitten} Zellen abgeschnitten` : ''}` : ''}`);
}
