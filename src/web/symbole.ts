/**
 * Symbole als Inline-SVG (Strichzeichnungen, 24×24, Farbe über currentColor) – keine externen
 * Dateien, keine Schrift-Icons, verträglich mit der Content-Security-Policy.
 * Die Kanal-Symbole (E-Mail, WhatsApp, …) zeigen, woher eine Anfrage kam.
 */

const PFADE = {
  rechnung: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 12h6M10 16h6"/>',
  euro: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4 4 0 1 0 0 7"/><path d="M7.5 10.5h6M7.5 13.5h6"/>',
  freigabe: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  patient: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  anfrage: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  pinnwand: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M14 4v16"/><path d="M5 8h1M10 8h2M16 8h3"/>',
  rezept: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3"/><path d="M9 12l2 2 4-4M9 17h6"/>',
  blitz: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  protokoll: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  ordner: '<path d="M3 7h6l2 2h10v10H3z"/>',
  warnung: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  haken: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  kreuz: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  archiv: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9"/><path d="M10 13h4"/>',
  auge: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  schloss: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  // ── Kanäle ──
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
  telefon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  buchung: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  brief: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h4"/>',
} as const;

export type Symbol = keyof typeof PFADE;

export function symbol(name: Symbol, o: { groesse?: number; titel?: string; klasse?: string } = {}): string {
  const g = o.groesse ?? 24;
  const titel = o.titel ? `<title>${o.titel}</title>` : '';
  return `<svg class="sym ${o.klasse ?? ''}" width="${g}" height="${g}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${o.titel ? 'role="img"' : 'aria-hidden="true"'}>${titel}${PFADE[name]}</svg>`;
}
