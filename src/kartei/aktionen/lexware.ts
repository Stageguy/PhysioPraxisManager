/** Aktionen: Lexware-Kunden verknüpfen, Felder abgleichen, Rechnungen holen (W99, W99b, W103) – nur über Lexware-Felder, nie löschen (§4d) */
import { feldUebernehmen, kundeInLexwareAnlegen, lexwareLoesen, lexwareVerknuepfen, patientenAusKunden } from '../lexware-kunden.ts';
import { kontaktIdNachtragen, rechnungenUebernehmen, uebernahmeText } from '../lexware-rechnungen.ts';
import { KarteiFehler, patientLesen } from '../patienten.ts';
import type { Aktionen } from './kontext.ts';

/** Ohne Patient: Sammelübernahme aus Lexware (W99b) */
export const LEXWARE_OHNE_PATIENT: Aktionen = {
  async lexware_anlegen_mehrere({ db, t, q, f, wer, nach }) {
    if (!q.lexware) throw new KarteiFehler('Lexware ist nicht angebunden');
    const nummern = f.getAll('kunde');
    if (!nummern.length) throw new KarteiFehler('Keine Kunden ausgewählt');
    const e = await patientenAusKunden(db, t, (await q.lexware.alle()).kunden, nummern, wer);
    return nach('/patienten/lexware', `${e.angelegt} Patient${e.angelegt === 1 ? '' : 'en'} aus Lexware angelegt.${e.uebersprungen.length ? ` Übersprungen: ${e.uebersprungen.join(', ')}.` : ''}`);
  },
};

export const LEXWARE: Aktionen = {
  // Rechnungen aus Lexware (W103): für diesen Patienten holen – Kacheln mit Datei im Tresor; nichts wird gelöscht
  async lexware_rechnungen({ db, t, q, id, wer, nach, seite }) {
    if (!q.lexwareRechnungen) throw new KarteiFehler('Lexware ist nicht angebunden');
    await kontaktIdNachtragen(db, q.lexware, id);
    const e = await rechnungenUebernehmen(db, t, q.lexwareRechnungen, { patientId: id, wer });
    return nach(`${seite}#rechnungen`, `Aus Lexware: ${uebernahmeText(e)}`);
  },
  // Abgleich der gemeinsamen Felder (W99b): ein Lexware-Wert auf Klick; Patient als Kunde nach Lexware
  async lexware_uebernehmen({ db, t, id, g, wer, nach, seite, lexwareKundeZu }) {
    const kunde = await lexwareKundeZu((await patientLesen(db, t, id))?.lexwareKundennummer ?? null);
    if (!kunde) throw new KarteiFehler('Der Lexware-Kunde ist gerade nicht erreichbar oder der Patient nicht verknüpft');
    const titel = await feldUebernehmen(db, t, id, kunde, g('feld') ?? '', wer);
    return nach(`${seite}#rechnungen`, `${titel} aus Lexware übernommen.`);
  },
  async lexware_kunde_anlegen({ db, t, q, id, wer, nach, seite }) {
    if (!q.lexwareRechnungen) throw new KarteiFehler('Lexware ist nicht angebunden');
    const { nummer } = await kundeInLexwareAnlegen(db, t, q.lexwareRechnungen, id, wer);
    if (q.lexware && !q.lexware.attrappe) await q.lexware.alle({ neu: true }).catch(() => undefined);
    return nach(`${seite}#rechnungen`, `In Lexware als Kunde ${nummer} angelegt.`);
  },
  // Lexware-Kunden (W99): nur die Verknüpfung über die Kundennummer – keine Stammdaten aus Lexware
  async lexware_zuordnen({ db, id, g, wer, nach }) {
    const nummer = (g('kundennummer') ?? '').trim();
    const { name } = await lexwareVerknuepfen(db, id, { nummer, kontaktId: g('kontakt_id') }, wer);
    return nach(`/patienten/lexware#lx-${nummer}`, `Lexware-Kunde ${nummer} ist jetzt ${name} zugeordnet.`);
  },
  async lexware_loesen({ db, id, wer, nach }) {
    const { nummer } = await lexwareLoesen(db, id, wer);
    return nach(nummer ? `/patienten/lexware#lx-${nummer}` : '/patienten/lexware', nummer ? `Verknüpfung mit Lexware-Kunde ${nummer} gelöst.` : 'Der Patient war mit keinem Lexware-Kunden verknüpft.');
  },
};
