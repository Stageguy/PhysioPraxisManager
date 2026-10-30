/** Aktionen: Rechnungsentwürfe, Positionen, Textbausteine, Status, Rechnung in zwei Klicks nach Lexware und versenden (W79, W81, W100, E30) */
import { ganz } from '../formular.ts';
import { rechnungNachLexware, nummernKonfliktLoesen } from '../lexware-rechnungen.ts';
import { rechnungSenden } from '../nachrichten.ts';
import { KarteiFehler } from '../patienten.ts';
import { bausteinAendern, bausteinEntfernen, bausteinHinzufuegen, positionAendern, positionHinzufuegen, positionLoeschen, preiseAktualisieren, rechnungAnlegen, rechnungStatus } from '../rechnungen.ts';
import type { Aktionen, AktionKontext } from './kontext.ts';

const rechnungSeite = (k: AktionKontext) => `/patienten/${k.id}/rechnungen/${k.g('rechnung_id')}`;

export const RECHNUNGEN: Aktionen = {
  async rechnung_neu({ db, id, g, wer, nach }) {
    const rid = await rechnungAnlegen(db, id, { steuerklasse: g('steuerklasse') === 'wellness_19' ? 'wellness_19' : 'heilbehandlung_steuerfrei', fallId: g('fall_id') }, wer);
    return nach(`/patienten/${id}/rechnungen/${rid}`, 'Rechnungsentwurf angelegt.');
  },
  async rechnung_position_hinzufuegen(k) {
    const { db, id, g, f, wer, nach } = k;
    await positionHinzufuegen(db, id, g('rechnung_id') ?? '', { nummer: g('nummer'), wellnessId: g('wellness_id'), bezeichnung: g('bezeichnung'), anzahl: ganz(f.get('anzahl'), 1), einzelpreis: g('einzelpreis'), datum: g('datum') }, wer);
    return nach(rechnungSeite(k), 'Position hinzugefügt.');
  },
  async rechnung_position_aendern(k) {
    const { db, id, g, f, wer, nach } = k;
    await positionAendern(db, id, g('rechnung_id') ?? '', g('position_id') ?? '', { datum: g('datum'), bezeichnung: g('bezeichnung'), anzahl: ganz(f.get('anzahl'), 1), einzelpreis: g('einzelpreis') }, wer);
    return nach(rechnungSeite(k), 'Position geändert.');
  },
  async rechnung_position_loeschen(k) {
    const { db, id, g, wer, nach } = k;
    await positionLoeschen(db, id, g('rechnung_id') ?? '', g('position_id') ?? '', wer);
    return nach(rechnungSeite(k), 'Position entfernt.');
  },
  async rechnung_baustein_hinzufuegen(k) {
    const { db, id, g, wer, nach } = k;
    await bausteinHinzufuegen(db, id, g('rechnung_id') ?? '', g('textbaustein_id') ?? '', wer);
    return nach(rechnungSeite(k), 'Text hinzugefügt.');
  },
  async rechnung_baustein_aendern(k) {
    const { db, id, g, wer, nach } = k;
    await bausteinAendern(db, id, g('rechnung_id') ?? '', g('baustein_id') ?? '', g('text') ?? '', wer);
    return nach(rechnungSeite(k), 'Text übernommen.');
  },
  async rechnung_baustein_entfernen(k) {
    const { db, id, g, wer, nach } = k;
    await bausteinEntfernen(db, id, g('rechnung_id') ?? '', g('baustein_id') ?? '', wer);
    return nach(rechnungSeite(k), 'Text entfernt.');
  },
  async rechnung_preise(k) {
    const { db, id, g, wer, nach } = k;
    const e = await preiseAktualisieren(db, id, g('rechnung_id') ?? '', wer);
    return nach(rechnungSeite(k), `Preise aus „${e.name}“ übernommen – ${e.geaendert} Position(en) angepasst.`);
  },
  async rechnung_status(k) {
    const { db, id, g, wer, nach } = k;
    const a = g('status_aktion') as Parameters<typeof rechnungStatus>[3];
    if (!['fertig', 'zurueck', 'in_lexware', 'versendet', 'bezahlt', 'storno'].includes(a)) throw new KarteiFehler('Unbekannte Aktion');
    const meldung = await rechnungStatus(db, id, g('rechnung_id') ?? '', a, { versandArt: g('versand_art'), grund: g('grund'), nummer: g('nummer'), datum: g('datum') }, wer);
    return nach(rechnungSeite(k), meldung);
  },
  // Rechnung in zwei Klicks (W100/A28): Klick 1 nach Lexware, Klick 2 versenden
  async rechnung_lexware(k) {
    const { db, t, q, id, g, wer, nach } = k;
    if (!q.lexwareRechnungen) throw new KarteiFehler('Lexware ist nicht angebunden');
    const e = await rechnungNachLexware(db, t, q.lexwareRechnungen, id, g('rechnung_id') ?? '', wer);
    return nach(rechnungSeite(k), `In Lexware mit Nummer ${e.nummer} – PDF liegt im Tresor.${e.kontaktNeu ? ' Der Empfänger wurde in Lexware als Kunde angelegt.' : ''} Jetzt „Versenden“.`);
  },
  // Nummernkonflikt (W120): die Nummer aus Lexware hierher, die andere Rechnung gibt sie ab
  async rechnung_nummer(k) {
    const { db, t, q, id, g, wer, nach } = k;
    return nach(rechnungSeite(k), await nummernKonfliktLoesen(db, t, q.lexwareRechnungen, id, g('rechnung_id') ?? '', wer));
  },
  async rechnung_versenden(k) {
    const { db, t, q, id, g, wer, nach } = k;
    const e = await rechnungSenden(db, t, q.graph, id, g('rechnung_id') ?? '', { art: g('versand_art') }, wer);
    // Entwurf in Outlook (W122): die Seite zeigt das Hinweisfenster mit dem Sprung in den Entwurf
    return nach(e.entwurf ? `${rechnungSeite(k)}?entwurf=1` : rechnungSeite(k), e.meldung);
  },
};
