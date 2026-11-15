import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../../tests/fixtures/exampleScenario';
import { formatTime } from '../i18n';
import { scenarioUpdated, settingsUpdated } from '../state';
import { NOW, renderApp } from './__tests__/renderApp';
import { AREAS } from './shell/areas';

// S16: frame, navigation and theme (architecture 8.8, boards D1, M1).

const navs = () => screen.getAllByRole('navigation', { name: 'Bereiche' });

/** The sidebar navigation first, the bottom bar second. */
function nav(index: 0 | 1): HTMLElement {
  const found = navs()[index];
  if (!found) throw new Error(`no navigation ${index}`);
  return found;
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.useRealTimers();
});

describe('S16: navigation', () => {
  it('renders the five areas in the sidebar and in the bottom bar', async () => {
    await renderApp('/fahrprofil');
    expect(
      within(nav(0))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Fahrprofil',
      'Kandidaten',
      'Parameter',
      'Ergebnis',
      'Szenarien und Daten',
    ]);
    // The bottom bar uses the short name for the fifth area (M1).
    expect(within(nav(1)).getAllByRole('link').at(-1)?.textContent).toBe(
      'Szenarien',
    );
  });

  it.each(AREAS)(
    '#/%s is reachable and marked as the current area',
    async (area) => {
      await renderApp(`/${area}`);
      for (const nav of navs()) {
        const current = within(nav)
          .getAllByRole('link')
          .filter((link) => link.getAttribute('aria-current') === 'page');
        expect(current.map((link) => link.getAttribute('href'))).toEqual([
          `/${area}`,
        ]);
      }
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    },
  );

  it('a sub-route keeps its area current: #/kandidaten/:id', async () => {
    await renderApp('/kandidaten/abc');
    expect(
      within(nav(0))
        .getByRole('link', { name: 'Kandidaten' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Kandidaten' }),
    ).toBeTruthy();
  });

  it('"/" and unknown paths lead to the first area', async () => {
    const { router } = await renderApp('/');
    expect(router.state.location.pathname).toBe('/fahrprofil');
    await act(() => router.navigate('/gibt-es-nicht'));
    expect(router.state.location.pathname).toBe('/fahrprofil');
  });

  it('a click in the navigation changes the area', async () => {
    const { router } = await renderApp('/fahrprofil');
    await act(async () => {
      fireEvent.click(within(nav(0)).getByRole('link', { name: 'Ergebnis' }));
    });
    expect(router.state.location.pathname).toBe('/ergebnis');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ergebnis' }),
    ).toBeTruthy();
    // The new area is announced through the title and gets the focus.
    expect(document.title).toBe('Ergebnis · Wattwahl');
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('a sub-route of the same area keeps the focus where it is', async () => {
    const { router } = await renderApp('/kandidaten');
    const link = within(nav(0)).getByRole('link', { name: 'Kandidaten' });
    link.focus();
    await act(() => router.navigate('/kandidaten/abc'));
    expect(document.activeElement).toBe(link);
    expect(document.title).toBe('Kandidaten · Wattwahl');
  });
});

describe('S16: active scenario in the frame', () => {
  it('names the active scenario with a link to Szenarien und Daten', async () => {
    const scenario = { ...exampleScenario(), name: 'Familie' };
    await renderApp('/fahrprofil', { scenarios: [scenario] });
    const side = screen.getByRole('complementary');
    expect(within(side).getByText('Familie')).toBeTruthy();
    expect(
      within(side).getByRole('link', { name: 'Wechseln' }).getAttribute('href'),
    ).toBe('/szenarien');
  });

  it('the phone header names the scenario, the time of the last save and the area', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const scenario = { ...exampleScenario(), name: 'Familie' };
    const { store } = await renderApp('/parameter', { scenarios: [scenario] });
    const header = screen.getByRole('banner');
    expect(header.textContent).toContain('Szenario Familie');
    expect(header.textContent).not.toContain('Gespeichert');
    expect(header.textContent).toContain('Parameter');

    await act(async () => {
      store.dispatch(scenarioUpdated({ ...scenario, name: 'Familie 2' }));
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(header.textContent).toContain(
      `Szenario Familie 2 · Gespeichert ${formatTime(NOW)} Uhr`,
    );
  });

  it('the first start creates the template scenario and shows it', async () => {
    await renderApp('/fahrprofil');
    expect(
      within(screen.getByRole('complementary')).getByText('Standard'),
    ).toBeTruthy();
  });
});

describe('S16: traffic light colours of the device settings (8.8)', () => {
  it('a changed colour applies at once on the root element, without a reload', async () => {
    const { store } = await renderApp('/fahrprofil');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--ok-fg')).toBe('');

    act(() => {
      store.dispatch(
        settingsUpdated({
          trafficLightColors: {
            green: '#00aa00',
            yellow: '#ccaa00',
            red: '#cc0000',
          },
        }),
      );
    });
    expect(style.getPropertyValue('--ok-fg')).toBe('#00aa00');
    expect(style.getPropertyValue('--warn-fg')).toBe('#ccaa00');
    expect(style.getPropertyValue('--bad-fg')).toBe('#cc0000');
    expect(style.getPropertyValue('--ok-bg')).toBe(
      'color-mix(in srgb, #00aa00 18%, var(--surface-raised))',
    );

    act(() => {
      store.dispatch(settingsUpdated({ trafficLightColors: null }));
    });
    expect(style.getPropertyValue('--ok-fg')).toBe('');
    expect(style.getPropertyValue('--bad-bg')).toBe('');
  });

  it('stored colours apply on start', async () => {
    await renderApp('/fahrprofil', {
      settings: {
        trafficLightColors: {
          green: '#112233',
          yellow: '#445566',
          red: '#778899',
        },
      },
    });
    expect(document.documentElement.style.getPropertyValue('--warn-fg')).toBe(
      '#445566',
    );
  });
});

describe('S16: skip link', () => {
  it('moves the focus to the content without changing the route', async () => {
    const { router } = await renderApp('/parameter');
    fireEvent.click(screen.getByRole('link', { name: 'Zum Inhalt springen' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(router.state.location.pathname).toBe('/parameter');
  });
});
