/**
 * Gemeinsame HTML-Bausteine der Seiten: der Rahmen (wer, Fassung, Meldung), die Meldungszeilen oben,
 * die versteckten Aktionsformulare und Chips. Vorher in jeder Seite kopiert.
 */
import { esc } from './layout.ts';
import { symbol } from './symbole.ts';

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

/** Farbiger Status-Chip (Outlook-Farbpaletten „presetN“) */
export const chip = (text: string, farbe: string) => `<span class="chip ${farbe}">${esc(text)}</span>`;
