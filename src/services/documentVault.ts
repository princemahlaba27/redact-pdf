import * as FileSystem from 'expo-file-system/legacy';

export type VaultDocument = {
  id: string;
  fileName: string;
  title: string;
  uri: string;
  createdAt: string; // ISO
  sizeBytes: number;
};

const VAULT_DIR = `${FileSystem.documentDirectory}vault/`;
const INDEX_PATH = `${VAULT_DIR}index.json`;

async function ensureVaultDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VAULT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
  }
}

async function readIndex(): Promise<VaultDocument[]> {
  await ensureVaultDir();
  const info = await FileSystem.getInfoAsync(INDEX_PATH);
  if (!info.exists) return [];
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
    const parsed = JSON.parse(raw) as VaultDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(docs: VaultDocument[]): Promise<void> {
  await ensureVaultDir();
  await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(docs));
}

function safeFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[^\w\s.-]+/g, '').trim();
  const stamp = Date.now();
  return `${(base || 'Document').slice(0, 48)}_${stamp}.pdf`;
}

/**
 * Persist a sanitized PDF into the on-device document vault.
 * Returns the vault entry (or null on failure).
 */
export async function saveToAppVault(
  sanitizedPdfUri: string,
  title: string,
): Promise<VaultDocument | null> {
  try {
    await ensureVaultDir();
    const fileName = safeFileName(title);
    const destination = `${VAULT_DIR}${fileName}`;
    await FileSystem.copyAsync({ from: sanitizedPdfUri, to: destination });

    const info = await FileSystem.getInfoAsync(destination);
    const entry: VaultDocument = {
      id: fileName,
      fileName,
      title: title.replace(/\.pdf$/i, '') || 'Document',
      uri: destination,
      createdAt: new Date().toISOString(),
      sizeBytes: info.exists && 'size' in info ? Number(info.size) || 0 : 0,
    };

    const index = await readIndex();
    await writeIndex([entry, ...index.filter((d) => d.id !== entry.id)]);
    return entry;
  } catch (error) {
    console.error('[vault] save failed:', error);
    return null;
  }
}

/** List vault documents newest-first. Drops missing files. */
export async function listVaultDocuments(): Promise<VaultDocument[]> {
  const index = await readIndex();
  const kept: VaultDocument[] = [];
  for (const doc of index) {
    const info = await FileSystem.getInfoAsync(doc.uri);
    if (info.exists) kept.push(doc);
  }
  if (kept.length !== index.length) {
    await writeIndex(kept);
  }
  return kept;
}

export async function deleteVaultDocument(id: string): Promise<void> {
  const index = await readIndex();
  const doc = index.find((d) => d.id === id);
  if (doc) {
    try {
      await FileSystem.deleteAsync(doc.uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
  await writeIndex(index.filter((d) => d.id !== id));
}
