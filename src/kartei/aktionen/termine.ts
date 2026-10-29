/** Aktionen: Termine anlegen, ändern, absagen, Serie zum Rezept (W77, W110, W115, W116) */
import { ganz, minutenOderLeer } from '../formular.ts';
import { fahrtenBerechnen } from '../hausbesuche.ts';
import { KarteiFehler, terminAendern, terminAnlegen, terminStatus, verordnungen } from '../patienten.ts';
import { terminWerte } from '../rezept-termine.ts';
import type { Aktionen, AktionKontext } from './kontext.ts';

/** Hinweis auf Überschneidungen mit Fahrtzeiten an diesem Tag (W113) */
const fahrtHinweis = async (k: AktionKontext, datum: string | undefined): Promise<string> => {
  const e = await fahrtenBerechnen(k.db, datum ?? '');
  return e.kollisionen ? ` Achtung: ${e.kollisionen} Überschneidung${e.kollisionen === 1 ? '' : 'en'} mit Fahrtzeiten an diesem Tag – Termin oder Fahrtzeit anpassen.` : '';
};

export const TERMINE: Aktionen = {
  async termin_anlegen(k) {
    const { db, id, g, f, wer, nach, seite, spiegeln } = k;
    const terminId = await terminAnlegen(db, id, {
      datum: g('datum') ?? '', zeit: g('zeit') ?? '', dauerMin: ganz(f.get('dauer_min'), 30), art: g('art'), verordnungId: g('verordnung_id'), fallId: g('fall_id'), terminartId: g('terminart_id'),
      behandlungsort: g('behandlungsort'), fahrtVorMin: minutenOderLeer(g('fahrt_vor_min')), fahrtNachMin: minutenOderLeer(g('fahrt_nach_min')),
    }, wer);
    return nach(`${seite}#termine`, `Termin angelegt.${await spiegeln(terminId)}${await fahrtHinweis(k, g('datum'))}`);
  },
  async termin_status({ db, id, g, wer, nach, seite, spiegeln }) {
    await terminStatus(db, id, g('termin_id') ?? '', g('status') ?? '', wer);
    return nach(`${seite}#termine`, `Termin geändert.${await spiegeln(g('termin_id') ?? '')}`);
  },
  // Absage aus dem Kalender (W116c): Status setzen, Kalender bereinigen, dann die Nachricht vorwählen – nichts geht automatisch raus
  async termin_absagen({ db, id, g, wer, nach, seite, spiegeln }) {
    const terminId = g('termin_id') ?? '';
    const status = ['abgesagt_patient', 'abgesagt_praxis', 'nicht_erschienen'].includes(g('status') ?? '') ? g('status')! : 'abgesagt_praxis';
    await terminStatus(db, id, terminId, status, wer);
    const hinweis = await spiegeln(terminId);
    return nach(`${seite}?vorlage=absage_ersatztermin&termin=${terminId}#nachricht`, `Termin ${status === 'nicht_erschienen' ? 'als „nicht erschienen“ vermerkt' : 'abgesagt'}.${hinweis} Nachricht an den Patienten? Vorlage und Termin sind unten vorgewählt – nichts geht automatisch raus.`);
  },
  async termin_aendern(k) {
    const { db, id, g, f, wer, nach, seite, spiegeln } = k;
    const terminId = g('termin_id') ?? '';
    await terminAendern(db, id, terminId, {
      datum: g('datum') ?? '', zeit: g('zeit') ?? '', dauerMin: ganz(f.get('dauer_min'), 30), art: g('art'), verordnungId: g('verordnung_id'), terminartId: g('terminart_id'),
      behandlungsort: g('behandlungsort') ?? 'praxis', fahrtVorMin: minutenOderLeer(g('fahrt_vor_min')), fahrtNachMin: minutenOderLeer(g('fahrt_nach_min')),
    }, wer);
    return nach(`${seite}#termine`, `Termin geändert.${await spiegeln(terminId)}${await fahrtHinweis(k, g('datum'))}`);
  },
  // Terminserie zum Rezept (W110): nur angehakte Vorschläge, nie mehr als noch offen sind
  async rezept_termine_anlegen({ db, id, g, f, wer, nach, seite, spiegeln }) {
    const vid = g('verordnung_id') ?? '';
    const v = (await verordnungen(db, { patientId: id })).find((x) => x.id === vid);
    if (!v) throw new KarteiFehler('Dieses Rezept gibt es nicht');
    if (v.status !== 'aktiv') throw new KarteiFehler('Termine lassen sich nur zu aktiven Rezepten planen');
    const werte = terminWerte(f.getAll('termin'), ganz(f.get('dauer_min')));
    const offen = v.anzahlVerordnet - v.abgehakt - v.geplant;
    if (werte.length > offen) throw new KarteiFehler(`Auf dem Rezept ${offen <= 0 ? 'ist keine Behandlung mehr' : `sind nur noch ${offen} Behandlung${offen === 1 ? '' : 'en'}`} offen – ${werte.length} Termine gewählt`);
    const hinweise = new Set<string>();
    for (const w of werte) {
      const terminId = await terminAnlegen(db, id, { ...w, verordnungId: vid, fallId: v.fallId ?? undefined, leistungNummer: v.leistungNummer ?? undefined, behandlungsort: g('behandlungsort') }, wer);
      const h = await spiegeln(terminId);
      if (h) hinweise.add(h);
    }
    return nach(`${seite}#termine`, `${werte.length} Termin${werte.length === 1 ? '' : 'e'} zum Rezept angelegt.${[...hinweise].join('')}`);
  },
};
