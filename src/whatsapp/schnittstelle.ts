/**
 * WhatsApp (W90, Prompt 7). Zwei Wege, beide ohne Gesundheitsdaten (Leitplanke 9):
 *
 * 1. **Click-to-Chat** (`wa.me`): ein Link mit vorbereitetem Text öffnet WhatsApp auf Lillis Handy oder
 *    Rechner; sie liest, ändert, schickt selbst. Nichts geht an Meta, was nicht ohnehin durch das Senden
 *    dorthin geht. Braucht kein Konto, keine Zustimmung von Meta – funktioniert sofort.
 * 2. **Cloud API** (WhatsApp Business Platform): die Praxis-Assistenz sendet Textnachrichten selbst und
 *    empfängt Antworten über einen Webhook. Braucht ein WhatsApp-Business-Konto, eine freigegebene
 *    Nummer, Zugangsdaten (WHATSAPP_TOKEN, WHATSAPP_TELEFON_ID, WHATSAPP_APP_SECRET,
 *    WHATSAPP_VERIFY_TOKEN) – und die Einwilligung des Patienten (E8). Ohne Zugangsdaten bleibt
 *    der Weg aus; der Code ist vorbereitet und geprüft.
 *
 * Schranke 8 (umgebung.ts): die Testumgebung sendet nur an TEST_TELEFONE.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { telefonNormieren } from '../telefon.ts';
import { pruefeTelefonEmpfaenger } from '../umgebung.ts';

/** Click-to-Chat: `https://wa.me/4915…?text=…` – Nummer ohne „+“, Text URL-kodiert */
export const waLink = (normiert: string, text?: string): string =>
  `https://wa.me/${telefonNormieren(normiert).replace(/^\+/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export interface WhatsAppEinstellungen {
  token: string;
  telefonId: string;
  appSecret?: string;
  verifyToken?: string;
  /** Graph-API-Fassung von Meta */
  version?: string;
}

/** Zugangsdaten aus der Umgebung; undefined = Cloud API nicht eingerichtet */
export function whatsappAusUmgebung(env: NodeJS.ProcessEnv = process.env): WhatsAppEinstellungen | undefined {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_TELEFON_ID) return undefined;
  return { token: env.WHATSAPP_TOKEN, telefonId: env.WHATSAPP_TELEFON_ID, appSecret: env.WHATSAPP_APP_SECRET, verifyToken: env.WHATSAPP_VERIFY_TOKEN, version: env.WHATSAPP_API_VERSION };
}

export class WhatsAppFehler extends Error {}

/** Senden über die Cloud API – nur Text, nie Medien, nie Gesundheitsdaten */
export class WhatsAppCloud {
  readonly #e: WhatsAppEinstellungen;
  readonly #holen: typeof fetch;

  constructor(e: WhatsAppEinstellungen, holen: typeof fetch = fetch) {
    this.#e = e;
    this.#holen = holen;
  }

  async textSenden(an: string, text: string): Promise<{ id: string }> {
    const nummer = telefonNormieren(an);
    pruefeTelefonEmpfaenger([nummer]);
    if (!text.trim()) throw new WhatsAppFehler('Leere Nachricht');
    const antwort = await this.#holen(`https://graph.facebook.com/${this.#e.version ?? 'v21.0'}/${this.#e.telefonId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.#e.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: nummer.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: text } }),
    });
    if (!antwort.ok) throw new WhatsAppFehler(`WhatsApp ${antwort.status}: ${(await antwort.text()).replace(/\s+/g, ' ').slice(0, 300)}`);
    const a = (await antwort.json()) as { messages?: { id: string }[] };
    return { id: a.messages?.[0]?.id ?? '' };
  }
}

/** Webhook-Einrichtung: Meta ruft GET mit hub.mode, hub.verify_token, hub.challenge – die Antwort ist der Challenge */
export function webhookBestaetigung(verifyToken: string, q: URLSearchParams): string | undefined {
  if (q.get('hub.mode') !== 'subscribe' || !verifyToken || q.get('hub.verify_token') !== verifyToken) return undefined;
  return q.get('hub.challenge') ?? undefined;
}

/** X-Hub-Signature-256: „sha256=<hex>“ über den rohen Body mit dem App-Secret */
export function signaturGueltig(appSecret: string, rohBody: string, kopf: string | undefined): boolean {
  if (!appSecret || !kopf?.startsWith('sha256=')) return false;
  const erwartet = createHmac('sha256', appSecret).update(rohBody, 'utf8').digest();
  const erhalten = Buffer.from(kopf.slice(7), 'hex');
  return erhalten.length === erwartet.length && timingSafeEqual(erhalten, erwartet);
}

export interface EingehendeNachricht {
  id: string;
  /** Absender in E.164 („+49151…“) */
  von: string;
  /** Zeitpunkt als ISO */
  zeit: string;
  typ: string;
  /** Nur bei Textnachrichten; Medien werden nicht übernommen */
  text: string | null;
}

interface MetaNachricht { from: string; id: string; timestamp: string; type: string; text?: { body: string } }

/** Nachrichten aus dem Webhook-Körper von Meta – Statusmeldungen (gesendet/gelesen) werden übergangen */
export function eingehendeNachrichten(body: unknown): EingehendeNachricht[] {
  const b = body as { object?: string; entry?: { changes?: { value?: { messages?: MetaNachricht[] } }[] }[] };
  if (b?.object !== 'whatsapp_business_account') return [];
  const liste: EingehendeNachricht[] = [];
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const m of c.value?.messages ?? []) {
        if (!m?.from || !m.id) continue;
        liste.push({ id: m.id, von: telefonNormieren(`+${m.from}`), zeit: new Date(Number(m.timestamp) * 1000).toISOString(), typ: m.type ?? 'unbekannt', text: m.type === 'text' ? (m.text?.body ?? '') : null });
      }
    }
  }
  return liste;
}
