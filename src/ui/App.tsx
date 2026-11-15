import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom';
import type { AppStore } from '../state';
import type { AppRouter } from './router';

/** The app: the store from src/state and the hash router of 8.8. */
export function App({ store, router }: { store: AppStore; router: AppRouter }) {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
