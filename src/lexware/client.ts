/**
 * Lexware Office Public API (https://api.lexware.io) – nur was der Zahlungsabgleich braucht.
 * Geprüft gegen developers.lexware.io am 20.10.2026 (requirements N24):
 * - höchstens 2 Anfragen je Sekunde, sonst 429 (ohne Retry-After) → eigener Abstand + Rückzug
 * - Belegliste: GET /v1/voucherlist?voucherType=…&voucherStatus=a,b,c&page=&size= (max. 250)
 * - Zahlungen:  GET /v1/payments/{voucherId} → openAmount, paymentStatus, voucherStatus, paidDate
 * - Profil:     GET /v1/profile – prüft Schlüssel und Tarif, bevor irgendetwas läuft
 * - Geprüft am 27.10.2026 mit echtem Schlüssel: `overdue` darf nicht mit anderen Status kombiniert werden
 *   (400 „cannot be used in combination“); `open` umfasst überfällige Rechnungen bereits
 * - Kontakte:   GET /v1/contacts?customer=true&page=&size= (max. 250) – Personen (`person`) und Firmen
 *   (`company`), Rechnungsadresse unter `addresses.billing[0]`, Mail/Telefon als Listen je Art (W99)
 * Die Public API gibt es erst ab Tarif XL.
 */
import { setTimeout as sleep } from 'node:timers/promises';

const BASIS = 'https://api.lexware.io';
/** 2 Anfragen je Sekunde erlaubt – mit etwas Luft */
const ABSTAND_MS = 550;

export type Belegstatus = 'open' | 'paid' | 'paidoff' | 'voided' | 'transferred' | 'sepadebit' | 'overdue' | 'unchecked' | 'draft';

export interface Beleg {
  id: string;
  voucherType: string;
  voucherStatus: Belegstatus;
  voucherNumber?: string;
  voucherDate?: string;
  createdDate?: string;
  updatedDate?: string;
  dueDate?: string;
  contactId?: string | null;
  contactName?: string;
  totalAmount?: number;
  openAmount?: number;
  currency?: string;
  archived?: boolean;
}

export interface Zahlung {
  openAmount: number;
  paymentStatus: 'balanced' | 'openRevenue' | 'openExpense';
  voucherStatus: Belegstatus;
  paidDate?: string;
}

/** Kontakt aus /v1/contacts – nur die Felder, die die Kundenkarte braucht (W99) */
export interface Kontakt {
  id: string;
  version: number;
  roles: { customer?: { number?: number }; vendor?: { number?: number } };
  person?: { salutation?: string; firstName?: string; lastName?: string };
  company?: { name?: string; contactPersons?: { salutation?: string; firstName?: string; lastName?: string; primary?: boolean }[] };
  addresses?: { billing?: { supplement?: string; street?: string; zip?: string; city?: string; countryCode?: string }[] };
  emailAddresses?: Partial<Record<'business' | 'office' | 'private' | 'other', string[]>>;
  phoneNumbers?: Partial<Record<'business' | 'office' | 'mobile' | 'private' | 'fax' | 'other', string[]>>;
  note?: string;
  archived?: boolean;
}

/** Schlüssel fehlt, ist ungültig oder der Tarif hat keine Public API */
export class LexwareNichtBereit extends Error {
  readonly endgueltig = true;
}

export class LexwareFehler extends Error {
  readonly status: number;
  constructor(status: number, text: string) {
    super(text);
    this.status = status;
  }
}

type Abruf = typeof fetch;

export class LexwareClient {
  #schluessel: string;
  #abruf: Abruf;
  #abstandMs: number;
  #letzter = 0;

  constructor(schluessel: string | undefined, optionen: { abruf?: Abruf; abstandMs?: number } = {}) {
    if (!schluessel) {
      throw new LexwareNichtBereit('LEXWARE_API_KEY fehlt – die Public API gibt es erst ab Lexware Office XL (requirements A13)');
    }
    this.#schluessel = schluessel;
    this.#abruf = optionen.abruf ?? fetch;
    this.#abstandMs = optionen.abstandMs ?? ABSTAND_MS;
  }

