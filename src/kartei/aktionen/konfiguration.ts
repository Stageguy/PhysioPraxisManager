/** Aktionen ohne Patient: Wellness-Katalog (W74), Textbausteine und Einstellungen (W80), freie Tage (W111), Öffnungszeiten (W112), Fahrtzeiten (W113), Regelzeiten (W110), Terminarten (W94) */
import { oeffnungszeitenAusTagen, oeffnungszeitenText } from '../../anfragen/slots.ts';
import { ganz, minuten, minutenOderLeer } from '../formular.ts';
import { brueckentageSetzen, feiertageImportieren, freierTagLoeschen, freierTagSperren, schliesstageAnlegen, WOCHENTAG_KURZ } from '../freie-tage.ts';
import { fahrtzeitOrteLesen } from '../hausbesuche.ts';
import { einstellungSetzen, textbausteinAktiv, textbausteinSpeichern } from '../konfiguration.ts';
import { KarteiFehler, wellnessAktiv, wellnessSpeichern } from '../patienten.ts';
import { regelzeitenUebernehmen, regelzeitSetzen } from '../regelzeiten.ts';
import { terminartAktiv, terminartSpeichern } from '../terminarten.ts';
import { mittagspauseTagSetzen } from '../mittagspause.ts';
import type { Aktionen } from './kontext.ts';

