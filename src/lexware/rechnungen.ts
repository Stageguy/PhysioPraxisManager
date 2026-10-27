/**
 * Ausgangsrechnungen aus Lexware (W103): Belegliste, Datei (PDF) und Zahlungsstand – nur lesend. Die echte Quelle
 * spricht mit der Public API (2 Anfragen/s), die Attrappe liefert erfundene Rechnungen zu den erfundenen Kunden der
 * Testumgebung, mit selbst erzeugten PDFs (N28: keine echten Patientendaten im Test).
 */
import { textPdf } from '../pdf/text.ts';
import type { Beleg, Belegstatus, LexwareClient, Zahlung } from './client.ts';

export interface LexwareRechnungen {
  attrappe: boolean;
  /** Alle Ausgangsrechnungen in jedem Status (außer dem Sichtfilter „overdue“), optional nur die eines Kontakts */
  belege(o?: { kontaktId?: string }): AsyncIterable<Beleg>;
  /** Die Datei einer festgeschriebenen Rechnung – Entwürfe haben keine */
  datei(rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  zahlung(rechnungId: string): Promise<Zahlung>;
}

/** Alle Status, die sich kombinieren lassen („overdue“ ist nur eine Sicht auf „open“) */
export const ALLE_STATUS: Belegstatus[] = ['draft', 'open', 'paid', 'paidoff', 'voided', 'transferred', 'sepadebit'];

export function lexwareRechnungen(client: Pick<LexwareClient, 'belege' | 'rechnungDatei' | 'zahlung'>): LexwareRechnungen {
  return {
    attrappe: false,
    belege: (o = {}) => client.belege({ typ: 'invoice', status: ALLE_STATUS, kontaktId: o.kontaktId }),
    datei: (id) => client.rechnungDatei(id),
    zahlung: (id) => client.zahlung(id),
  };
}

interface Erfunden { id: string; kontakt: string; name: string; nummer: string; datum: string; faellig: string; status: Belegstatus; betrag: number; bezahlt?: string; geaendert: string }

/** Erfundene Rechnungen zu den Attrappe-Kunden (attrappe-1 Anna Beispiel, attrappe-2 Bernd Mustermann, attrappe-5 Yvonne Zeller) */
const ERFUNDEN: Erfunden[] = [
  { id: 'attrappe-re-1', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2025-0007', datum: '2025-03-03', faellig: '2025-03-17', status: 'paid', betrag: 89, bezahlt: '2025-03-12', geaendert: '2025-03-12T09:00:00Z' },
  { id: 'attrappe-re-2', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2026-0031', datum: '2026-02-02', faellig: '2026-02-16', status: 'paid', betrag: 178, bezahlt: '2026-02-10', geaendert: '2026-02-10T09:00:00Z' },
  { id: 'attrappe-re-3', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2026-0088', datum: '2026-10-01', faellig: '2026-10-15', status: 'open', betrag: 89, geaendert: '2026-10-01T09:00:00Z' },
  { id: 'attrappe-re-4', kontakt: 'attrappe-2', name: 'Bernd Mustermann', nummer: 'RE-2024-0012', datum: '2024-11-05', faellig: '2024-11-19', status: 'paid', betrag: 120, bezahlt: '2024-11-20', geaendert: '2024-11-20T09:00:00Z' },
  { id: 'attrappe-re-5', kontakt: 'attrappe-2', name: 'Bernd Mustermann', nummer: 'RE-2026-0040', datum: '2026-03-01', faellig: '2026-03-15', status: 'voided', betrag: 60, geaendert: '2026-03-04T09:00:00Z' },
  { id: 'attrappe-re-6', kontakt: 'attrappe-5', name: 'Yvonne Zeller', nummer: 'RE-2026-0075', datum: '2026-08-20', faellig: '2026-09-03', status: 'paid', betrag: 95, bezahlt: '2026-08-28', geaendert: '2026-08-28T09:00:00Z' },
];

const beleg = (e: Erfunden): Beleg => ({
  id: e.id, voucherType: 'invoice', voucherStatus: e.status, voucherNumber: e.nummer, voucherDate: `${e.datum}T00:00:00.000+01:00`, dueDate: `${e.faellig}T00:00:00.000+01:00`,
  createdDate: `${e.datum}T08:00:00.000+01:00`, updatedDate: e.geaendert, contactId: e.kontakt, contactName: e.name, totalAmount: e.betrag, openAmount: e.status === 'open' ? e.betrag : 0, currency: 'EUR', archived: false,
});

/** PDF, wie es Lexware liefern würde – erfunden, nur Testdaten */
export function erfundenesRechnungsPdf(e: { nummer: string; name: string; datum: string; betrag: number; faellig: string }): Uint8Array {
  return textPdf({
    titel: `Rechnung ${e.nummer}`, untertitel: 'Privatpraxis für Physiotherapie – TESTDATEN, keine echte Rechnung', fuss: 'Erzeugt von der Lexware-Attrappe der Testumgebung',
    abschnitte: [
      { zeilen: [`Rechnungsempfänger: ${e.name}`, `Rechnungsdatum: ${e.datum}`, `Fällig am: ${e.faellig}`] },
      { titel: 'Leistungen', zeilen: ['Krankengymnastik, 3 × 20 Min.', `Gesamtbetrag: ${e.betrag.toFixed(2).replace('.', ',')} €`, 'Umsatzsteuerfrei nach § 19 UStG (Kleinunternehmer).'] },
    ],
  });
}

export function attrappeRechnungen(): LexwareRechnungen {
  return {
    attrappe: true,
    async *belege(o = {}) {
      for (const e of ERFUNDEN) if (!o.kontaktId || e.kontakt === o.kontaktId) yield beleg(e);
    },
    async datei(id) {
      const e = ERFUNDEN.find((x) => x.id === id);
      return e && e.status !== 'draft' ? { daten: erfundenesRechnungsPdf(e), name: `${e.nummer}.pdf` } : undefined;
    },
    async zahlung(id) {
      const e = ERFUNDEN.find((x) => x.id === id);
      if (!e) throw new Error(`Attrappe kennt Rechnung ${id} nicht`);
      const bezahlt = e.status === 'paid';
      return { openAmount: bezahlt || e.status === 'voided' ? 0 : e.betrag, paymentStatus: bezahlt ? 'balanced' : 'openRevenue', voucherStatus: e.status, paidDate: e.bezahlt ? `${e.bezahlt}T00:00:00.000+01:00` : undefined };
    },
  };
}
