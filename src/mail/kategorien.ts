/**
 * Outlook-Kategorien des Rechnungs-Flows – die eine Stelle für Namen, Farben und Bedeutung.
 * Der Befehl `kategorien` legt sie an, die Hilfeseite erklärt sie, der Rechnungseingang setzt sie.
 *
 * Reihenfolge = Weg einer Rechnung: eingegangen → freigegeben → in Lexware → Zahlung angestoßen →
 * bezahlt (dann ins Exchange-Archiv). Die beiden „Prüfen“ heißen: hier entscheidet Lilli, das
 * System hat nichts abgelegt. An einer Mail steht immer nur die Kategorie der aktuellen Stufe.
 *
 * Zahlung (requirements N24): Lexware meldet sie am Beleg – voucherStatus `transferred`
 * (Überweisung über das Lexware-Online-Banking beauftragt) bzw. `sepadebit` (Lastschrift
 * autorisiert) heißt „angestoßen“, `paid` heißt „bezahlt“ (die Bank hat gebucht, paidDate gesetzt).
 */
import type { GraphClient } from '../graph.ts';
import { nurProduktion } from '../umgebung.ts';

export interface Kategorie {
  name: string;
  /** Outlook-Farbe: preset0 Rot, 1 Orange, 3 Gelb, 4 Grün, 5 Türkis, 7 Blau, 8 Lila, 19 Dunkelgrün … */
  farbe: `preset${number}`;
  farbname: string;
  /** Wer setzt sie, wann */
  wann: string;
  /** Was Lilli tun soll */
  tun: string;
  /** Ab wann es sie gibt */
  ab: 'jetzt' | 'mit Freigabe (Prompt 5)' | 'mit Lexware (Prompt 5)';
}

export const KATEGORIEN = {
  eingegangen: {
    name: 'Rechnung: eingegangen', farbe: 'preset3', farbname: 'Gelb',
    wann: 'Der Rechnungseingang hat das Rechnungs-PDF eines bekannten Lieferanten in „Eingangsrechnungen“ abgelegt und die Mail nach „Rechnungen/Verarbeitet“ verschoben.',
    tun: 'Nichts in Outlook. Die Rechnung wartet im Cockpit auf deine Freigabe.', ab: 'jetzt',
  },
  freigegeben: {
    name: 'Rechnung: freigegeben', farbe: 'preset4', farbname: 'Grün',
    wann: 'Du hast die Rechnung im Cockpit freigegeben.',
    tun: 'Nichts – sie geht als Nächstes an Lexware.', ab: 'mit Freigabe (Prompt 5)',
  },
  lexware: {
    name: 'Rechnung: in Lexware', farbe: 'preset7', farbname: 'Blau',
    wann: 'Der Beleg liegt in Lexware unter „Belege – zu prüfen“.',
    tun: 'In Lexware buchen bzw. der Steuerberatung überlassen – und dort die Zahlung anstoßen.', ab: 'mit Lexware (Prompt 5)',
  },
  angestossen: {
    name: 'Rechnung: Zahlung angestoßen', farbe: 'preset5', farbname: 'Türkis',
    wann: 'In Lexware ist die Zahlung beauftragt: Überweisung über das Lexware-Online-Banking oder Lastschrift autorisiert. Die Bank hat sie noch nicht gebucht.',
    tun: 'Nichts – sobald die Bank bucht, wird daraus „bezahlt“.', ab: 'mit Lexware (Prompt 5)',
  },
  bezahlt: {
    name: 'Rechnung: bezahlt', farbe: 'preset19', farbname: 'Dunkelgrün',
    wann: 'Die Rechnung ist bezahlt – laut Lexware (sobald der XL-Tarif da ist) oder weil du die Kategorie selbst gesetzt hast. Danach wandert die Mail ins Exchange-Archiv.',
    tun: 'Bis zum XL-Tarif: bei bezahlten Rechnungen diese Kategorie selbst in Outlook setzen – den Rest erledigt das System. Danach: nichts.', ab: 'jetzt',
  },
  abgelehnt: {
    name: 'Rechnung: abgelehnt', farbe: 'preset0', farbname: 'Rot',
    wann: 'Du hast die Rechnung im Rechnungs-Dashboard abgelehnt (mit Grund). Die Datei liegt in „Eingangsrechnungen/Abgelehnt“.',
    tun: 'Nichts – sie wird nicht gebucht. Rückfrage beim Lieferanten, falls nötig.', ab: 'jetzt',
  },
  privat: {
    name: 'Rechnung: privat', farbe: 'preset12', farbname: 'Grau',
    wann: 'Du hast im Rechnungs-Dashboard „privat“ angehakt: die Rechnung gehört nicht zur Praxis. Die Datei liegt in „<Jahr>/Privat“.',
    tun: 'Nichts – sie zählt nicht in der Praxisbuchhaltung. Haken wieder weg nimmt das zurück.', ab: 'jetzt',
  },
  test: {
    name: 'TEST', farbe: 'preset9', farbname: 'Cranberry',
    wann: 'Ein Entwurf aus der Testumgebung – adressiert an eine Testadresse, nie an echte Patienten.',
    tun: 'Nicht senden – gehört nicht zum Praxisbetrieb. Christian prüft damit neue Funktionen.', ab: 'jetzt',
  },
  unklar: {
    name: 'Prüfen – unklar', farbe: 'preset1', farbname: 'Orange',
    wann: 'Ein PDF sieht nach Rechnung aus, kommt aber von einem Absender, der nicht in der Lieferantenliste steht – oder es ist ein Scan ohne Text. Nichts wurde abgelegt.',
    tun: 'Anschauen: Ist es eine berufliche Rechnung? Dann den Absender in die Lieferantenliste aufnehmen lassen.', ab: 'jetzt',
  },
  patient: {
    name: 'Prüfen – Patient', farbe: 'preset8', farbname: 'Lila',
    wann: 'Die Mail sieht nach Patientenpost aus (Rezept, Verordnung, Befund, Arztbrief …). Das System hat nichts abgelegt und nichts gespeichert.',
    tun: 'Selbst bearbeiten. Patientenpost kommt nie in den Büro-Ordner.', ab: 'jetzt',
  },
} as const satisfies Record<string, Kategorie>;

