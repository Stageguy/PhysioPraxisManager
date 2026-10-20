/**
 * Lexware Office Public API (https://api.lexware.io) – nur was der Zahlungsabgleich braucht.
 * Geprüft gegen developers.lexware.io am 20.10.2026 (requirements N24):
 * - höchstens 2 Anfragen je Sekunde, sonst 429 (ohne Retry-After) → eigener Abstand + Rückzug
 * - Belegliste: GET /v1/voucherlist?voucherType=…&voucherStatus=a,b,c&page=&size= (max. 250)
 * - Zahlungen:  GET /v1/payments/{voucherId} → openAmount, paymentStatus, voucherStatus, paidDate
 * - Profil:     GET /v1/profile – prüft Schlüssel und Tarif, bevor irgendetwas läuft
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
  updatedDate?: string;
  dueDate?: string;
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

  /** Schlüssel und Tarif prüfen – bricht mit klarer Meldung ab, statt still weiterzulaufen */
  profil(): Promise<{ organizationId: string; companyName?: string }> {
    return this.#get('/v1/profile');
  }

  /** Alle Belege eines Typs mit diesen Status, Seite für Seite */
  async *belege(optionen: {
    typ: string;
    status: Belegstatus[];
    geaendertAb?: string;
    belegnummer?: string;
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
      const antwort = await this.#get<{ content: Beleg[]; last: boolean }>(`/v1/voucherlist?${q}`);
      yield* antwort.content;
      if (antwort.last || !antwort.content.length) return;
    }
  }

  zahlung(belegId: string): Promise<Zahlung> {
    return this.#get(`/v1/payments/${encodeURIComponent(belegId)}`);
  }
}
