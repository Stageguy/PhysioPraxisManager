/**
 * Gemeinsame HTML-Bausteine der Seiten: der Rahmen (wer, Fassung, Meldung), die Meldungszeilen oben,
 * die versteckten Aktionsformulare und Chips. Vorher in jeder Seite kopiert.
 */
import { SEKTION_REIHE, type Sektion } from '../kartei/terminarten.ts';
import { esc } from './layout.ts';
import { symbol, type Symbol } from './symbole.ts';

/** Was jede Seite vom Server bekommt */
export interface Rahmen {
  wer: string;
  fassung: string;
  meldung?: string;
  fehler?: string;
  skriptInline?: string;
}

/** Grüne Erfolgsmeldung und rote Fehlermeldung oberhalb des Inhalts */
export const meldungen = (o: { meldung?: string; fehler?: string }) =>
  `${o.meldung ? `<p class="meldung ok" role="status">${symbol('haken', { groesse: 18 })} ${esc(o.meldung)}</p>` : ''}${o.fehler ? `<p class="meldung fehler" role="alert">${symbol('warnung', { groesse: 18 })} ${esc(o.fehler)}</p>` : ''}`;

export interface Formularziel {
  /** Patient bzw. Objekt, auf das sich die Aktion bezieht */
  id?: string;
  /** Wohin nach der Aktion (geprüft vom Server) */
  zurueck?: string;
  klasse?: string;
}

/** Verstecktes POST-Formular an eine Aktionsadresse: Aktion, optional id, Rücksprungziel, dann der Inhalt */
export const aktionsFormular = (action: string, aktion: string, inhalt: string, o: Formularziel & { zurueck: string }) =>
  `<form method="post" action="${action}" class="${o.klasse ?? 'inline'}"><input type="hidden" name="aktion" value="${aktion}">${o.id ? `<input type="hidden" name="id" value="${o.id}">` : ''}<input type="hidden" name="zurueck" value="${esc(o.zurueck)}">${inhalt}</form>`;

/** Formular an die Patientenkartei (/patienten/aktion) */
export const karteiFormular = (aktion: string, inhalt: string, o: Formularziel = {}) => aktionsFormular('/patienten/aktion', aktion, inhalt, { ...o, zurueck: o.zurueck ?? '/patienten' });

/** Formular an die Preislisten (/preislisten/aktion) */
export const preislistenFormular = (aktion: string, inhalt: string, o: Formularziel = {}) => aktionsFormular('/preislisten/aktion', aktion, inhalt, { ...o, zurueck: o.zurueck ?? '/preislisten' });

/** Sektion einer Terminart bzw. eines Termins (W95): Symbol, Farbe (CSS-Klasse sek-…) und Name – überall gleich */
export const SEKTION_SYMBOL: Record<Sektion, Symbol> = { rezept: 'rezept', selbstzahler: 'euro', wellness: 'wellness' };
export const SEKTION_KURZ: Record<Sektion, string> = { rezept: 'Rezept', selbstzahler: 'Selbstzahler', wellness: 'Wellness' };

/** Kleines Symbol in der Farbe der Sektion; ohne Sektion nichts */
export const sektionMarke = (s: Sektion | null | undefined, groesse = 14) =>
  s ? `<span class="sek-sym sek-${s}" title="${esc(SEKTION_KURZ[s])}" aria-label="${esc(SEKTION_KURZ[s])}">${symbol(SEKTION_SYMBOL[s], { groesse })}</span>` : '';

/** Farblegende der drei Sektionen */
export const sektionLegende = () =>
  `<p class="sek-legende" data-hilfe="sektion.legende" tabindex="0">${SEKTION_REIHE.map((s) => `<span class="sek-teil sek-${s}">${sektionMarke(s)} ${esc(SEKTION_KURZ[s])}</span>`).join('')}</p>`;

/** Farbiger Status-Chip (Outlook-Farbpaletten „presetN“) */
export const chip = (text: string, farbe: string) => `<span class="chip ${farbe}">${esc(text)}</span>`;

