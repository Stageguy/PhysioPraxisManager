import path from 'node:path';

export interface Env {
  tenantId: string;
  clientId: string;
  /** Das einzige Konto, mit dem sich die App anmelden darf */
  konto: string;
  dataDir: string;
}

export function loadEnv(): Env {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const konto = process.env.GRAPH_KONTO;
  if (!tenantId || !clientId || !konto) {
    throw new Error('GRAPH_TENANT_ID, GRAPH_CLIENT_ID oder GRAPH_KONTO fehlen – siehe .env.example');
  }
  return { tenantId, clientId, konto: konto.toLowerCase(), dataDir: path.resolve(process.env.DATA_DIR ?? '.data') };
}
