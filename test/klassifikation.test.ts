import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ablageName, klassifiziere, lieferantName, lieferantZu, merkmale, nameAusDomain } from '../src/rechnungen/klassifikation.ts';
import { nettoUndSteuer } from '../src/rechnungen/kopfdaten.ts';
import { istPdf, pdfText } from '../src/rechnungen/pdf.ts';

const RECHNUNG = 'Rechnung\nRechnungsnummer 4711\nGesamtbetrag 49,95 EUR\nIBAN DE89 3704 0044 0532 0130 00';

test('bekannter Lieferant mit Rechnungsmerkmal → rechnung, ohne → unklar', () => {
  assert.equal(klassifiziere({ bekannterLieferant: true, betreff: 'x', text: RECHNUNG }).klasse, 'rechnung');
  assert.equal(klassifiziere({ bekannterLieferant: true, betreff: 'AGB', text: 'Allgemeine Geschäftsbedingungen' }).klasse, 'unklar');
});

test('unbekannter Absender wird nie automatisch zur Rechnung', () => {
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Rechnung', text: RECHNUNG }).klasse, 'unklar');
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Newsletter', text: 'Unsere Angebote' }).klasse, 'keine_rechnung');
});

test('Patientenpost: Betreff oder Text mit Verordnung, Befund, Rezept …', () => {
  for (const betreff of ['Mein Rezept', 'Befund von Dr. X', 'Heilmittelverordnung']) {
    assert.equal(klassifiziere({ bekannterLieferant: false, betreff, text: '' }).klasse, 'patient', betreff);
  }
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Unterlagen', text: 'Diagnose: Lumbalgie' }).klasse, 'patient');
  // Auch eine Rechnung mit Patientenbezug von Unbekannten (z. B. vom Arzt) wird nicht abgelegt
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Rechnung', text: `${RECHNUNG}\nDiagnose` }).klasse, 'patient');
});

test('Fehltreffer aus der Zählung vom 20.10.2026 sind keine Patientenpost mehr', () => {
  const zahlbar = `${RECHNUNG}\nZahlbar per Überweisung innerhalb 14 Tagen`;
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Rechnung', text: zahlbar }).klasse, 'unklar');
  const recht = `${RECHNUNG}\nHinweis gemäß Verordnung (EU) 2019/1150`;
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Ihre Rechnung', text: recht }).klasse, 'unklar');
  // zwei schwache Wörter zusammen bleiben Patientenpost
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'x', text: 'Rezept liegt bei, Krankenkasse AOK' }).klasse, 'patient');
  // im Betreff genügt auch „Überweisung“
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Überweisung vom Hausarzt', text: '' }).klasse, 'patient');
});

test('Unbekannte Absender: mit Schalter Rechnung, ohne unklar; Patientenpost bleibt Patientenpost', () => {
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Rechnung', text: RECHNUNG, unbekannteAlsRechnung: true }).klasse, 'rechnung');
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Rechnung', text: RECHNUNG }).klasse, 'unklar');
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'x', text: `${RECHNUNG}\nDiagnose`, unbekannteAlsRechnung: true }).klasse, 'patient');
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Scan', text: '', unbekannteAlsRechnung: true }).klasse, 'unklar');
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'x', text: 'Lieferschein\nUSt-IdNr DE123456789\nSumme 3,00', unbekannteAlsRechnung: true }).klasse, 'unklar', 'ohne das Wort Rechnung keine Rechnung');
});