export const KONFIGURATION: Aktionen = {
  async wellness_speichern({ db, g, f, wer, nach }) {
    await wellnessSpeichern(db, { id: g('wellness_id'), code: g('code') ?? '', bezeichnung: g('bezeichnung') ?? '', dauerMin: ganz(f.get('dauer_min')) || undefined, preis: g('preis') ?? '' }, wer);
    return nach('/rezepte/wellness', 'Wellness-Leistung gespeichert.');
  },
  async wellness_aktiv({ db, g, f, nach }) {
    await wellnessAktiv(db, g('wellness_id') ?? '', f.get('aktiv') === '1');
    return nach('/rezepte/wellness', f.get('aktiv') === '1' ? 'Leistung wieder anbietbar.' : 'Leistung ausgeblendet – bestehende Serien bleiben.');
  },
  async textbaustein_speichern({ db, g, wer, nach }) {
    await textbausteinSpeichern(db, { id: g('textbaustein_id'), kurzname: g('kurzname') ?? '', text: g('text') ?? '', wirkung: g('wirkung'), automatisch: g('automatisch') }, wer);
    return nach('/konfiguration', 'Textbaustein gespeichert.');
  },
  async textbaustein_aktiv({ db, g, f, wer, nach }) {
    await textbausteinAktiv(db, g('textbaustein_id') ?? '', f.get('aktiv') === '1', wer);
    return nach('/konfiguration', f.get('aktiv') === '1' ? 'Textbaustein wieder im Angebot.' : 'Textbaustein ausgeblendet – auf bestehenden Rechnungen bleibt er.');
  },
  async einstellung({ db, g, f, wer, nach }) {
    const schluessel = g('schluessel') ?? '';
    await einstellungSetzen(db, schluessel, schluessel === 'kleinunternehmer' ? (f.has('wert_ja') ? 'ja' : 'nein') : schluessel === 'kalender_wochenende' ? (f.has('wert_gesperrt') ? 'gesperrt' : 'offen') : (g('wert') ?? '').trim(), wer);
    return nach(schluessel === 'kalender_wochenende' ? '/konfiguration#freie-tage' : '/konfiguration', 'Einstellung gespeichert.');
  },
  // Freie Tage (A26/W111)
  async feiertage_importieren({ db, q, f, wer, nach }) {
    const e = await feiertageImportieren(db, ganz(f.get('jahr')), wer, { abruf: q.abruf });
    return nach(`/konfiguration?jahr=${e.jahr}#freie-tage`, `${e.anzahl} Feiertage ${e.jahr} eingetragen (Quelle: ${e.quelle}).`);
  },
  // Öffnungszeiten und Pausen je Wochentag (W112)
  async oeffnungszeiten_setzen({ db, g, f, wer, nach }) {
    const zeilen = [1, 2, 3, 4, 5, 6, 7].map((tag) => ({
      tag, name: WOCHENTAG_KURZ[tag - 1]!, offen: f.has(`offen_${tag}`), von: g(`von_${tag}`) ?? '', bis: g(`bis_${tag}`) ?? '', pauseVon: g(`pause_von_${tag}`) ?? '', pauseBis: g(`pause_bis_${tag}`) ?? '',
    }));
    let text: string;
    try {
      text = oeffnungszeitenText(oeffnungszeitenAusTagen(zeilen));
    } catch (err) {
      throw new KarteiFehler((err as Error).message);
    }
    if (!text) throw new KarteiFehler('Mindestens ein Tag muss geöffnet sein');
    await einstellungSetzen(db, 'oeffnungszeiten', text, wer);
    return nach('/konfiguration#oeffnungszeiten', `Öffnungszeiten gespeichert: ${text}`);
  },
  // Mittagspause eines Tages (W126): Minuten für den Tag, „Standard“ nimmt die Ausnahme zurück
  async mittagspause_tag({ db, g, f, wer, nach }) {
    const datum = g('datum') ?? '';
    const zurueck = g('zurueck')?.startsWith('/kalender') ? g('zurueck')! : `/kalender?ansicht=tag&tag=${datum}`;
    if (f.has('standard')) {
      await mittagspauseTagSetzen(db, datum, null, wer);
      return nach(zurueck, 'Mittagspause: an diesem Tag gilt wieder der Standard.');
    }
    const text = (g('minuten') ?? '').trim();
    if (!/^\d{1,3}$/.test(text)) throw new KarteiFehler('Mittagspause: ganze Minuten von 0 bis 240, keine negativen Zahlen');
    await mittagspauseTagSetzen(db, datum, Number(text), wer);
    return nach(zurueck, Number(text) ? `Mittagspause an diesem Tag: ${Number(text)} Minuten.` : 'An diesem Tag keine Mittagspause.');
  },
  // Fahrtzeiten für Hausbesuche (W113)
  async fahrtzeiten_setzen({ db, g, wer, nach }) {
    const standard = minuten(g('fahrtzeit_standard_min'), 'Standard-Fahrtzeit');
    const innerorts = minuten(g('fahrtzeit_innerorts_min'), 'Fahrtzeit innerorts');
    const zeilen = (g('fahrtzeit_orte') ?? '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    const unlesbar = zeilen.find((z) => !fahrtzeitOrteLesen(z).size);
    if (unlesbar !== undefined) throw new KarteiFehler(`Zeile nicht lesbar: „${unlesbar}“ – erwartet wird „Ort = Minuten“ (höchstens 240)`);
    await einstellungSetzen(db, 'fahrtzeit_standard_min', standard, wer);
    await einstellungSetzen(db, 'fahrtzeit_innerorts_min', innerorts, wer);
    await einstellungSetzen(db, 'fahrtzeit_orte', zeilen.join('\n'), wer);
    return nach('/konfiguration#fahrtzeiten', `Fahrtzeiten gespeichert: Standard ${standard} Min., innerorts ${innerorts} Min., ${zeilen.length} Ort${zeilen.length === 1 ? '' : 'e'} mit eigener Zeit – gilt für neue und geänderte Termine.`);
  },
  // Regelbehandlungszeiten (W110)
  async regelzeiten_uebernehmen({ db, wer, nach }) {
    const e = await regelzeitenUebernehmen(db, wer);
    return nach('/konfiguration#regelzeiten', `${e.uebernommen} Regelbehandlungszeit${e.uebernommen === 1 ? '' : 'en'} übernommen (${e.vorhanden} Positionen mit Angabe).`);
  },
  async regelzeit_setzen({ db, g, f, wer, nach }) {
    await regelzeitSetzen(db, { nummer: g('nummer') ?? '', bezeichnung: g('bezeichnung'), vonMin: g('von_min')?.trim() ? ganz(f.get('von_min')) : null, bisMin: ganz(f.get('bis_min')) }, wer);
    return nach('/konfiguration#regelzeiten', 'Regelbehandlungszeit gespeichert.');
  },
  async brueckentage_setzen({ db, f, wer, nach }) {
    const jahr = ganz(f.get('jahr'));
    const e = await brueckentageSetzen(db, jahr, f.getAll('tag'), wer);
    return nach(`/konfiguration?jahr=${jahr}#freie-tage`, `${e.gesperrt} Brückentag${e.gesperrt === 1 ? '' : 'e'} ${jahr} gesperrt.`);
  },
  async schliesstage_anlegen({ db, g, wer, nach }) {
    const e = await schliesstageAnlegen(db, { von: g('von') ?? '', bis: g('bis'), name: g('name'), art: g('art') ?? '' }, wer);
    return nach(`/konfiguration?jahr=${(g('von') ?? '').slice(0, 4)}#freie-tage`, `${e.tage} Schließtag${e.tage === 1 ? '' : 'e'} eingetragen.`);
  },
  async freier_tag_sperren({ db, g, wer, nach }) {
    const datum = g('datum') ?? '';
    await freierTagSperren(db, datum, g('gesperrt') === 'ja', wer);
    return nach(`/konfiguration?jahr=${datum.slice(0, 4)}#freie-tage`, g('gesperrt') === 'ja' ? 'Tag gesperrt.' : 'Tag freigegeben – an diesem Tag sind Termine möglich.');
  },
  async freier_tag_loeschen({ db, g, wer, nach }) {
    const datum = g('datum') ?? '';
    await freierTagLoeschen(db, datum, wer);
    return nach(`/konfiguration?jahr=${datum.slice(0, 4)}#freie-tage`, 'Tag entfernt.');
  },
  // Terminarten der Online-Anfrage (W94)
  async terminart_speichern({ db, g, f, wer, nach }) {
    const tid = await terminartSpeichern(db, {
      id: g('terminart_id'), sektion: g('sektion'), kurz: g('kurz') ?? '', lang: g('lang'), dauerMin: ganz(f.get('dauer_min')), leistungNummer: g('leistung_nummer'),
      pufferMin: minutenOderLeer(g('puffer_min'), 999),
    }, wer);
    return nach(`/konfiguration/terminarten#ta-${tid}`, g('terminart_id') ? 'Terminart gespeichert.' : 'Terminart angelegt – noch inaktiv.');
  },
  async terminart_aktiv({ db, g, f, wer, nach }) {
    const tid = g('terminart_id') ?? '';
    await terminartAktiv(db, tid, f.get('aktiv') === '1', wer);
    return nach(`/konfiguration/terminarten#ta-${tid}`, f.get('aktiv') === '1' ? 'Aktiv – steht jetzt im Dropdown der Online-Anfrage.' : 'Inaktiv – nicht mehr im Dropdown.');
  },
};
