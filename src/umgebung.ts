/**
 * Testumgebung und Produktion (requirements N28). Beide hängen am echten Postfach
 * praxis@lilli-nebel.de – deshalb stehen hier die harten Schranken an einer Stelle:
 *
 * 1. Test verarbeitet Patientenpost nur von Testadressen; die Produktion nie von Testadressen
 * 2. Test schreibt nur an Testadressen – jede andere Adresse bricht ab
 * 3. Test-Termine nur im eigenen Kalender „Praxis-Test“
 * 4. Rechnungen, Kategorien, Ablage und Zahlungsabgleich schreibt nur die Produktion
 * 5. (mit 1) Die Produktion ignoriert Mails von Testadressen
 * 6. Entwürfe aus der Testumgebung tragen die Kategorie „TEST“
 * 7. Patientenkontakte (Hybrid mit Exchange, §4b) nur im eigenen Kontaktordner: „Patienten-Test“
 *    statt „Patienten“ – und nur mit Testadressen
 * 8. WhatsApp über die Cloud API (W90) schreibt in der Testumgebung nur an TEST_TELEFONE
 *
 * PRAXIS_UMGEBUNG=test schaltet die Testumgebung ein (sonst Produktion);
 * TEST_ADRESSEN: Testadressen, durch Komma getrennt (Plus-Varianten zählen mit);
 * TEST_TELEFONE: Testnummern für WhatsApp, durch Komma getrennt (jede Schreibweise, wird normiert).
 */
import type { GraphClient } from './graph.ts';
import { telefonNormieren } from './telefon.ts';

export type Umgebung = 'prod' | 'test';

export const TEST_KATEGORIE = 'TEST';
export const TEST_KALENDER = 'Praxis-Test';
export const KONTAKTORDNER = 'Patienten';
export const TEST_KONTAKTORDNER = 'Patienten-Test';

export const umgebung = (env: NodeJS.ProcessEnv = process.env): Umgebung => (env.PRAXIS_UMGEBUNG === 'test' ? 'test' : 'prod');

/** "Shopping+Anna@2late.de" → "shopping@2late.de" */
export function normiereAdresse(adresse: string): string {
  const a = adresse.trim().toLowerCase();
  const at = a.lastIndexOf('@');
  if (at < 0) return a;
  return `${a.slice(0, at).replace(/\+.*$/, '')}${a.slice(at)}`;
}

export const testAdressen = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.TEST_ADRESSEN ?? '').split(',').map(normiereAdresse).filter((a) => a.includes('@'));

export const istTestadresse = (adresse: string, liste = testAdressen()): boolean => liste.includes(normiereAdresse(adresse));

/** Eine Schranke wurde berührt – nie stillschweigend weiterlaufen */
export class SchrankeVerletzt extends Error {
  readonly endgueltig = true;
}

/** Schranke 4: schreibt nur in der Produktion */
export function nurProduktion(was: string, u: Umgebung = umgebung()): void {
  if (u === 'test') {
    throw new SchrankeVerletzt(`${was} schreibt nur die Produktion – in der Testumgebung gesperrt (requirements N28)`);
  }
}

/** Schranke 2: in der Testumgebung nur an Testadressen */
export function pruefeEmpfaenger(adressen: string[], u: Umgebung = umgebung(), liste = testAdressen()): void {
  if (u !== 'test') return;
  if (!liste.length) throw new SchrankeVerletzt('Testumgebung ohne TEST_ADRESSEN – es darf an niemanden geschrieben werden');
  const fremd = adressen.filter((a) => !istTestadresse(a, liste));
  if (fremd.length) {
    throw new SchrankeVerletzt(`Die Testumgebung schreibt nur an Testadressen – ${fremd.length} andere Empfänger abgewiesen`);
  }
}

export const testTelefone = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.TEST_TELEFONE ?? '').split(',').map((s) => s.trim()).filter((s) => /\d{5,}/.test(s)).map(telefonNormieren);

/** Schranke 8: WhatsApp in der Testumgebung nur an Testnummern */
export function pruefeTelefonEmpfaenger(nummern: string[], u: Umgebung = umgebung(), liste = testTelefone()): void {
  if (u !== 'test') return;
  if (!liste.length) throw new SchrankeVerletzt('Testumgebung ohne TEST_TELEFONE – es darf per WhatsApp an niemanden geschrieben werden');
  const fremd = nummern.map(telefonNormieren).filter((n) => !liste.includes(n));
  if (fremd.length) {
    throw new SchrankeVerletzt(`Die Testumgebung schreibt per WhatsApp nur an Testnummern – ${fremd.length} andere Empfänger abgewiesen`);
  }
}

/** Schranken 1 und 5: welche Patientenpost diese Umgebung annehmen darf */
export function patientenpostZulassen(absender: string, u: Umgebung = umgebung(), liste = testAdressen()): boolean {
  const test = istTestadresse(absender, liste);
  return u === 'test' ? test : !test;
}

/** Schranke 7: Name des Kontaktordners, in dem diese Umgebung Patienten spiegelt */
export const kontaktordnerName = (u: Umgebung = umgebung()): string => (u === 'test' ? TEST_KONTAKTORDNER : KONTAKTORDNER);

/** Schranke 6: Kategorien für einen Entwurf */
export const entwurfKategorien = (u: Umgebung = umgebung()): string[] => (u === 'test' ? [TEST_KATEGORIE] : []);

/** Schranke 3: Pfad des Kalenders, in den diese Umgebung Termine schreibt */
export async function kalenderBasis(graph: Pick<GraphClient, 'get' | 'post'>, u: Umgebung = umgebung()): Promise<string> {
  if (u !== 'test') return '/me/calendar';
  const filter = encodeURIComponent(`name eq '${TEST_KALENDER}'`);
  const da = await graph.get<{ value: { id: string }[] }>(`/me/calendars?$filter=${filter}&$select=id`);
  const id = da.value[0]?.id ?? (await graph.post<{ id: string }>('/me/calendars', { name: TEST_KALENDER })).id;
  return `/me/calendars/${id}`;
}
