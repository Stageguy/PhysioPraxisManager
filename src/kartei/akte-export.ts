/**
 * Einsicht in die Patientenakte nach § 630g BGB (A19d, W68): die vollständige Dokumentation eines
 * Patienten als PDF – Stammdaten, Rezepte, je Fall Anamnese, Befunde, Erklärungen und Behandlungen,
 * Termine. Jeder Export steht im Protokoll (wer, wann), denn Einsicht ist ein Zugriff auf Gesundheitsdaten.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { datumText, datumZeitText, zeitText } from '../format.ts';
import { textPdf, type Abschnitt } from '../pdf/text.ts';
import { praxisName } from '../praxis.ts';
import type { Tresor } from '../tresor.ts';
import { heuteBerlin } from '../zeit.ts';
import { akte, BESTAETIGUNG_TEXT, KarteiFehler, patientLesen, termine, verordnungen, VERORDNUNG_ARTEN, type Patient } from './patienten.ts';
import { ERKLAERUNG_ARTEN, fallDetails, PHASEN_NAMEN, type Phase } from './pinnwand.ts';

const GRUNDLAGE: Record<string, string> = { verordnung: 'ärztliche Verordnung', direktzugang: 'Direktzugang (sektorale Heilpraktikererlaubnis)', praevention: 'Prävention / Wellness' };
const TERMIN_STATUS: Record<string, string> = { vorgeschlagen: 'vorgeschlagen', bestaetigt: 'bestätigt', erledigt: 'wahrgenommen', verschoben: 'verschoben', abgesagt_patient: 'abgesagt (Patient)', abgesagt_praxis: 'abgesagt (Praxis)', nicht_erschienen: 'nicht erschienen' };
const KONTAKT: Record<string, string> = { mobil: 'Mobil', telefon: 'Telefon', whatsapp: 'WhatsApp', email: 'E-Mail', sonstige: 'Sonstiges' };

const name = (p: Patient) => `${p.titel ? `${p.titel} ` : ''}${p.vorname} ${p.nachname}`;
const feld = (bezeichnung: string, wert: string | null | undefined) => (wert ? [{ text: `${bezeichnung}: ${wert}`, einzug: 12 }] : []);

export async function akteExport(db: Db, t: Tresor, patientId: string, wer: string): Promise<{ daten: Uint8Array; name: string }> {
  const p = await patientLesen(db, t, patientId);
  if (!p) throw new KarteiFehler('Unbekannter Patient');
  const faelle = await akte(db, t, patientId, wer);
  const rezepte = await verordnungen(db, { patientId });
  const alleTermine = await termine(db, patientId);
  const abschnitte: Abschnitt[] = [];

  abschnitte.push({ titel: 'Stammdaten', zeilen: [
    { text: `${name(p)} · ${p.patientennummer}`, fett: true },
    ...feld('Geburtsdatum', p.geburtsdatum ? datumText(p.geburtsdatum) : null), ...feld('Geburtsname', p.geburtsname), ...feld('Patient seit', datumText(p.patientSeit)),
    ...p.adressen.map((a) => ({ text: `Adresse (${a.bezeichnung ?? 'Adresse'}${a.rechnungsadresse ? ', Rechnungsadresse' : ''}): ${[a.zusatz, [a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' '), a.land !== 'DE' ? a.land : ''].filter(Boolean).join(', ')}`, einzug: 12 })),
    ...p.kontakte.map((k) => ({ text: `${KONTAKT[k.art] ?? k.art}: ${k.wert}${k.bezeichnung ? ` (${k.bezeichnung})` : ''}`, einzug: 12 })),
    ...p.bezugspersonen.map((b) => ({ text: `Bezugsperson (${b.rolle}): ${b.name}${b.beziehung ? `, ${b.beziehung}` : ''}${b.telefon ? `, ${b.telefon}` : ''}`, einzug: 12 })),
    ...feld('Ansprache', p.ansprache), ...feld('Besonderheiten', p.besonderheiten), ...feld('Kommunikationshilfe', p.kommunikationshilfe), ...feld('Beruf / Belastung', p.berufBelastung), ...feld('Notiz', p.notiz),
  ] });

  if (rezepte.length) {
    abschnitte.push({ titel: 'Rezepte (Verordnungen)', zeilen: rezepte.flatMap((v) => [
      { text: `Rezept vom ${datumText(v.ausgestelltAm)} – ${v.massnahme}${v.leistungNummer ? ` (${v.leistungNummer})` : ''}, ${v.anzahlVerordnet} Einheiten, ${v.abgehakt} erbracht · ${VERORDNUNG_ARTEN[v.art] ?? v.art}${v.langzeit ? ', Langzeit' : ''} · Status ${v.status}`, fett: true },
      ...feld('Ausgestellt von', v.arzt), ...feld('Frequenz', v.frequenz), ...feld('Gültig bis', v.gueltigBis ? datumText(v.gueltigBis) : null), ...feld('Zweitschrift', v.zweitschriftAm ? datumText(v.zweitschriftAm) : null), ...feld('Notiz', v.notiz),
    ]) });
  }

  for (const f of faelle) {
    const d = await fallDetails(db, t, patientId, f.id, wer);
    const zeilen: Abschnitt['zeilen'] = [
      `${GRUNDLAGE[f.grundlage] ?? f.grundlage} · Zeitraum ${datumText(f.begonnenAm)} – ${f.abgeschlossenAm ? datumText(f.abgeschlossenAm) : 'laufend'} · Phase ${PHASEN_NAMEN[f.phase as Phase] ?? f.phase}`,
      ...feld('Anlass', f.anlass), ...feld('Diagnose (ärztlich)', f.diagnoseArzt), ...feld('Therapieziele', d?.therapieziele),
    ];
    if (d?.anamnese) {
      const a = d.anamnese;
      zeilen.push({ text: `Anamnese vom ${datumText(a.erhobenAm)} (${a.art})`, fett: true }, ...feld('Beschwerden', a.beschwerden), ...feld('Vorgeschichte', a.vorgeschichte), ...feld('Medikamente', a.medikamente), ...feld('Allergien', a.allergien), ...feld('Risiken', a.risiken), ...feld('Sonstiges', a.sonstiges));
    }
    for (const b of d?.befunde ?? []) zeilen.push({ text: `Befund vom ${datumText(b.erhobenAm)} (${b.art})`, fett: true }, ...feld('Befund', b.text), ...feld('Messwerte', b.messwerte));
    for (const e of d?.erklaerungen ?? []) {
      zeilen.push({ text: `${ERKLAERUNG_ARTEN[e.art] ?? e.art} am ${datumText(e.am)} (${e.form})${e.widerrufenAm ? ` – widerrufen am ${datumText(e.widerrufenAm)}` : ''}`, fett: true }, ...feld('Inhalt', e.inhalt), ...feld('Fassung', e.fassung), ...feld('Gültig bis', e.gueltigBis ? datumText(e.gueltigBis) : null));
    }
    if (f.behandlungen.length) {
      zeilen.push({ text: `${f.behandlungen.length} Behandlungen`, fett: true });
      for (const b of [...f.behandlungen].reverse()) {
        zeilen.push({ text: `${datumText(b.datum)}${b.dauerMin ? ` · ${b.dauerMin} min` : ''} · ${b.behandeltVon}${b.status === 'ausgefallen' ? ' · ausgefallen' : ''}${b.leistungen.length ? ` · ${b.leistungen.map((l) => `${l.nummer} ${l.bezeichnung}`).join(', ')}` : ''}`, einzug: 12, fett: true },
          ...feld('Maßnahmen', b.massnahmen).map((z) => ({ ...z, einzug: 24 })), ...feld('Verlauf / Wirkung', b.verlaufWirkung).map((z) => ({ ...z, einzug: 24 })),
          ...feld('Reaktionen', b.reaktionen).map((z) => ({ ...z, einzug: 24 })), ...feld('Übungen / Empfehlungen', b.uebungen).map((z) => ({ ...z, einzug: 24 })),
          { text: b.bestaetigung ? `Bestätigt vom Patienten: ${BESTAETIGUNG_TEXT[b.bestaetigung.art] ?? b.bestaetigung.art} · ${datumText(b.bestaetigung.zeitpunkt.slice(0, 10))}${b.bestaetigung.werName ? ` · ${b.bestaetigung.werName}` : ''}${b.bestaetigung.bild ? ' (Unterschriftsbild liegt in der Akte)' : ''}` : 'Ohne Bestätigung des Patienten', einzug: 24 });
      }
    } else zeilen.push('Noch keine Behandlung dokumentiert.');
    abschnitte.push({ titel: `Fall ${f.nummer}${f.bezeichnung ? ` – ${f.bezeichnung}` : ''}`, zeilen });
  }
  if (!faelle.length) abschnitte.push({ titel: 'Behandlungsfälle', zeilen: ['Noch kein Behandlungsfall.'] });

  if (alleTermine.length) {
    abschnitte.push({ titel: 'Termine', zeilen: alleTermine.map((x) => `${datumZeitText(x.beginn, { jahr: true })}–${zeitText(x.ende)} · ${x.art} · ${TERMIN_STATUS[x.status] ?? x.status}${x.verordnungId ? ' · auf Rezept' : ''}`) });
  }

  const heute = heuteBerlin();
  const daten = textPdf({
    titel: `Patientenakte ${name(p)} (${p.patientennummer})`,
    untertitel: `${praxisName()} · Einsicht nach § 630g BGB · erstellt am ${datumText(heute)} · Dokumentation nach § 630f BGB, Einträge werden nicht geändert, sondern mit Datum ersetzt`,
    fuss: `Vertraulich – Gesundheitsdaten · ${praxisName()}`,
    abschnitte,
  });
  await protokolliere(db, { actor: wer, action: 'akte_export', objectType: 'patient', objectId: patientId, details: { faelle: faelle.length, seiten: (daten.length / 1024) | 0 } });
  return { daten, name: `Patientenakte-${p.patientennummer}-${heute}.pdf` };
}
