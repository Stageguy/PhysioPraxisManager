/**
 * Lexware-Kunden (W99): aus den Kontakten der Public API wird eine schlanke, einheitliche Kundenkarte –
 * Name oder Firma, Kundennummer, eine Mailadresse, eine Telefonnummer, die Rechnungsadresse. Nur lesend.
 *
 * Eine Quelle liefert alle Kunden und hält sie ein paar Minuten im Speicher (Lexware erlaubt 2 Anfragen/s;
 * 162 Kunden passen auf eine Seite). Die Attrappe liefert erfundene Kunden für die Testumgebung, die
 * keinen Lexware-Schlüssel hat (N28: nur erfundene Patienten im Test).
 */
import type { Kontakt, LexwareClient } from './client.ts';

export interface LexwareKunde {
  /** Kontakt-ID in Lexware (UUID) */
  id: string;
  /** Kundennummer (roles.customer.number) */
  nummer: string;
  art: 'person' | 'firma';
  anrede: string | null;
  /** Bei Firmen: Ansprechpartner, sonst aus dem Firmennamen geraten (wenn er wie ein Personenname aussieht) */
  vorname: string;
  nachname: string;
  /** Firmenname, wie er in Lexware steht; bei Personen null */
  firma: string | null;
  email: string | null;
  telefon: string | null;
  adresse: { zusatz: string | null; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; land: string } | null;
  /** In Lexware liegt eine Notiz – ihr Inhalt wird hier nicht übernommen oder gezeigt */
  notiz: boolean;
  archiviert: boolean;
}

export interface LexwareKunden {
  /** Alle Kunden; `neu` holt sie frisch statt aus dem Zwischenspeicher */
  alle(o?: { neu?: boolean }): Promise<{ kunden: LexwareKunde[]; stand: string }>;
  /** Erfundene Kunden (Testumgebung) statt echter */
  attrappe: boolean;
}

const leer = (s: string | undefined | null): string | null => (s && s.trim() ? s.trim() : null);

/** „Kurpromenade 3a“ → Straße und Hausnummer; ohne erkennbare Nummer bleibt alles Straße */
export function strasseTeilen(strasse: string | undefined | null): { strasse: string | null; hausnummer: string | null } {
  const s = (strasse ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { strasse: null, hausnummer: null };
  const m = /^(.+?)\s+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?)$/.exec(s);
  return m ? { strasse: m[1]!.replace(/,$/, ''), hausnummer: m[2]!.replace(/\s/g, '') } : { strasse: s, hausnummer: null };
}

const FIRMA_WORT = /\b(GmbH|AG|KG|UG|OHG|GbR|mbH|e\.?\s?V\.?|Ltd|Inc|Hotel|Praxis|Klinik|Verein|Stiftung|Apotheke|Haus|Gesellschaft|Bank|Versicherung|Schule|Kur|Zentrum|Studio|Shop|Service|Institut|Gemeinde|Stadt|Sanatorium|Pflege|Reha)\b/i;

/** Sieht der Firmenname wie ein Personenname aus („Anna Müller“), dann Vor- und Nachname raten – zum Prüfen im Formular */
export function personAusFirma(name: string): { vorname: string; nachname: string } | null {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n || FIRMA_WORT.test(n) || /[\d&@/+]/.test(n)) return null;
  const worte = n.split(' ');
  if (worte.length < 2 || worte.length > 4) return null;
  return { vorname: worte[0]!, nachname: worte.slice(1).join(' ') };
}

/** Aus einem Lexware-Kontakt die Kundenkarte */
export function kundeAus(k: Kontakt): LexwareKunde {
  const nummer = k.roles?.customer?.number;
  const ansprech = k.company?.contactPersons?.find((p) => p.primary) ?? k.company?.contactPersons?.[0];
  const firma = leer(k.company?.name);
  const geraten = firma && !ansprech?.lastName ? personAusFirma(firma) : null;
  const rechnung = k.addresses?.billing?.[0];
  const mail = [k.emailAddresses?.private, k.emailAddresses?.business, k.emailAddresses?.office, k.emailAddresses?.other].flat().find((m) => m && m.includes('@'));
  const telefon = [k.phoneNumbers?.mobile, k.phoneNumbers?.private, k.phoneNumbers?.business, k.phoneNumbers?.office, k.phoneNumbers?.other].flat().find((t) => t && /\d{3}/.test(t));
  return {
    id: k.id,
    nummer: nummer === undefined || nummer === null ? '' : String(nummer),
    art: firma ? 'firma' : 'person',
    anrede: leer(k.person?.salutation ?? ansprech?.salutation),
    vorname: leer(k.person?.firstName) ?? leer(ansprech?.firstName) ?? geraten?.vorname ?? '',
    nachname: leer(k.person?.lastName) ?? leer(ansprech?.lastName) ?? geraten?.nachname ?? firma ?? '',
    firma,
    email: leer(mail)?.toLowerCase() ?? null,
    telefon: leer(telefon),
    adresse: rechnung && (rechnung.street || rechnung.city || rechnung.zip)
      ? { zusatz: leer(rechnung.supplement), ...strasseTeilen(rechnung.street), plz: leer(rechnung.zip), ort: leer(rechnung.city), land: leer(rechnung.countryCode) ?? 'DE' }
      : null,
    notiz: Boolean(leer(k.note)),
    archiviert: Boolean(k.archived),
  };
}

