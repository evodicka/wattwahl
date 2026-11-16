import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../i18n';
import { AppVersion } from './AppVersion';

// S25: the version of the release candidate is shown, with the build when the
// page carries one.

const setBuild = (content: string | null) => {
  document.head.querySelector('meta[name="build-id"]')?.remove();
  if (content === null) return;
  const meta = document.createElement('meta');
  meta.name = 'build-id';
  meta.content = content;
  document.head.append(meta);
};

afterEach(() => setBuild(null));

describe('S25: app version', () => {
  it('shows the version of package.json', () => {
    render(<AppVersion />);
    expect(screen.getByTestId('app-version').textContent).toBe(
      `Version ${__APP_VERSION__}`,
    );
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+(-rc\.\d+)?$/);
  });

  it('adds the short build id of a CI build', () => {
    setBuild('3414306aabbccddeeff00112233445566778899');
    render(<AppVersion />);
    expect(screen.getByTestId('app-version').textContent).toBe(
      `Version ${__APP_VERSION__} (Build 3414306)`,
    );
  });

  it('leaves out the id of a local build', () => {
    setBuild('local');
    render(<AppVersion />);
    expect(screen.getByTestId('app-version').textContent).toBe(
      `Version ${__APP_VERSION__}`,
    );
  });
});
