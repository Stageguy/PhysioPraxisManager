/**
 * Nachrichtenvorlagen für E-Mail-Entwürfe und WhatsApp (W90, W91; Prompt 13). Eine Vorlage, zwei
 * Kanäle: die Mail bekommt Betreff, Anrede und Gruß, WhatsApp den kurzen Text. Inhaltsregel
 * (Leitplanke 9): keine Diagnosen, Befunde oder Behandlungsdetails – nur Organisation (Termin, Rezept,
 * Rechnung). Platzhalter in geschweiften Klammern; was fehlt, bricht ab statt leer zu bleiben.
 */
import { datumText, datumZeitText, euroText } from '../format.ts';
import { praxisName, praxisTelefon } from '../praxis.ts';

export type Kanal = 'email' | 'whatsapp';

export interface Vorlage {
  code: string;
  name: string;
  kanaele: Kanal[];
  /** Was die Vorlage braucht, damit ihre Platzhalter gefüllt werden können */
  braucht?: 'termin' | 'rechnung' | 'freitext';
  betreff: string;
  /** Text der Mail (mit {anrede} und {gruss}) */
  text: string;
  /** Kurzform für WhatsApp – ohne förmliche Anrede, mit Namen der Praxis */
  kurz: string;
}

export const VORLAGEN: Vorlage[] = [
  { code: 'terminbestaetigung', name: 'Terminbestätigung', kanaele: ['email', 'whatsapp'], braucht: 'termin',
    betreff: 'Ihr Termin am {termin_datum}',
    text: '{anrede},\n\nhiermit bestätige ich Ihren Termin am {termin}. Bitte bringen Sie Ihr Rezept und ein großes Handtuch mit.\nFalls Sie den Termin nicht wahrnehmen können, sagen Sie bitte bis 24 Stunden vorher ab.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, Ihr Termin in der {praxis} ist am {termin}. Bitte Rezept und Handtuch mitbringen. Absagen bitte bis 24 Stunden vorher. Viele Grüße, {praxis}' },
  { code: 'terminerinnerung', name: 'Terminerinnerung', kanaele: ['email', 'whatsapp'], braucht: 'termin',
    betreff: 'Erinnerung: Ihr Termin am {termin_datum}',
    text: '{anrede},\n\nich erinnere Sie gern an Ihren Termin am {termin}.\nFalls etwas dazwischenkommt, geben Sie mir bitte rechtzeitig Bescheid.\n\n{gruss}',
    kurz: 'Kleine Erinnerung aus der {praxis}: Ihr Termin ist am {termin}. Bis dann! Falls etwas dazwischenkommt, bitte kurz Bescheid geben.' },
  { code: 'terminvorschlag', name: 'Terminvorschlag', kanaele: ['email', 'whatsapp'], braucht: 'freitext',
    betreff: 'Terminvorschlag',
    text: '{anrede},\n\nfür Ihre Behandlung kann ich Ihnen folgende Termine anbieten:\n{freitext}\n\nBitte geben Sie mir kurz Bescheid, welcher Termin passt.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, ich kann Ihnen folgende Termine anbieten: {freitext} – welcher passt? Viele Grüße, {praxis}' },
  { code: 'absage_ersatztermin', name: 'Absage mit Ersatztermin', kanaele: ['email', 'whatsapp'], braucht: 'termin',
    betreff: 'Ihr Termin am {termin_datum} – Ersatztermin',
    text: '{anrede},\n\nleider muss ich unseren Termin am {termin} absagen. Als Ersatz schlage ich vor:\n{freitext}\n\nBitte geben Sie mir Bescheid, ob das passt – sonst finden wir einen anderen Termin.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, leider muss ich unseren Termin am {termin} absagen. Ersatzvorschlag: {freitext}. Passt das? Viele Grüße, {praxis}' },
  { code: 'rezept_fehlt', name: 'Rezept fehlt', kanaele: ['email', 'whatsapp'],
    betreff: 'Ihr Rezept',
    text: '{anrede},\n\nfür die weitere Behandlung brauche ich noch Ihr Rezept. Bringen Sie es bitte zum nächsten Termin mit.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, bitte bringen Sie zum nächsten Termin Ihr Rezept mit – ich brauche es für die weitere Behandlung. Viele Grüße, {praxis}' },
  { code: 'rezept_laeuft_ab', name: 'Rezept bald aufgebraucht', kanaele: ['email', 'whatsapp'],
    betreff: 'Folgerezept',
    text: '{anrede},\n\nIhr Rezept ist bald aufgebraucht. Bitte kümmern Sie sich rechtzeitig um ein Folgerezept, damit die Behandlung ohne Pause weitergehen kann.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, Ihr Rezept ist bald aufgebraucht – bitte rechtzeitig ein Folgerezept besorgen, damit es ohne Pause weitergeht. Viele Grüße, {praxis}' },
  { code: 'rechnung_info', name: 'Rechnung zusenden', kanaele: ['email'], braucht: 'rechnung',
    betreff: 'Ihre Rechnung {rechnung_nummer}',
    text: '{anrede},\n\nanbei erhalten Sie Ihre Rechnung {rechnung_nummer} über {rechnung_betrag}. Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das angegebene Konto und geben Sie als Verwendungszweck nur die Rechnungsnummer {rechnung_nummer} an – dann wird Ihre Zahlung automatisch zugeordnet.\n\n{gruss}',
    kurz: '' },
  { code: 'zahlungserinnerung', name: 'Zahlungserinnerung', kanaele: ['email', 'whatsapp'], braucht: 'rechnung',
    betreff: 'Erinnerung: Rechnung {rechnung_nummer}',
    text: '{anrede},\n\nsicher ist es Ihnen nur durchgegangen: Die Rechnung {rechnung_nummer} über {rechnung_betrag} ist noch offen. Ich freue mich über Ihre Überweisung in den nächsten Tagen – bitte mit der Rechnungsnummer {rechnung_nummer} als Verwendungszweck.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, kleine Erinnerung: Die Rechnung {rechnung_nummer} über {rechnung_betrag} ist noch offen. Vielen Dank! {praxis}' },
  { code: 'rueckruf_bitte', name: 'Bitte um Rückruf', kanaele: ['email', 'whatsapp'],
    betreff: 'Bitte um Rückruf',
    text: '{anrede},\n\nich habe versucht, Sie zu erreichen. Bitte rufen Sie mich zurück{praxis_telefon} oder antworten Sie kurz auf diese Nachricht.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, ich habe versucht, Sie zu erreichen. Bitte rufen Sie mich zurück{praxis_telefon} oder antworten Sie kurz hier. Viele Grüße, {praxis}' },
  { code: 'abschluss_dank', name: 'Dank zum Abschluss', kanaele: ['email', 'whatsapp'],
    betreff: 'Vielen Dank',
    text: '{anrede},\n\nvielen Dank für Ihr Vertrauen. Wenn Sie wieder etwas brauchen, melden Sie sich gern – ich freue mich, von Ihnen zu hören.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, vielen Dank für Ihr Vertrauen! Wenn Sie wieder etwas brauchen, melden Sie sich gern. Alles Gute, {praxis}' },
  { code: 'nachsorge', name: 'Nachfrage nach der Behandlung', kanaele: ['email', 'whatsapp'],
    betreff: 'Wie geht es Ihnen?',
    text: '{anrede},\n\nwie besprochen möchte ich mich nach dem Ende Ihrer Behandlung kurz erkundigen: Wie geht es Ihnen? Wenn Sie Fragen haben oder einen Termin möchten, melden Sie sich gern.\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, wie geht es Ihnen nach der Behandlung? Wenn Sie Fragen haben oder einen Termin möchten, melden Sie sich gern. Viele Grüße, {praxis}' },
  { code: 'freitext', name: 'Freier Text', kanaele: ['email', 'whatsapp'], braucht: 'freitext',
    betreff: 'Nachricht aus der {praxis}',
    text: '{anrede},\n\n{freitext}\n\n{gruss}',
    kurz: 'Guten Tag {vorname} {nachname}, {freitext} – Viele Grüße, {praxis}' },
];

