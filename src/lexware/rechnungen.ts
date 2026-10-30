/**
 * Ausgangsrechnungen in Lexware (W103, W100): Belegliste, Datei (PDF) und Zahlungsstand lesen; Kontakt und Rechnung
 * anlegen (Klick 1 „Nach Lexware“ – festgeschrieben, Lexware vergibt die Nummer und erzeugt das PDF). Die echte
 * Quelle spricht mit der Public API (2 Anfragen/s), die Attrappe hält erfundene Rechnungen zu den erfundenen Kunden
 * der Testumgebung im Speicher und erzeugt PDFs selbst (N28: keine echten Patientendaten im Test).
 */
import { textPdf } from '../pdf/text.ts';
import { berlinMitternachtUtc, tagPlus } from '../zeit.ts';
import type { Beleg, Belegstatus, LexwareClient, Zahlung } from './client.ts';

export interface NeuerKontakt {
  anrede?: string | null;
  vorname?: string | null;
  nachname: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  land?: string | null;
  email?: string | null;
}

export interface NeueRechnung {
  kontaktId: string;
  /** Rechnungsdatum (JJJJ-MM-TT) */
  datum: string;
  zeitraumVon?: string | null;
  zeitraumBis?: string | null;
  titel: string;
  /** Text unter den Positionen (Textbausteine) */
  bemerkung?: string;
  /** 0 = steuerfrei bzw. Kleinunternehmer; sonst Prozent */
  ustSatz: number;
  positionen: { name: string; beschreibung?: string; anzahl: number; einzelpreis: number }[];
}

export interface AngelegteRechnung {
  id: string;
  nummer: string;
  datum: string;
  faellig: string | null;
  erstelltAm?: string;
  geaendertAm?: string;
}