/** Frühere Namen: werden entfernt, sobald keine Mail sie mehr trägt */
export const FRUEHERE_NAMEN = ['Rechnung: abgelegt'];

/** Kategorien des Rechnungswegs – an einer Mail steht immer nur die der aktuellen Stufe */
export const STUFEN: string[] = [
  KATEGORIEN.eingegangen, KATEGORIEN.freigegeben, KATEGORIEN.lexware, KATEGORIEN.angestossen, KATEGORIEN.bezahlt,
  KATEGORIEN.abgelehnt, KATEGORIEN.privat,
].map((k) => k.name);

/** Kategorien einer Mail auf eine neue Stufe setzen; fremde Kategorien (Lillis eigene) bleiben */
export function aufStufe(kategorien: string[], neu: string): string[] {
  return [...kategorien.filter((k) => !STUFEN.includes(k) && !FRUEHERE_NAMEN.includes(k)), neu];
}

interface MasterKategorie {
  id: string;
  displayName: string;
  color: string;
}

export async function kategorienAnlegen(
  graph: Pick<GraphClient, 'paginate' | 'post' | 'get' | 'delete'>,
  optionen: { ausfuehren: boolean },
): Promise<{ vorhanden: string[]; angelegt: string[]; fehlt: string[]; andereFarbe: string[]; entfernt: string[]; nochBenutzt: string[] }> {
  if (optionen.ausfuehren) nurProduktion('Das Anlegen von Outlook-Kategorien');
  const da = new Map<string, MasterKategorie>();
  for await (const k of graph.paginate<MasterKategorie>('/me/outlook/masterCategories')) da.set(k.displayName.toLowerCase(), k);
  const ergebnis = {
    vorhanden: [] as string[], angelegt: [] as string[], fehlt: [] as string[], andereFarbe: [] as string[],
    entfernt: [] as string[], nochBenutzt: [] as string[],
  };
  for (const k of Object.values(KATEGORIEN)) {
    const vorhanden = da.get(k.name.toLowerCase());
    if (vorhanden) {
      ergebnis.vorhanden.push(k.name);
      // Eine Farbe, die jemand bewusst geändert hat, bleibt – nur melden
      if (vorhanden.color !== k.farbe) ergebnis.andereFarbe.push(k.name);
      continue;
    }
    if (!optionen.ausfuehren) {
      ergebnis.fehlt.push(k.name);
      continue;
    }
    await graph.post('/me/outlook/masterCategories', { displayName: k.name, color: k.farbe });
    ergebnis.angelegt.push(k.name);
  }
  // Umbenennen kann Outlook nicht (der Name ist nach dem Anlegen fest): neu anlegen, alt entfernen –
  // aber nur, wenn keine Mail die alte Kategorie trägt
  for (const alt of FRUEHERE_NAMEN) {
    const vorhanden = da.get(alt.toLowerCase());
    if (!vorhanden) continue;
    const filter = encodeURIComponent(`categories/any(c:c eq '${alt.replace(/'/g, "''")}')`);
    const benutzt = await graph.get<{ value: unknown[] }>(`/me/messages?$filter=${filter}&$select=id&$top=1`);
    if (benutzt.value.length) {
      ergebnis.nochBenutzt.push(alt);
      continue;
    }
    if (optionen.ausfuehren) {
      await graph.delete(`/me/outlook/masterCategories/${vorhanden.id}`);
      ergebnis.entfernt.push(alt);
    } else {
      ergebnis.fehlt.push(`(entfernen) ${alt}`);
    }
  }
  return ergebnis;
}