  async #get<T>(pfad: string): Promise<T> {
    for (let versuch = 0; ; versuch++) {
      const warten = this.#letzter + this.#abstandMs - Date.now();
      if (warten > 0) await sleep(warten);
      this.#letzter = Date.now();
      const res = await this.#abruf(BASIS + pfad, {
        headers: { Authorization: `Bearer ${this.#schluessel}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 || res.status === 403) {
        throw new LexwareNichtBereit(
          `Lexware lehnt den Schlüssel ab (${res.status}) – Schlüssel prüfen; die Public API braucht den Tarif XL`,
        );
      }
      // 429 hat bei Lexware kein Retry-After: exponentiell zurückziehen
      if ((res.status === 429 || res.status >= 500) && versuch < 5) {
        await res.body?.cancel().catch(() => {});
        await sleep(2 ** versuch * 1000);
        continue;
      }
      throw new LexwareFehler(res.status, `Lexware ${res.status} bei GET ${pfad}`);
    }
  }

  /** Schreibend (POST/PUT) mit derselben Drossel; 429 und 5xx werden wiederholt, 4xx mit Lexware-Text gemeldet */
  async #schreiben<T>(methode: 'POST' | 'PUT', pfad: string, body: unknown): Promise<T> {
    for (let versuch = 0; ; versuch++) {
      const warten = this.#letzter + this.#abstandMs - Date.now();
      if (warten > 0) await sleep(warten);
      this.#letzter = Date.now();
      const res = await this.#abruf(BASIS + pfad, {
        method: methode,
        headers: { Authorization: `Bearer ${this.#schluessel}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw new LexwareNichtBereit(`Lexware lehnt den Schlüssel ab (${res.status}) – Schlüssel prüfen; die Public API braucht den Tarif XL`);
      if ((res.status === 429 || res.status >= 500) && versuch < 5) {
        await sleep(2 ** versuch * 1000);
        continue;
      }
      throw new LexwareFehler(res.status, `Lexware ${res.status} bei ${methode} ${pfad}${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
  }

  /** Schlüssel und Tarif prüfen – bricht mit klarer Meldung ab, statt still weiterzulaufen */
  profil(): Promise<{ organizationId: string; companyName?: string }> {
    return this.#get('/v1/profile');
  }

  /** Kontakt anlegen (Kunde) – Antwort: id, version; die Kundennummer vergibt Lexware, sie steht danach im Kontakt (W100) */
  kontaktAnlegen(body: unknown): Promise<{ id: string; resourceUri?: string; version: number }> {
    return this.#schreiben('POST', '/v1/contacts', body);
  }

  kontakt(id: string): Promise<Kontakt> {
    return this.#get(`/v1/contacts/${encodeURIComponent(id)}`);
  }

  /** Rechnung anlegen; mit finalize sofort festgeschrieben (Nummer, PDF) */
  rechnungAnlegen(body: unknown, o: { finalize: boolean }): Promise<{ id: string; resourceUri?: string; version: number }> {
    return this.#schreiben('POST', `/v1/invoices${o.finalize ? '?finalize=true' : ''}`, body);
  }

  rechnung(id: string): Promise<{ id: string; voucherNumber?: string; voucherStatus: string; voucherDate?: string; dueDate?: string; createdDate?: string; updatedDate?: string; totalPrice?: { totalGrossAmount?: number; totalNetAmount?: number } }> {
    return this.#get(`/v1/invoices/${encodeURIComponent(id)}`);
  }

  /** Alle Belege eines Typs mit diesen Status, Seite für Seite */
  async *belege(optionen: {
    typ: string;
    status: Belegstatus[];
    geaendertAb?: string;
    belegnummer?: string;
    /** nur Belege dieses Kontakts (contactId) */
    kontaktId?: string;
  }): AsyncGenerator<Beleg> {
    for (let seite = 0; ; seite++) {
      const q = new URLSearchParams({
        voucherType: optionen.typ,
        voucherStatus: optionen.status.join(','),
        page: String(seite),
        size: '250',
      });
      if (optionen.geaendertAb) q.set('updatedDateFrom', optionen.geaendertAb);
      if (optionen.belegnummer) q.set('voucherNumber', optionen.belegnummer);
      if (optionen.kontaktId) q.set('contactId', optionen.kontaktId);
      const antwort = await this.#get<{ content: Beleg[]; last: boolean }>(`/v1/voucherlist?${q}`);
      yield* antwort.content;
      if (antwort.last || !antwort.content.length) return;
    }
  }

  zahlung(belegId: string): Promise<Zahlung> {
    return this.#get(`/v1/payments/${encodeURIComponent(belegId)}`);
  }

  /** Nur nachsehen, ob Lexware die Rechnungsdatei liefert (Zählung, W103) – Antwortkörper wird verworfen */
  async rechnungDateiVorhanden(rechnungId: string): Promise<{ vorhanden: boolean; status: number; groesse?: number }> {
    const warten = this.#letzter + this.#abstandMs - Date.now();
    if (warten > 0) await sleep(warten);
    this.#letzter = Date.now();
    const res = await this.#abruf(`${BASIS}/v1/invoices/${encodeURIComponent(rechnungId)}/file`, {
      headers: { Authorization: `Bearer ${this.#schluessel}`, Accept: '*/*' },
      signal: AbortSignal.timeout(30_000),
    });
    const groesse = Number(res.headers.get('content-length') ?? '');
    await res.body?.cancel().catch(() => {});
    if (res.status === 401 || res.status === 403) throw new LexwareNichtBereit(`Lexware lehnt den Schlüssel ab (${res.status})`);
    return { vorhanden: res.ok, status: res.status, groesse: Number.isFinite(groesse) && groesse > 0 ? groesse : undefined };
  }

  /** Die Rechnungsdatei (PDF) einer festgeschriebenen Rechnung mit dem Dateinamen aus Lexware – Entwürfe haben keine (409) */
  async rechnungDatei(rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined> {
    for (let versuch = 0; ; versuch++) {
      const warten = this.#letzter + this.#abstandMs - Date.now();
      if (warten > 0) await sleep(warten);
      this.#letzter = Date.now();
      const res = await this.#abruf(`${BASIS}/v1/invoices/${encodeURIComponent(rechnungId)}/file`, {
        headers: { Authorization: `Bearer ${this.#schluessel}`, Accept: '*/*' },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const m = /filename\*=(?:UTF-8'')?"?([^";]+)|filename="?([^";]+)/i.exec(res.headers.get('content-disposition') ?? '');
        let name = m?.[1] ? decodeURIComponent(m[1]) : m?.[2] ?? `Rechnung-${rechnungId}.pdf`;
        if (!/\.pdf$/i.test(name)) name += '.pdf';
        return { daten: new Uint8Array(await res.arrayBuffer()), name: name.replace(/[\\/:*?"<>|]+/g, '_') };
      }
      await res.body?.cancel().catch(() => {});
      if (res.status === 401 || res.status === 403) throw new LexwareNichtBereit(`Lexware lehnt den Schlüssel ab (${res.status})`);
      if (res.status === 404 || res.status === 406 || res.status === 409) return undefined;
      if ((res.status === 429 || res.status >= 500) && versuch < 5) {
        await sleep(2 ** versuch * 1000);
        continue;
      }
      throw new LexwareFehler(res.status, `Lexware ${res.status} bei GET /v1/invoices/${rechnungId}/file`);
    }
  }

  /** Alle Kontakte mit der Rolle Kunde, Seite für Seite – nur lesend (W99) */
  async *kontakte(): AsyncGenerator<Kontakt> {
    for (let seite = 0; ; seite++) {
      const q = new URLSearchParams({ customer: 'true', page: String(seite), size: '250' });
      const antwort = await this.#get<{ content: Kontakt[]; last: boolean }>(`/v1/contacts?${q}`);
      yield* antwort.content;
      if (antwort.last || !antwort.content.length) return;
    }
  }
}
