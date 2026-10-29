/** Aktionen: Fälle und Phasen (Pinnwand W76), Anamnese, Befund, Erklärungen, Rezepte, Serien, Behandlung erfassen (§ 630f) */
import { ganz } from '../formular.ts';
import {
  behandlungErfassen, BESTAETIGUNG_TEXT, bestaetigungSpeichern, fallAnlegen, KarteiFehler, serieAbschliessen, verordnungAbbrechen, verordnungAnlegen, zweitschriftVermerken,
} from '../patienten.ts';
import { anamneseErfassen, befundErfassen, erklaerungErfassen, erklaerungWiderrufen, PHASEN, PHASEN_NAMEN, phaseSetzen, type Phase } from '../pinnwand.ts';
import type { Aktionen, AktionKontext } from './kontext.ts';

const fallSeite = (k: AktionKontext, fallId: string) => `/patienten/${k.id}/faelle/${fallId}`;

export const AKTE: Aktionen = {
  async fall_anlegen(k) {
    const { db, t, id, g, wer, nach } = k;
    const grundlage = g('grundlage') ?? 'verordnung';
    const fallId = await fallAnlegen(db, t, id, { grundlage, bezeichnung: g('bezeichnung'), anlass: g('anlass'), diagnoseArzt: g('diagnose_arzt'), wellnessLeistungId: g('wellness_id'), phase: 'anfrage' }, wer);
    return nach(fallSeite(k, fallId), 'Fall angelegt – er steht auf der Pinnwand unter „Anfrage“.');
  },
  async phase(k) {
    const { db, id, g, wer, nach } = k;
    const nachPhase = g('nach') as Phase;
    if (!PHASEN.includes(nachPhase)) throw new KarteiFehler('Unbekannte Phase');
    await phaseSetzen(db, id, g('fall_id') ?? '', nachPhase, wer, g('grund'));
    return nach(g('zurueck')?.startsWith('/pinnwand') ? g('zurueck')! : fallSeite(k, g('fall_id') ?? ''), `Verschoben nach „${PHASEN_NAMEN[nachPhase]}“.`);
  },
  async anamnese_erfassen(k) {
    const { db, t, id, g, wer, nach } = k;
    await anamneseErfassen(db, t, id, g('fall_id') ?? '', { erhobenAm: g('erhoben_am'), art: g('art'), beschwerden: g('beschwerden'), vorgeschichte: g('vorgeschichte'), medikamente: g('medikamente'), allergien: g('allergien'), risiken: g('risiken'), sonstiges: g('sonstiges') }, wer);
    return nach(`${fallSeite(k, g('fall_id') ?? '')}#anamnese`, 'Anamnese gespeichert.');
  },
  async befund_erfassen(k) {
    const { db, t, id, g, wer, nach } = k;
    await befundErfassen(db, t, id, g('fall_id') ?? '', { erhobenAm: g('erhoben_am'), art: g('art') ?? '', text: g('text'), messwerte: g('messwerte') }, wer);
    return nach(`${fallSeite(k, g('fall_id') ?? '')}#befunde`, 'Befund gespeichert.');
  },
  async erklaerung_erfassen(k) {
    const { db, t, id, g, wer, nach, seite } = k;
    await erklaerungErfassen(db, t, id, { fallId: g('fall_id'), art: g('art') ?? '', am: g('am'), form: g('form'), inhalt: g('inhalt'), fassung: g('fassung'), gueltigBis: g('gueltig_bis') }, wer);
    return nach(g('fall_id') ? `${fallSeite(k, g('fall_id')!)}#erklaerungen` : seite, 'Erklärung gespeichert.');
  },
  async erklaerung_widerrufen(k) {
    const { db, id, g, wer, nach, seite } = k;
    await erklaerungWiderrufen(db, id, g('erklaerung_id') ?? '', g('grund') ?? '', wer);
    return nach(g('fall_id') ? `${fallSeite(k, g('fall_id')!)}#erklaerungen` : seite, 'Erklärung widerrufen.');
  },
  async verordnung_anlegen({ db, t, id, g, f, wer, nach, seite }) {
    const art = g('art') ?? 'erst';
    const vid = await verordnungAnlegen(db, t, id, {
      ausgestelltAm: g('ausgestellt_am') ?? '', arzt: g('arzt'), massnahme: g('massnahme') ?? '', leistungNummer: g('leistung_nummer'), anzahl: ganz(f.get('anzahl')),
      frequenz: g('frequenz'), diagnose: g('diagnose'), gueltigBis: g('gueltig_bis'), fallId: g('fall_id') || undefined,
      art, langzeit: f.has('langzeit'), vorgaengerId: art === 'erst' ? undefined : g('vorgaenger_id') || undefined, notiz: g('notiz'),
    }, wer);
    if (art === 'korrektur') return nach(`${seite}#rezepte`, 'Korrektur angelegt – das alte Rezept gilt als ersetzt, seine Haken zählen weiter.');
    // Gleich weiter zu den Terminvorschlägen (W110)
    return nach(`/patienten/${id}/rezepte/${vid}/termine`, 'Rezept angelegt – hier die Termine dazu planen.');
  },
  async zweitschrift({ db, id, g, wer, nach, seite }) {
    await zweitschriftVermerken(db, id, g('verordnung_id') ?? '', g('datum'), wer);
    return nach(`${seite}#rezepte`, 'Zweitschrift vermerkt – kein neues Kontingent.');
  },
  async verordnung_abbrechen({ db, id, g, wer, nach, seite }) {
    await verordnungAbbrechen(db, id, g('verordnung_id') ?? '', g('grund') ?? '', wer);
    return nach(`${seite}#rezepte`, 'Rezept abgebrochen. Die Abschlussrechnung kommt mit der Abrechnung (Prompt 14).');
  },
  async serie_anlegen({ db, t, id, g, wer, nach, seite }) {
    const grundlage = g('grundlage') === 'praevention' ? 'praevention' : 'direktzugang';
    await fallAnlegen(db, t, id, { grundlage, bezeichnung: g('bezeichnung'), anlass: g('anlass'), begonnenAm: g('begonnen_am'), wellnessLeistungId: g('wellness_id') }, wer);
    return nach(`${seite}#rezepte`, grundlage === 'praevention' ? 'Wellness-Serie angelegt.' : 'Behandlungsserie ohne Rezept angelegt.');
  },
  async serie_abschliessen({ db, id, g, wer, nach, seite }) {
    await serieAbschliessen(db, id, g('fall_id') ?? '', wer);
    return nach(`${seite}#rezepte`, 'Serie abgeschlossen.');
  },
  async behandlung_erfassen({ db, t, id, g, f, wer, nach }) {
    const neu = g('fall_id') === 'neu';
    const e = await behandlungErfassen(db, t, id, {
      fallId: neu ? undefined : g('fall_id'),
      neuerFall: neu ? { grundlage: g('grundlage') ?? '', bezeichnung: g('fall_bezeichnung'), anlass: g('anlass'), diagnoseArzt: g('diagnose_arzt') } : undefined,
      datum: g('datum') ?? '', dauerMin: ganz(f.get('dauer_min')) || undefined, terminId: g('termin_id') || undefined, verordnungId: g('verordnung_id') || undefined,
      leistungNummer: g('leistung_nummer'), massnahmen: g('massnahmen'), verlaufWirkung: g('verlauf_wirkung'), reaktionen: g('reaktionen'), uebungen: g('uebungen'),
    }, wer);
    // Bestätigung des Patienten (W107a): Unterschrift am Bildschirm, Papier oder mündlich – „keine“ lässt sie weg
    const art = g('bestaetigung') ?? 'keine';
    if (art !== 'keine') {
      try {
        await bestaetigungSpeichern(db, t, id, e.behandlungId, { art, unterschrift: g('unterschrift'), werName: g('bestaetigt_von') }, wer);
      } catch (err) {
        if (err instanceof KarteiFehler) return nach(`/patienten/${id}/akte#b-${e.behandlungId}`, `Behandlung in der Akte eingetragen – ohne Bestätigung: ${err.message}`);
        throw err;
      }
      return nach(`/patienten/${id}/akte#b-${e.behandlungId}`, `Behandlung in der Akte eingetragen und vom Patienten bestätigt (${BESTAETIGUNG_TEXT[art as keyof typeof BESTAETIGUNG_TEXT] ?? art}).`);
    }
    return nach(`/patienten/${id}/akte#b-${e.behandlungId}`, 'Behandlung in der Akte eingetragen.');
  },
};
