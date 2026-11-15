import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './i18n';
import { attachLifecycle, createAppStore, startApp } from './state';
import { openRepository } from './storage';
import { App, StartFailed, createAppRouter } from './ui';
import './ui/theme.css';
import { spawnCoreWorker } from './worker';

const element = document.getElementById('root');
if (!element) throw new Error('Missing #root element');
const root = createRoot(element);

const render = (node: ReactNode) =>
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
    </StrictMode>,
  );

// App start of runtime view 6.2. The frame renders at once; the scenarios
// arrive through the store. Storage that cannot be read at all (a private
// window may block IndexedDB) leaves a notice instead of a blank page; any
// other failure gets the general text, since storage is not to blame.
class StorageFailure extends Error {}

const reading = <T,>(work: Promise<T>): Promise<T> =>
  work.catch((error: unknown) => {
    throw new StorageFailure('The stored data cannot be read.', {
      cause: error,
    });
  });

async function start() {
  const repository = await reading(openRepository());
  const store = createAppStore({ repository, spawnWorker: spawnCoreWorker });
  attachLifecycle(store.dispatch);
  render(<App store={store} router={createAppRouter()} />);
  // startApp rejects only when the database cannot be read (6.2).
  await reading(
    store.dispatch(
      startApp({ templateName: i18n.t('templateName', { ns: 'szenarien' }) }),
    ),
  );
}

start().catch((error: unknown) => {
  console.error(error);
  render(
    <StartFailed
      cause={error instanceof StorageFailure ? 'storage' : 'other'}
    />,
  );
});
