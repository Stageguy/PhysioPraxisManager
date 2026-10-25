/**
 * Stammdaten der Praxis aus der Umgebung – damit eine zweite Praxis (W89, „Mandant = Namespace“) ohne
 * Codeänderung läuft. Fehlt die Angabe, gilt Lillis Praxis.
 */
export const praxisName = (env: NodeJS.ProcessEnv = process.env): string => env.PRAXIS_NAME?.trim() || 'Praxis Lilli Nebel';

/** Das Postfach der Praxis (praxis@…) – zugleich das einzige Konto, mit dem sich die App anmeldet */
export const praxisKonto = (env: NodeJS.ProcessEnv = process.env): string => (env.GRAPH_KONTO?.trim() || 'praxis@lilli-nebel.de').toLowerCase();

/** Telefonnummer der Praxis für Nachrichten an Patienten („Rückruf unter …“); leer, wenn nicht gesetzt */
export const praxisTelefon = (env: NodeJS.ProcessEnv = process.env): string => env.PRAXIS_TELEFON?.trim() || '';
