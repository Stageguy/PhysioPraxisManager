/**
 * Aktionen aus Formularen (A32): statt eines großen `switch` in dienst.ts gibt es je Fachgebiet eine Tabelle
 * `Name → Funktion`. Jede Aktion bekommt denselben Kontext – Datenbank, Tresor, Anbindungen, das Formular und
 * kleine Helfer – und gibt Ziel und Meldung zurück. Fehler für die Oberfläche sind KarteiFehler.
 */
import type { Db } from '../../db/index.ts';
import type { GraphClient } from '../../graph.ts';
import type { BuchungsClient } from '../../buchung/client.ts';
import type { LexwareKunde, LexwareKunden } from '../../lexware/kunden.ts';
import type { LexwareRechnungen } from '../../lexware/rechnungen.ts';
import type { Tresor } from '../../tresor.ts';
import type { WhatsAppCloud } from '../../whatsapp/schnittstelle.ts';

/** Was der Kartei-Dienst von außen bekommt (Postfach, WhatsApp, Lexware, Abruf) */
export interface DienstQuellen {
  db: Db;
  tresor: Tresor;
  graph?: Pick<GraphClient, 'get' | 'post' | 'patch' | 'delete' | 'postOhneAntwort' | 'paginate'>;
  whatsapp?: WhatsAppCloud;
  buchung?: { url: string; oeffentlich: boolean };
  /** Verbindung zum Buchungsdienst – schiebt Einladungen zum Schnelltermin (W117b) */
  buchungClient?: BuchungsClient;
  /** Kunden aus Lexware (W99) */
  lexware?: LexwareKunden;
  /** Rechnungen aus Lexware (W103) */
  lexwareRechnungen?: LexwareRechnungen;
  /** Abruf für Dienste im Netz (feiertage-api.de) – Tests geben eine Attrappe */
  abruf?: typeof fetch;
}

export interface Ergebnis { ziel: string; meldung: string }

export interface AktionKontext {
  db: Db;
  t: Tresor;
  q: DienstQuellen;
  f: URLSearchParams;
  wer: string;
  /** Patient aus dem Formular (leer bei Aktionen ohne Patient) */
  id: string;
  /** Feld lesen – undefined, wenn es fehlt */
  g(name: string): string | undefined;
  /** Pfad der Patientenseite */
  seite: string;
  nach(ziel: string, meldung: string): Ergebnis;
  /** Termin in den Kalender spiegeln; der Text hängt an die Meldung an */
  spiegeln(terminId: string): Promise<string>;
  /** Lexware-Kunde zum Patienten – undefined ohne Anbindung oder bei Störung */
  lexwareKundeZu(nummer: string | null): Promise<LexwareKunde | undefined>;
}

export type Aktion = (k: AktionKontext) => Promise<Ergebnis>;
export type Aktionen = Record<string, Aktion>;
