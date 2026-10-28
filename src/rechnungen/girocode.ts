/**
 * GiroCode (EPC-QR-Code, EPC069-12) für Rechnungen (W102): Die Banking-App des Patienten liest IBAN, Betrag und
 * Rechnungsnummer als Verwendungszweck – so trifft der Zahlungsabgleich in Lexware (N33). Die Bankverbindung
 * steht in den Einstellungen (Konfiguration); ohne sie gibt es keinen Code. Nur lesend, keine fremden Dienste.
 */
import { toBuffer } from 'qrcode';
import type { Db } from '../db/index.ts';
import { praxisName } from '../praxis.ts';
import { einstellungen, ibanNormieren } from '../kartei/konfiguration.ts';

export interface Bankverbindung {
  inhaber: string;
  iban: string;
  bic: string | null;
}

/** „DE89370400440532013000“ → „DE89 3704 0044 0532 0130 00“ */
export const ibanLesbar = (iban: string): string => iban.replace(/(.{4})/g, '$1 ').trim();

/** Bankverbindung aus den Einstellungen; null, solange keine gültige IBAN hinterlegt ist */
export async function bankverbindung(db: Db): Promise<Bankverbindung | null> {
  const e = await einstellungen(db);
  const iban = e.bank_iban ? ibanNormieren(e.bank_iban) : null;
  if (!iban) return null;
  return { inhaber: (e.bank_inhaber ?? '').trim() || praxisName(), iban, bic: (e.bank_bic ?? '').replace(/\s+/g, '').toUpperCase() || null };
}

/** Der Text im Code nach EPC069-12, Version 002 (BIC darf leer sein), Zeichensatz 1 = UTF-8 */
export function epcText(d: { bank: Bankverbindung; betrag: number; verwendungszweck: string }): string {
  const betrag = Math.round(d.betrag * 100) / 100;
  if (!(betrag > 0) || betrag > 999_999_999.99) throw new Error('GiroCode: Betrag muss zwischen 0,01 und 999.999.999,99 € liegen');
  const zweck = d.verwendungszweck.replace(/[\r\n]+/g, ' ').trim().slice(0, 140);
  return ['BCD', '002', '1', 'SCT', d.bank.bic ?? '', d.bank.inhaber.slice(0, 70), d.bank.iban, `EUR${betrag.toFixed(2)}`, '', '', zweck, ''].join('\n');
}

/** PNG des Codes (Fehlerkorrektur M, wie EPC empfiehlt) */
export const girocodePng = (text: string): Promise<Uint8Array> => toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: 1, scale: 6 }) as Promise<Uint8Array>;

/** Code als data:-Adresse für ein <img> (CSP erlaubt img-src data:) */
export async function girocodeDataUri(d: { bank: Bankverbindung; betrag: number; verwendungszweck: string }): Promise<string> {
  const png = await girocodePng(epcText(d));
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}
