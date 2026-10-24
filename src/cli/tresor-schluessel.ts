/**
 * Neuen Hauptschlüssel für den Patienten-Tresor erzeugen (requirements §4a, §4b).
 *
 *   npm run tresor:schluessel
 *
 * Gibt eine Zeile für .env bzw. das Secret `praxis-tresor` aus. Jede Umgebung (Produktion, Test)
 * bekommt einen eigenen Schlüssel. Die Bereitstellung legt ihn einmalig an; die Notfallkopie
 * bewahrt Lilli offline auf – ohne Schlüssel sind die Akten nicht lesbar.
 */
import { neuerHauptschluessel } from '../tresor.ts';

console.log(`PRAXIS_TRESOR_SCHLUESSEL=1:${neuerHauptschluessel()}`);