export const vorlage = (code: string): Vorlage | undefined => VORLAGEN.find((v) => v.code === code);

export class VorlageFehler extends Error {}

export interface Person {
  anrede: string | null;
  titel: string | null;
  vorname: string;
  nachname: string;
}

/** „Sehr geehrte Frau Dr. Muster“, „Sehr geehrter Herr Muster“, sonst „Guten Tag Anna Muster“ */
export function anredeFuer(p: Person): string {
  const name = `${p.titel ? `${p.titel} ` : ''}${p.nachname}`;
  if (p.anrede === 'Frau') return `Sehr geehrte Frau ${name}`;
  if (p.anrede === 'Herr') return `Sehr geehrter Herr ${name}`;
  return `Guten Tag ${[p.vorname, p.nachname].filter(Boolean).join(' ')}`;
}

export interface Werte {
  person: Person;
  /** Beginn des Termins (ISO, UTC) */
  termin?: string;
  rechnung?: { nummer: string | null; betrag: number };
  freitext?: string;
}

/** Platzhalter der Vorlage füllen; fehlt ein nötiger Wert, bricht es ab */
export function rendern(v: Vorlage, kanal: Kanal, w: Werte): { betreff: string; text: string } {
  if (!v.kanaele.includes(kanal)) throw new VorlageFehler(`„${v.name}“ gibt es nicht für ${kanal === 'email' ? 'E-Mail' : 'WhatsApp'}`);
  if (v.braucht === 'termin' && !w.termin) throw new VorlageFehler(`„${v.name}“ braucht einen Termin`);
  if (v.braucht === 'rechnung' && !w.rechnung) throw new VorlageFehler(`„${v.name}“ braucht eine Rechnung`);
  if (v.braucht === 'freitext' && !w.freitext?.trim()) throw new VorlageFehler(`„${v.name}“ braucht einen Text`);
  const praxis = praxisName();
  const telefon = praxisTelefon();
  const werte: Record<string, string | undefined> = {
    anrede: anredeFuer(w.person), vorname: w.person.vorname, nachname: w.person.nachname, praxis,
    gruss: `Herzliche Grüße\n${praxis}`,
    praxis_telefon: telefon ? ` unter ${telefon}` : '',
    termin: w.termin ? datumZeitText(w.termin, { jahr: true }) : undefined,
    termin_datum: w.termin ? datumText(w.termin) : undefined,
    rechnung_nummer: w.rechnung ? (w.rechnung.nummer ?? 'ohne Nummer') : undefined,
    rechnung_betrag: w.rechnung ? euroText(w.rechnung.betrag) : undefined,
    freitext: w.freitext?.trim() || undefined,
  };
  const fuellen = (s: string) => s.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
    const wert = werte[k];
    if (wert === undefined) throw new VorlageFehler(`Platzhalter „${k}“ ohne Wert`);
    return wert;
  });
  return { betreff: fuellen(v.betreff), text: fuellen(kanal === 'email' ? v.text : v.kurz) };
}

/** Begriffe, die in einer Nachricht nichts zu suchen haben (Leitplanke 9) – Treffer zur Warnung bzw. Sperre */
const GESUNDHEITSBEGRIFFE = ['diagnose', 'befund', 'icd', 'bandscheib', 'arthrose', 'arthritis', 'fraktur', 'bruch', 'operation', 'lähmung', 'tumor', 'krebs', 'depress', 'schwanger', 'rheuma', 'osteopor', 'schlaganfall', 'herzinfarkt', 'ms ', 'parkinson', 'demenz', 'hws', 'lws', 'bws'];

export function gesundheitsbegriffe(text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  return GESUNDHEITSBEGRIFFE.filter((b) => t.includes(b)).map((b) => b.trim());
}