/** Anzeigename: Firma, sonst „Vorname Nachname“ */
export const kundenName = (k: Pick<LexwareKunde, 'vorname' | 'nachname' | 'firma'>): string => k.firma ?? `${k.vorname} ${k.nachname}`.trim();

const sortiert = (kunden: LexwareKunde[]) => kunden.sort((a, b) => `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, 'de'));

/** Kunden aus Lexware, ein paar Minuten zwischengespeichert; ein laufender Abruf wird geteilt */
export function lexwareKunden(client: Pick<LexwareClient, 'kontakte'>, o: { haltbarMs?: number; jetzt?: () => number } = {}): LexwareKunden {
  const haltbar = o.haltbarMs ?? 5 * 60_000;
  const jetzt = o.jetzt ?? Date.now;
  let gespeichert: { kunden: LexwareKunde[]; stand: string; bis: number } | undefined;
  let laufend: Promise<{ kunden: LexwareKunde[]; stand: string }> | undefined;
  return {
    attrappe: false,
    async alle({ neu = false } = {}) {
      if (!neu && gespeichert && gespeichert.bis > jetzt()) return { kunden: gespeichert.kunden, stand: gespeichert.stand };
      if (!laufend) {
        laufend = (async () => {
          const kunden: LexwareKunde[] = [];
          for await (const k of client.kontakte()) {
            const kunde = kundeAus(k);
            if (kunde.nummer) kunden.push(kunde);
          }
          const stand = new Date(jetzt()).toISOString();
          gespeichert = { kunden: sortiert(kunden), stand, bis: jetzt() + haltbar };
          return { kunden: gespeichert.kunden, stand };
        })().finally(() => { laufend = undefined; });
      }
      return laufend;
    },
  };
}

/** Erfundene Kunden für die Testumgebung – Namen wie in den Testdaten, damit „wahrscheinlich bekannt“ sichtbar wird */
export function attrappeKunden(): LexwareKunden {
  const adresse = (strasse: string, hausnummer: string, plz: string, ort: string) => ({ zusatz: null, strasse, hausnummer, plz, ort, land: 'DE' });
  const kunden: LexwareKunde[] = [
    { id: 'attrappe-1', nummer: '10001', art: 'person', anrede: 'Frau', vorname: 'Anna', nachname: 'Beispiel', firma: null, email: 'shopping+anna@2late.de', telefon: '0151 1234567', adresse: adresse('Kurpromenade', '3', '86825', 'Bad Wörishofen'), notiz: false, archiviert: false },
    { id: 'attrappe-2', nummer: '10002', art: 'person', anrede: 'Herr', vorname: 'Bernd', nachname: 'Mustermann', firma: null, email: null, telefon: '08247 9999', adresse: adresse('Hauptstraße', '12', '86825', 'Bad Wörishofen'), notiz: true, archiviert: false },
    { id: 'attrappe-3', nummer: '10003', art: 'person', anrede: 'Frau', vorname: 'Wilma', nachname: 'Wartend', firma: null, email: 'shopping+wilma@2late.de', telefon: '0160 5550000', adresse: adresse('Am Kurpark', '7', '86825', 'Bad Wörishofen'), notiz: false, archiviert: false },
    { id: 'attrappe-4', nummer: '10004', art: 'person', anrede: null, vorname: 'Xaver', nachname: 'Ohnekontakt', firma: null, email: null, telefon: null, adresse: { zusatz: 'Hinterhaus', strasse: 'Bergweg', hausnummer: '1a', plz: '87719', ort: 'Mindelheim', land: 'DE' }, notiz: false, archiviert: false },
    { id: 'attrappe-5', nummer: '10005', art: 'firma', anrede: null, vorname: 'Yvonne', nachname: 'Zeller', firma: 'Yvonne Zeller', email: 'shopping+yvonne@2late.de', telefon: null, adresse: adresse('Mühlweg', '4', '86825', 'Bad Wörishofen'), notiz: false, archiviert: false },
    { id: 'attrappe-6', nummer: '10006', art: 'firma', anrede: null, vorname: '', nachname: 'Kurhotel Sonnenhof GmbH', firma: 'Kurhotel Sonnenhof GmbH', email: 'shopping+sonnenhof@2late.de', telefon: '08247 1000', adresse: adresse('Kneippstraße', '20', '86825', 'Bad Wörishofen'), notiz: false, archiviert: false },
    { id: 'attrappe-7', nummer: '10007', art: 'person', anrede: 'Frau', vorname: 'Zita', nachname: 'Vergangen', firma: null, email: null, telefon: null, adresse: null, notiz: false, archiviert: true },
  ];
  return { attrappe: true, alle: async () => ({ kunden: sortiert([...kunden]), stand: new Date().toISOString() }) };
}
