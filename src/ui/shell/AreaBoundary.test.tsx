import { act, fireEvent, screen, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../__tests__/renderApp';
import { routes } from '../router';
import { AreaBoundary } from './AreaBoundary';

// S16: one error boundary per area (8.10, Z05).

let failing = true;
function Fragile() {
  if (failing) throw new Error('broken view');
  return <p>Wieder da</p>;
}

/** The app's routes with #/ergebnis replaced by a view that throws. */
const withFragileErgebnis = (): RouteObject[] => {
  const [rootRoute] = routes;
  if (!rootRoute) throw new Error('no root route');
  return [
    {
      path: rootRoute.path,
      element: rootRoute.element,
      errorElement: rootRoute.errorElement,
      children: rootRoute.children?.map((child) =>
        child.path === 'ergebnis'
          ? {
              path: 'ergebnis',
              handle: child.handle,
              element: (
                <AreaBoundary area="ergebnis">
                  <Fragile />
                </AreaBoundary>
              ),
            }
          : child,
      ),
    },
  ];
};

beforeEach(() => {
  failing = true;
  // React logs caught render errors; the test expects them.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('S16: error boundary per area', () => {
  it('a failing area shows Z05 and the frame stays usable', async () => {
    const { router } = await renderApp('/ergebnis', {
      routes: withFragileErgebnis(),
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'Die Ansicht „Ergebnis“ ist ausgefallen',
    );
    expect(alert.textContent).toContain('deine Daten sind gespeichert');

    const [side] = screen.getAllByRole('navigation', { name: 'Bereiche' });
    if (!side) throw new Error('no sidebar');
    await act(async () => {
      fireEvent.click(within(side).getByRole('link', { name: 'Parameter' }));
    });
    expect(router.state.location.pathname).toBe('/parameter');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Parameter' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Erneut versuchen" renders the area again', async () => {
    await renderApp('/ergebnis', { routes: withFragileErgebnis() });
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(screen.getByText('Wieder da')).toBeTruthy();
  });
});
