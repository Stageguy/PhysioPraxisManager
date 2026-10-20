import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anhaengeAblegen, entscheide, sichererName, zielName, type Anhang } from '../src/mail/anhaenge.ts';
import { graphAttrappe } from './attrappe.ts';

const einst = { seit: '2026-10-01', ziel: 'Mailanhänge', kategorie: 'In OneDrive abgelegt' };
const datei = (name: string, extra: Partial<Anhang> = {}): Anhang => ({
  '@odata.type': '#microsoft.graph.fileAttachment',
  id: `a-${name}`,
  name,
  size: 200_000,
  isInline: false,
  ...extra,
});

const postfach = () =>
  graphAttrappe({
    seiten: {
      '/me/mailFolders/inbox/messages': [
        { id: 'm1', subject: 'Befund', receivedDateTime: '2026-10-19T22:30:00Z', categories: [] },
        { id: 'm2', subject: 'schon erledigt', receivedDateTime: '2026-10-18T08:00:00Z', categories: ['In OneDrive abgelegt'] },
      ],
      '/me/messages/m1/attachments': [
        datei('Befund.pdf'),
        datei('logo.png', { isInline: true, contentType: 'image/png', size: 5_000 }),
      ],
    },
  });

test('Probelauf schreibt nichts, legt keinen Ordner an und markiert nichts', async () => {
  const g = postfach();
  const b = await anhaengeAblegen(g, einst, { ausfuehren: false });
  assert.deepEqual(g.schreibende(), []);
  assert.equal(b.mails, 1, 'die schon markierte Mail zählt nicht');
  assert.equal(b.geplant, 1);
  assert.equal(b.uebersprungen, 1);
  // 22:30 UTC am 19.10. ist in Deutschland schon der 20.10.
  assert.equal(b.einzeln.find((e) => e.status === 'geplant')?.detail, 'Mailanhänge/2026-10/2026-10-20 Befund.pdf');
});

test('Filter beginnt am Stichtag um Mitternacht deutscher Zeit', async () => {
  const g = postfach();
  await anhaengeAblegen(g, einst, { ausfuehren: false });
  assert.match(decodeURIComponent(g.aufrufe[0]!.pfad), /receivedDateTime ge 2026-09-30T22:00:00Z and hasAttachments eq true/);
});

test('Ausführen legt Ordner an, lädt hoch und setzt die Kategorie', async () => {
  const g = postfach();
  const b = await anhaengeAblegen(g, einst, { ausfuehren: true });
  assert.equal(b.abgelegt, 1);
  assert.equal(b.markiert, 1);
  const s = g.schreibende();
  assert.deepEqual(
    s.map((a) => `${a.methode} ${a.pfad.split('?')[0]}`),
    [
      'POST /me/drive/root/children',
      'POST /me/drive/items/neu-1/children',
      'PUT /me/drive/items/neu-2:/2026-10-20%20Befund.pdf:/content',
      'PATCH /me/messages/m1',
    ],
  );
  assert.deepEqual(s.at(-1)!.body, { categories: ['In OneDrive abgelegt'] });
});

test('Nach einem Fehler beim Hochladen bleibt die Mail unmarkiert', async () => {
  const g = graphAttrappe({
    seiten: {
      '/me/mailFolders/inbox/messages': [{ id: 'm1', receivedDateTime: '2026-10-20T08:00:00Z', categories: [] }],
      '/me/messages/m1/attachments': [datei('a.pdf')],
    },
    get: { '/me/drive/root:/': { id: 'ordner', name: 'x', folder: { childCount: 0 } } },
    fehlerBei: (p) => p.includes('/content'),
  });
  const b = await anhaengeAblegen(g, einst, { ausfuehren: true });
  assert.equal(b.fehler, 1);
  assert.equal(b.markiert, 0);
  assert.ok(!g.aufrufe.some((a) => a.methode === 'PATCH'));
});

test('hoechstens begrenzt die Zahl der Mails', async () => {
  const g = graphAttrappe({
    seiten: {
      '/me/mailFolders/inbox/messages': [1, 2, 3].map((i) => ({ id: `m${i}`, receivedDateTime: '2026-10-20T08:00:00Z', categories: [] })),
    },
  });
  const b = await anhaengeAblegen(g, einst, { ausfuehren: false, hoechstens: 2 });
  assert.equal(b.mails, 2);
});

test('Entscheidung über Anhänge', () => {
  assert.equal(entscheide(datei('Rezept.pdf')).nehmen, true);
  assert.equal(entscheide(datei('Scan.pdf', { isInline: true })).nehmen, true, 'eingebettete PDFs bleiben');
  assert.equal(entscheide(datei('winmail.dat')).nehmen, false);
  assert.equal(entscheide(datei('einladung.ics')).nehmen, false);
  assert.equal(entscheide(datei('foto.jpg', { size: 10_000 })).nehmen, false);
  assert.equal(entscheide(datei('foto.jpg', { size: 900_000 })).nehmen, true);
  assert.equal(entscheide(datei('Weitergeleitet', { '@odata.type': '#microsoft.graph.itemAttachment' })).nehmen, false);
});

test('Dateinamen', () => {
  assert.equal(sichererName('a:b/c?.pdf'), 'a_b_c_.pdf');
  assert.equal(sichererName(' . '), 'Anhang');
  assert.equal(zielName('2026-10-20', 'Befund.pdf'), '2026-10-20 Befund.pdf');
  assert.equal(zielName('2026-10-20', '2026-09-01 Rechnung.pdf'), '2026-09-01 Rechnung.pdf');
});
