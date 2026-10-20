import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aufJahr, finanzjahrAnlegen } from '../src/ablage/finanzjahr.ts';
import { ordnerSicherstellen } from '../src/drive.ts';
import { zielOrdner } from '../src/einstellungen.ts';

/** Ein Laufwerk als Attrappe: Pfad → Ordner; „unsichtbar“ simuliert Ordner, die praxis@ nicht sieht */
function laufwerk(pfade: string[], unsichtbar: string[] = []) {
  const ordner = new Map<string, string>(pfade.map((p, i) => [p, `o${i}`]));
  const angelegt: string[] = [];
  const pfadVon = (id: string) => [...ordner.entries()].find(([, v]) => v === id)?.[0];
  return {
    angelegt,
    async get<T>(url: string): Promise<T> {
      const p = decodeURIComponent(/root:\/(.+):\?/.exec(url)![1]!);
      if (!ordner.has(p)) throw Object.assign(new Error('404'), { status: 404 });
      return { id: ordner.get(p), name: p, folder: { childCount: 0 } } as T;
    },
    async find<T>(url: string): Promise<T | undefined> {
      const p = decodeURIComponent(/root:\/(.+):\?/.exec(url)![1]!);
      if (!ordner.has(p) || unsichtbar.includes(p)) return undefined;
      return { id: ordner.get(p), name: p, folder: { childCount: 0 } } as T;
    },
    async *paginate<T>(url: string): AsyncGenerator<T> {
      const eltern = pfadVon(/items\/([^/]+)\/children/.exec(url)![1]!)!;
      for (const [p, id] of ordner) {
        if (p.startsWith(`${eltern}/`) && !p.slice(eltern.length + 1).includes('/')) yield { id, name: p.slice(eltern.length + 1), folder: { childCount: 0 } } as T;
      }
    },
    async post<T>(url: string, body: { name: string }): Promise<T> {
      const m = /items\/([^/]+)\/children/.exec(url);
      const eltern = m ? pfadVon(m[1]!) : '';
      const neu = eltern ? `${eltern}/${body.name}` : body.name;
      if (ordner.has(neu)) throw Object.assign(new Error('409 nameAlreadyExists'), { status: 409 });
      ordner.set(neu, `n${ordner.size}`);
      angelegt.push(neu);
      return { id: ordner.get(neu), name: body.name } as T;
    },
  };
}

const VORLAGE = [
  'P/01 Finanzen', 'P/01 Finanzen/2025', 'P/01 Finanzen/2025/Bank', 'P/01 Finanzen/2025/Bank/Sparkasse',
  'P/01 Finanzen/2025/Steuer 2025', 'P/01 Finanzen/2025/Rechnungen Business',
];

test('aufJahr ersetzt die Jahreszahl und ergänzt Eingangsrechnungen', () => {
  assert.deepEqual(aufJahr(['Bank', 'Steuer 2025', 'Akte 20250'], 2025, 2026), ['Bank', 'Steuer 2026', 'Akte 20250', 'Eingangsrechnungen']);
});

test('Finanzjahr: Probelauf legt nichts an, Ausführen genau die Vorlage + Eingangsrechnungen', async () => {
  const lw = laufwerk(VORLAGE);
  const probe = await finanzjahrAnlegen(lw, { laufwerk: 'd', finanzen: 'P/01 Finanzen' }, 2026, { ausfuehren: false });
  assert.deepEqual(lw.angelegt, []);
  assert.equal(probe.geplant.length, 6);
  await finanzjahrAnlegen(lw, { laufwerk: 'd', finanzen: 'P/01 Finanzen' }, 2026, { ausfuehren: true });
  assert.deepEqual(lw.angelegt.sort(), [
    'P/01 Finanzen/2026', 'P/01 Finanzen/2026/Bank', 'P/01 Finanzen/2026/Bank/Sparkasse',
    'P/01 Finanzen/2026/Eingangsrechnungen', 'P/01 Finanzen/2026/Rechnungen Business', 'P/01 Finanzen/2026/Steuer 2026',
  ]);
  const zweiter = await finanzjahrAnlegen(lw, { laufwerk: 'd', finanzen: 'P/01 Finanzen' }, 2026, { ausfuehren: true });
  assert.deepEqual(zweiter.angelegt, [], 'ein zweiter Lauf legt nichts mehr an');
});

test('Ordner anlegen ab dem tiefsten sichtbaren Ordner (geteiltes Laufwerk)', async () => {
  const lw = laufwerk(['Projekte', 'Projekte/Praxis', 'Projekte/Praxis/07 Technik'], ['Projekte']);
  await ordnerSicherstellen(lw, 'Projekte/Praxis/07 Technik/_TEST', '/drives/d');
  assert.deepEqual(lw.angelegt, ['Projekte/Praxis/07 Technik/_TEST']);
});

test('Zielordner mit und ohne Platzhalter', () => {
  assert.equal(zielOrdner('A/{JJJJ}/Eingangsrechnungen', '2026-10-20'), 'A/2026/Eingangsrechnungen');
  assert.equal(zielOrdner('A', '2026-10-20'), 'A/2026/10');
});
