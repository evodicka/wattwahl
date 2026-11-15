export type PersistenceResult = 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser to keep the data even under storage pressure (8.2). The
 * caller asks only on the first start. A refusal is a hint for the user,
 * never an error.
 */
export async function requestPersistence(
  storage: Partial<Pick<StorageManager, 'persist'>> | undefined = globalThis
    .navigator?.storage,
): Promise<PersistenceResult> {
  if (typeof storage?.persist !== 'function') return 'unsupported';
  try {
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