test('Netto und Umsatzsteuer – nur wenn es zum Brutto passt', () => {
  assert.deepEqual(nettoUndSteuer('Nettobetrag 41,97 €\nzzgl. 19 % MwSt 7,98 €\nGesamtbetrag 49,95 €', 49.95), { netto: 41.97, ust: 7.98, ustSatz: '19 %' });
  assert.deepEqual(nettoUndSteuer('Summe netto 100,00\n7 % USt 3,50\n19 % USt 9,50\nGesamt 113,00', 113), { netto: 100, ust: 13, ustSatz: '7 % + 19 %' });
  assert.deepEqual(nettoUndSteuer('MwSt. 19% 7,98\nGesamtbetrag 49,95', 49.95), { netto: 41.97, ust: 7.98, ustSatz: '19 %' }, 'Netto ausgerechnet, Satz passt');
  assert.deepEqual(nettoUndSteuer('MwSt. 19% 2,00\nGesamtbetrag 49,95', 49.95), {}, 'Satz passt nicht → nichts');
  assert.deepEqual(nettoUndSteuer('Netto 40,00\n19 % MwSt 7,98\nGesamt 49,95', 49.95), {}, 'Summe stimmt nicht → nichts');
  assert.deepEqual(nettoUndSteuer('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. Gesamt 80,00', 80), { netto: 80, ust: 0, ustSatz: '0 % (steuerfrei)' });
  assert.deepEqual(nettoUndSteuer('Gesamt 80,00', 80), {});
  assert.deepEqual(nettoUndSteuer('19 % MwSt auf 41,97\nGesamtbetrag 49,95', 49.95), { netto: 41.97, ust: 7.98, ustSatz: '19 %' }, 'Zahl ist die Grundlage');
  assert.deepEqual(nettoUndSteuer('Gesamtbetrag 49,95 inkl. 19 % MwSt', 49.95), { netto: 41.97, ust: 7.98, ustSatz: '19 % (errechnet)' });
  assert.deepEqual(nettoUndSteuer('Gesamt 20,00 inkl. 7 % MwSt und 19 % MwSt', 20), {}, 'zwei Sätze ohne Beträge: nichts errechnen');
});

test('Scan ohne Text von Unbekannten ist unklar – könnte ein Rezeptfoto sein', () => {
  assert.equal(klassifiziere({ bekannterLieferant: false, betreff: 'Scan', text: '  ' }).klasse, 'unklar');
});

test('Merkmale und Namen', () => {
  assert.deepEqual(merkmale(RECHNUNG).sort(), ['betrag', 'iban', 'nummer', 'titel']);
  assert.equal(lieferantZu('rechnung.telekom.de', [{ name: 'Telekom', domains: ['telekom.de'] }])?.name, 'Telekom');
  assert.equal(lieferantZu('nichttelekom.de', [{ name: 'Telekom', domains: ['telekom.de'] }]), undefined);
  assert.equal(nameAusDomain('mail.beispiel-gmbh.de'), 'beispiel-gmbh');
  assert.equal(ablageName('2026-10-03', 'Rechnung 4711.pdf'), '03-10-2026-ER-Rechnung 4711.pdf');
  assert.equal(ablageName('2026-10-03', 'RE:77'), '03-10-2026-ER-RE_77.pdf', 'Endung ergänzt, unzulässige Zeichen ersetzt');
  assert.equal(ablageName('2026-10-03', '03-10-2026-ER-a.pdf'), '03-10-2026-ER-a.pdf', 'nicht doppelt');
  assert.equal(lieferantName('rechnung.telekom.de'), 'Telekom');
  assert.equal(lieferantName('gmail.com', 'Kursleiterin Erika'), 'Kursleiterin Erika', 'bei Freemail der Anzeigename');
});

/** Ein echtes, kleines PDF mit Textebene (nur ASCII) */
function kleinesPdf(zeilen: string[]): Uint8Array {
  const inhalt = zeilen.map((z, i) => `BT /F1 12 Tf 50 ${780 - i * 20} Td (${z.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const versatz: number[] = [];
  objekte.forEach((o, i) => {
    versatz.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

test('PDF-Text wird gelesen; kaputtes PDF ergibt leeren Text', async () => {
  const bytes = kleinesPdf(['Rechnung', 'Rechnungsnummer 4711', 'Gesamtbetrag 49,95 EUR']);
  assert.ok(istPdf({}, bytes));
  const text = await pdfText(bytes);
  assert.match(text, /Rechnungsnummer 4711/);
  assert.ok(bytes.length > 0, 'der Puffer bleibt für den Upload erhalten');
  assert.equal(await pdfText(new TextEncoder().encode('%PDF-kaputt')), '');
  assert.equal(istPdf({}, new TextEncoder().encode('GIF89a')), false);
});
