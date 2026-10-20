/**
 * Ein Postfach mit OneDrive als Attrappe: Mails, Anhänge, Ordner, Delta, Uploads – im Speicher.
 * Merkt sich Kategorien und Verschiebungen, damit ein zweiter Lauf sieht, was der erste tat.
 */
import { GraphError } from '../src/graph.ts';

export interface TestMail {
  id: string;
  von: string;
  betreff: string;
  eingang: string;
  ordner?: 'inbox' | 'rechnungen';
  anhaenge: { id: string; name: string; contentType: string; inhalt?: string; inline?: boolean; typ?: string; size?: number }[];
  categories?: string[];
}

/** Ein „PDF“ für die Attrappe: echter Kopf, danach der Text, den textAusAttrappe zurückgibt */
export const pdfBytes = (text: string) => new TextEncoder().encode(`%PDF-1.4\n${text}`);
export const textAusAttrappe = async (b: Uint8Array) => new TextDecoder().decode(b).replace(/^%PDF-1\.4\n/, '');

export function postfach(mails: TestMail[], optionen: { rechnungsordner?: boolean; uploadFehler?: boolean } = {}) {
  const schreibend: string[] = [];
  const hochgeladen: { pfad: string; name: string }[] = [];
  const ordnerDrive = new Map<string, string>(); // Pfad → ID
  const ordnerMail = new Map<string, { id: string; name: string; eltern: string }>();
  if (optionen.rechnungsordner) ordnerMail.set('rechnungen', { id: 'rechnungen', name: 'Rechnungen', eltern: 'inbox' });
  let deltaAbrufe = 0;
  let zaehler = 0;

  const nachricht = (m: TestMail) => ({
    id: m.id,
    subject: m.betreff,
    receivedDateTime: m.eingang,
    categories: m.categories ?? [],
    from: { emailAddress: { address: m.von } },
    hasAttachments: m.anhaenge.length > 0,
    internetMessageId: `<${m.id}@test>`,
  });
  const mailVon = (pfad: string) => mails.find((m) => pfad.includes(`/me/messages/${m.id}/`) || pfad.endsWith(`/me/messages/${m.id}`));

  return {
    schreibend,
    hochgeladen,
    get deltaAbrufe() {
      return deltaAbrufe;
    },
    async get<T>(pfad: string): Promise<T> {
      if (pfad.startsWith('/me/mailFolders/inbox?')) return { id: 'inbox', displayName: 'Posteingang' } as T;
      if (pfad.includes('/messages/delta') || pfad.startsWith('https://delta/')) {
        deltaAbrufe++;
        const neu = pfad.startsWith('https://delta/');
        const value = mails.filter((m) => m.ordner === 'rechnungen' && (!neu || !m.categories?.length)).map(nachricht);
        return { value, '@odata.deltaLink': `https://delta/${deltaAbrufe}` } as T;
      }
      throw new GraphError(404, `unbekannt: ${pfad}`, '{}');
    },
    async find<T>(pfad: string): Promise<T | undefined> {
      const m = /\/me\/drive\/root:\/(.+):\?/.exec(pfad);
      const id = m && ordnerDrive.get(decodeURIComponent(m[1]!));
      return id ? ({ id, name: 'x', folder: { childCount: 0 } } as T) : undefined;
    },
    async *paginate<T>(pfad: string): AsyncGenerator<T> {
      const kinder = /\/me\/mailFolders\/([^/]+)\/childFolders/.exec(pfad);
      if (kinder) {
        for (const o of ordnerMail.values()) if (o.eltern === kinder[1]) yield { id: o.id, displayName: o.name } as T;
        return;
      }
      if (pfad.startsWith('/me/mailFolders/inbox/messages')) {
        for (const m of mails) if ((m.ordner ?? 'inbox') === 'inbox') yield nachricht(m) as T;
        return;
      }
      const anhaenge = /\/me\/messages\/([^/]+)\/attachments/.exec(pfad);
      if (anhaenge) {
        const mail = mails.find((m) => m.id === anhaenge[1])!;
        for (const a of mail.anhaenge) {
          yield {
            '@odata.type': a.typ ?? '#microsoft.graph.fileAttachment',
            id: a.id, name: a.name, contentType: a.contentType,
            size: a.size ?? 1000, isInline: a.inline ?? false,
          } as T;
        }
        return;
      }
      throw new Error(`unbekannt: ${pfad}`);
    },
    async getBytes(pfad: string): Promise<Uint8Array> {
      const mail = mailVon(pfad)!;
      const a = mail.anhaenge.find((x) => pfad.includes(`/attachments/${x.id}/`))!;
      return a.contentType === 'application/pdf' ? pdfBytes(a.inhalt ?? '') : new Uint8Array([1, 2, 3]);
    },
    async putBytes<T>(pfad: string): Promise<T> {
      schreibend.push(`PUT ${pfad.split('?')[0]}`);
      if (optionen.uploadFehler) throw new GraphError(507, 'voll', '{}');
      const m = /\/me\/drive\/items\/([^:]+):\/([^:]+):/.exec(pfad)!;
      const name = decodeURIComponent(m[2]!);
      const ordner = [...ordnerDrive.entries()].find(([, id]) => id === m[1])?.[0] ?? '?';
      hochgeladen.push({ pfad: ordner, name });
      return { id: `datei-${++zaehler}`, name } as T;
    },
    async post<T>(pfad: string, body: Record<string, unknown>): Promise<T> {
      schreibend.push(`POST ${pfad}`);
      const move = /\/me\/messages\/([^/]+)\/move$/.exec(pfad);
      if (move) {
        const mail = mails.find((m) => m.id === move[1])!;
        mail.ordner = undefined;
        (mail as { verschobenNach?: string }).verschobenNach = String(body.destinationId);
        return nachricht(mail) as T;
      }
      const mailKind = /\/me\/mailFolders\/([^/]+)\/childFolders$/.exec(pfad);
      if (mailKind) {
        const id = `mo-${++zaehler}`;
        ordnerMail.set(id, { id, name: String(body.displayName), eltern: mailKind[1]! });
        return { id, displayName: body.displayName } as T;
      }
      const driveKind = /\/me\/drive\/(?:root|items\/([^/]+))\/children$/.exec(pfad);
      if (driveKind) {
        const eltern = driveKind[1] ? [...ordnerDrive.entries()].find(([, id]) => id === driveKind[1])![0] : '';
        const id = `do-${++zaehler}`;
        ordnerDrive.set(eltern ? `${eltern}/${body.name}` : String(body.name), id);
        return { id, name: body.name } as T;
      }
      throw new Error(`unbekannt: POST ${pfad}`);
    },
    async patch<T>(pfad: string, body: { categories?: string[] }): Promise<T> {
      schreibend.push(`PATCH ${pfad}`);
      const mail = mailVon(pfad)!;
      if (body.categories) mail.categories = body.categories;
      return {} as T;
    },
  };
}