export interface LexwareRechnungen {
  attrappe: boolean;
  /** Alle Ausgangsrechnungen in jedem Status (außer dem Sichtfilter „overdue“), optional nur die eines Kontakts */
  belege(o?: { kontaktId?: string }): AsyncIterable<Beleg>;
  /** Die Datei einer festgeschriebenen Rechnung – Entwürfe haben keine */
  datei(rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined>;
  zahlung(rechnungId: string): Promise<Zahlung>;
  /** Kunden anlegen – Lexware vergibt die Kundennummer */
  kontaktAnlegen(k: NeuerKontakt): Promise<{ id: string; nummer: string }>;
  /** Rechnung anlegen und festschreiben – Nummer und Fälligkeit kommen zurück */
  rechnungAnlegen(r: NeueRechnung): Promise<AngelegteRechnung>;
}

/** Alle Status, die sich kombinieren lassen („overdue“ ist nur eine Sicht auf „open“) */
export const ALLE_STATUS: Belegstatus[] = ['draft', 'open', 'paid', 'paidoff', 'voided', 'transferred', 'sepadebit'];

/** „2026-10-28“ → „2026-10-28T00:00:00.000+01:00“ (Lexware will Datum mit Zeitzone; Berlin, Sommer-/Winterzeit) */
export function lexwareDatum(tag: string): string {
  const minuten = Math.round((Date.parse(`${tag}T00:00:00Z`) - Date.parse(berlinMitternachtUtc(tag))) / 60_000);
  const h = String(Math.floor(Math.abs(minuten) / 60)).padStart(2, '0');
  const m = String(Math.abs(minuten) % 60).padStart(2, '0');
  return `${tag}T00:00:00.000${minuten < 0 ? '-' : '+'}${h}:${m}`;
}

const leer = (s: string | null | undefined) => (s && s.trim() ? s.trim() : undefined);

/** Lexware-Körper für einen Kundenkontakt (Person); höchstens eine Adresse und eine Mailadresse (API-Grenze) */
export function kontaktKoerper(k: NeuerKontakt): Record<string, unknown> {
  const adresse = leer(k.strasse) || leer(k.ort) || leer(k.plz);
  return {
    version: 0,
    roles: { customer: {} },
    person: { salutation: leer(k.anrede), firstName: leer(k.vorname), lastName: k.nachname.trim() },
    ...(adresse ? { addresses: { billing: [{ street: leer(k.strasse), zip: leer(k.plz), city: leer(k.ort), countryCode: leer(k.land) ?? 'DE' }] } } : {}),
    ...(leer(k.email) ? { emailAddresses: { private: [k.email!.trim()] } } : {}),
  };
}

/** Lexware-Körper für eine Rechnung: freie Positionen, steuerfrei (vatfree) oder netto mit USt */
export function rechnungKoerper(r: NeueRechnung): Record<string, unknown> {
  return {
    voucherDate: lexwareDatum(r.datum),
    address: { contactId: r.kontaktId },
    lineItems: r.positionen.map((p) => ({
      type: 'custom', name: p.name.slice(0, 255), description: p.beschreibung || undefined, quantity: p.anzahl, unitName: 'Einheit',
      unitPrice: { currency: 'EUR', netAmount: p.einzelpreis, taxRatePercentage: r.ustSatz },
    })),
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: r.ustSatz > 0 ? 'net' : 'vatfree' },
    shippingConditions: r.zeitraumVon && r.zeitraumBis
      ? { shippingType: 'serviceperiod', shippingDate: lexwareDatum(r.zeitraumVon), shippingEndDate: lexwareDatum(r.zeitraumBis) }
      : { shippingType: 'service', shippingDate: lexwareDatum(r.datum) },
    paymentConditions: { paymentTermLabel: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.', paymentTermDuration: 14 },
    title: r.titel,
    ...(r.bemerkung ? { remark: r.bemerkung } : {}),
  };
}

export function lexwareRechnungen(client: Pick<LexwareClient, 'belege' | 'rechnungDatei' | 'zahlung' | 'kontaktAnlegen' | 'kontakt' | 'rechnungAnlegen' | 'rechnung'>): LexwareRechnungen {
  return {
    attrappe: false,
    belege: (o = {}) => client.belege({ typ: 'invoice', status: ALLE_STATUS, kontaktId: o.kontaktId }),
    datei: (id) => client.rechnungDatei(id),
    zahlung: (id) => client.zahlung(id),
    async kontaktAnlegen(k) {
      const { id } = await client.kontaktAnlegen(kontaktKoerper(k));
      const kontakt = await client.kontakt(id);
      return { id, nummer: kontakt.roles?.customer?.number == null ? '' : String(kontakt.roles.customer.number) };
    },
    async rechnungAnlegen(r) {
      const { id } = await client.rechnungAnlegen(rechnungKoerper(r), { finalize: true });
      const neu = await client.rechnung(id);
      return { id, nummer: neu.voucherNumber ?? '', datum: neu.voucherDate?.slice(0, 10) ?? r.datum, faellig: neu.dueDate?.slice(0, 10) ?? null, erstelltAm: neu.createdDate, geaendertAm: neu.updatedDate };
    },
  };
}

/** kontakt null = freie Adresse ohne Lexware-Kontakt (kommt in Lexware bei 94 echten Rechnungen vor, W103b) */
interface Erfunden { id: string; kontakt: string | null; name: string; nummer: string; datum: string; faellig: string; status: Belegstatus; betrag: number; bezahlt?: string; geaendert: string }

/** Erfundene Rechnungen zu den Attrappe-Kunden (attrappe-1 Anna Beispiel, attrappe-2 Bernd Mustermann, attrappe-5 Yvonne Zeller) */
const ERFUNDEN: Erfunden[] = [
  { id: 'attrappe-re-1', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2025-0007', datum: '2025-03-03', faellig: '2025-03-17', status: 'paid', betrag: 89, bezahlt: '2025-03-12', geaendert: '2025-03-12T09:00:00Z' },
  { id: 'attrappe-re-2', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2026-0031', datum: '2026-02-02', faellig: '2026-02-16', status: 'paid', betrag: 178, bezahlt: '2026-02-10', geaendert: '2026-02-10T09:00:00Z' },
  { id: 'attrappe-re-3', kontakt: 'attrappe-1', name: 'Anna Beispiel', nummer: 'RE-2026-0088', datum: '2026-10-01', faellig: '2026-10-15', status: 'open', betrag: 89, geaendert: '2026-10-01T09:00:00Z' },
  { id: 'attrappe-re-4', kontakt: 'attrappe-2', name: 'Bernd Mustermann', nummer: 'RE-2024-0012', datum: '2024-11-05', faellig: '2024-11-19', status: 'paid', betrag: 120, bezahlt: '2024-11-20', geaendert: '2024-11-20T09:00:00Z' },
  { id: 'attrappe-re-5', kontakt: 'attrappe-2', name: 'Bernd Mustermann', nummer: 'RE-2026-0040', datum: '2026-03-01', faellig: '2026-03-15', status: 'voided', betrag: 60, geaendert: '2026-03-04T09:00:00Z' },
  { id: 'attrappe-re-6', kontakt: 'attrappe-5', name: 'Yvonne Zeller', nummer: 'RE-2026-0075', datum: '2026-08-20', faellig: '2026-09-03', status: 'paid', betrag: 95, bezahlt: '2026-08-28', geaendert: '2026-08-28T09:00:00Z' },
  { id: 'attrappe-re-7', kontakt: null, name: 'Clara Testfeld', nummer: 'RE-2023-0005', datum: '2023-06-01', faellig: '2023-06-15', status: 'paid', betrag: 45, bezahlt: '2023-06-10', geaendert: '2023-06-10T09:00:00Z' },
];

const beleg = (e: Erfunden): Beleg => ({
  id: e.id, voucherType: 'invoice', voucherStatus: e.status, voucherNumber: e.nummer, voucherDate: `${e.datum}T00:00:00.000+01:00`, dueDate: `${e.faellig}T00:00:00.000+01:00`,
  createdDate: `${e.datum}T08:00:00.000+01:00`, updatedDate: e.geaendert, contactId: e.kontakt, contactName: e.name, totalAmount: e.betrag, openAmount: e.status === 'open' ? e.betrag : 0, currency: 'EUR', archived: false,
});

/** PDF, wie es Lexware liefern würde – erfunden, nur Testdaten */
export function erfundenesRechnungsPdf(e: { nummer: string; name: string; datum: string; betrag: number; faellig: string; zeilen?: string[] }): Uint8Array {
  return textPdf({
    titel: `Rechnung ${e.nummer}`, untertitel: 'Privatpraxis für Physiotherapie – TESTDATEN, keine echte Rechnung', fuss: 'Erzeugt von der Lexware-Attrappe der Testumgebung',
    abschnitte: [
      { zeilen: [`Rechnungsempfänger: ${e.name}`, `Rechnungsdatum: ${e.datum}`, `Fällig am: ${e.faellig}`] },
      { titel: 'Leistungen', zeilen: [...(e.zeilen ?? ['Krankengymnastik, 3 × 20 Min.']), `Gesamtbetrag: ${e.betrag.toFixed(2).replace('.', ',')} €`, 'Umsatzsteuerfrei nach § 19 UStG (Kleinunternehmer).'] },
    ],
  });
}

/**
 * Attrappe mit eigenem Speicher je Instanz: angelegte Kontakte und Rechnungen erscheinen danach in der Belegliste.
 * `neustartfest` (Testumgebung): Nummern und Kennungen kommen aus der Uhr, damit sie nach einem Neustart des Dienstes
 * nicht von vorn beginnen – sonst vergibt die Attrappe RE-…-9001 ein zweites Mal, und die Kartei meldet einen Nummernkonflikt (N40).
 */
export function attrappeRechnungen(o: { neustartfest?: boolean } = {}): LexwareRechnungen {
  const rechnungen: (Erfunden & { zeilen?: string[] })[] = ERFUNDEN.map((e) => ({ ...e }));
  const namen = new Map<string, string>(ERFUNDEN.filter((e) => e.kontakt).map((e) => [e.kontakt!, e.name]));
  let kontakte = 0;
  // Nummernkreis 9001 ff., damit nichts mit den Testdaten (RE-2026-0012 … 0101) oder PPM-Nummern zusammenstößt;
  // neustartfest: 9000 + Minuten seit dem 1.1.2026 (sechsstellig) – nach jedem Neustart ein neuer Bereich
  const basis = o.neustartfest ? Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60_000) % 900_000 : 0;
  let nummern = 9000 + basis;
  return {
    attrappe: true,
    async *belege(o = {}) {
      for (const e of rechnungen) if (!o.kontaktId || e.kontakt === o.kontaktId) yield beleg(e);
    },
    async datei(id) {
      const e = rechnungen.find((x) => x.id === id);
      return e && e.status !== 'draft' ? { daten: erfundenesRechnungsPdf(e), name: `${e.nummer}.pdf` } : undefined;
    },
    async zahlung(id) {
      const e = rechnungen.find((x) => x.id === id);
      if (!e) throw new Error(`Attrappe kennt Rechnung ${id} nicht`);
      const bezahlt = e.status === 'paid';
      return {
        openAmount: bezahlt || e.status === 'voided' ? 0 : e.betrag, paymentStatus: bezahlt ? 'balanced' : 'openRevenue', voucherStatus: e.status, paidDate: e.bezahlt ? `${e.bezahlt}T00:00:00.000+01:00` : undefined,
        paymentItems: bezahlt && e.bezahlt ? [{ paymentItemType: 'partPaymentFinancialTransaction', postingDate: `${e.bezahlt}T00:00:00.000+01:00`, amount: e.betrag, currency: 'EUR' }] : [],
      };
    },
    async kontaktAnlegen(k) {
      kontakte++;
      const id = `attrappe-k-${basis ? `${basis}-` : ''}${kontakte}`;
      namen.set(id, [k.vorname, k.nachname].filter(Boolean).join(' '));
      return { id, nummer: String(10100 + kontakte) };
    },
    async rechnungAnlegen(r) {
      // Ein Kontakt aus der Zeit vor dem Neustart: die Attrappe kennt ihn nicht mehr, rechnet aber weiter
      if (!namen.has(r.kontaktId)) { if (!o.neustartfest) throw new Error(`Attrappe kennt Kontakt ${r.kontaktId} nicht`); namen.set(r.kontaktId, 'Kunde (Attrappe, vor dem Neustart angelegt)'); }
      nummern++;
      const nummer = `RE-${r.datum.slice(0, 4)}-${String(nummern).padStart(4, '0')}`;
      const jetzt = new Date().toISOString();
      const e: Erfunden & { zeilen?: string[] } = {
        id: `attrappe-re-${nummer}`, kontakt: r.kontaktId, name: namen.get(r.kontaktId)!, nummer, datum: r.datum, faellig: tagPlus(r.datum, 14), status: 'open',
        betrag: Math.round(r.positionen.reduce((s, p) => s + p.anzahl * p.einzelpreis, 0) * (1 + r.ustSatz / 100) * 100) / 100, geaendert: jetzt,
        zeilen: r.positionen.map((p) => `${p.anzahl} × ${p.name}${p.beschreibung ? ` (${p.beschreibung})` : ''} à ${p.einzelpreis.toFixed(2).replace('.', ',')} €`),
      };
      rechnungen.push(e);
      return { id: e.id, nummer, datum: e.datum, faellig: e.faellig, erstelltAm: jetzt, geaendertAm: jetzt };
    },
  };
}