/**
 * Seitliches Dokumentfenster (W104): /praxis.js lädt beim Klick auf `a[data-pdf]` das PDF in den Rahmen, statt die
 * Seite oder den Tab zu wechseln; „Schließen“ oder Escape blendet es aus. Ohne Skript (oder am iPhone, wo der Rahmen
 * nur die erste Seite zeigt) öffnet der Link das PDF im selben Tab – „Zurück“ führt zur Seite.
 */
// ── Kachel-Regeln (W114, requirements §4h) ──────────────────────────────────
// 1. Wo man in einem Kachelraster Neues anlegen kann, ist die erste Kachel eine „+“-Kachel (gleiche Größe wie die
//    anderen). Mit `href` öffnet sie die Erfassungsseite im Seitenfenster (Rechner) bzw. als Seite (Handy, ohne JS);
//    mit `inhalt` ein Popup an Ort und Stelle (kleine Formulare, Auswahl).
// 2. Eine Kachel, die man bearbeiten darf, zeigt beim Überfahren unten rechts einen Stift (am Handy immer).
// 3. Mehrere Aktionen zu einer Kachel stecken in einem „+“ oben rechts; eine einzelne Aktion bleibt ein Knopf.

/** „+“-Kachel – immer die erste im Raster */
export function plusKachel(o: { text: string; hilfe: string; href?: string; inhalt?: string; titel?: string; klasse?: string }): string {
  const innen = `<span class="plus-zeichen" aria-hidden="true">+</span><span class="plus-text">${esc(o.text)}</span>`;
  const klasse = `plus-kachel${o.klasse ? ` ${o.klasse}` : ''}`;
  if (o.href) return `<a class="${klasse}" href="${esc(o.href)}" data-fenster="${esc(o.titel ?? o.text)}" data-hilfe="${o.hilfe}">${innen}</a>`;
  return `<details class="${klasse}"><summary data-hilfe="${o.hilfe}">${innen}</summary>
    <div class="plus-popup" role="dialog" aria-label="${esc(o.titel ?? o.text)}"><header><b>${esc(o.titel ?? o.text)}</b><button type="button" class="knopf klein plus-schliessen" data-hilfe="kachel.popup-schliessen">${symbol('kreuz', { groesse: 16 })} Schließen</button></header>${o.inhalt ?? ''}</div></details>`;
}

/** Stift unten rechts: diese Kachel darf bearbeitet werden. `oeffnet` = id eines <details>, das /praxis.js aufklappt */
export const stift = (href: string, hilfe = 'kachel.stift', o: { oeffnet?: string; text?: string } = {}): string =>
  `<a class="kachel-stift" href="${esc(href)}"${o.oeffnet ? ` data-oeffnet="${esc(o.oeffnet)}"` : ''} data-hilfe="${hilfe}" aria-label="${esc(o.text ?? 'Bearbeiten')}" title="${esc(o.text ?? 'Bearbeiten')}">${symbol('stift', { groesse: 16 })}</a>`;

/** „+“ oben rechts an der Kachel: Menü mit den Aktionen (Links oder kleine Formulare) */
export const plusMenue = (inhalt: string, hilfe: string, o: { klein?: boolean; label?: string } = {}): string =>
  `<details class="plus${o.klein ? ' klein' : ''}" data-hilfe="${hilfe}"><summary aria-label="${esc(o.label ?? 'Aktionen')}">+</summary><div class="plus-menue">${inhalt}</div></details>`;

/** Liste von Links in einem „+“-Popup (gleiche Optik wie das Menü oben rechts) */
export const popupLinks = (links: { href: string; text: string; hilfe: string; symbol?: Symbol; fenster?: string }[]): string =>
  `<div class="plus-menue-liste">${links.map((l) => `<a href="${esc(l.href)}"${l.fenster ? ` data-fenster="${esc(l.fenster)}"` : ''} data-hilfe="${l.hilfe}">${l.symbol ? symbol(l.symbol, { groesse: 18 }) : ''} ${esc(l.text)}</a>`).join('')}</div>`;
