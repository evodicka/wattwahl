import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { Button, ConfirmDialog, EmptyState, Notice, TrafficLight } from '.';

// S16: base components of the design system (docs/design-inventory.md).

describe('TrafficLight: colour plus symbol and text (8.8)', () => {
  it.each([
    ['green', '✓'],
    ['yellow', '▲'],
    ['red', '✕'],
  ] as const)('%s carries the symbol %s next to its text', (level, symbol) => {
    const { container } = render(
      <TrafficLight level={level}>31 km</TrafficLight>,
    );
    expect(container.textContent).toBe(`${symbol}31 km`);
    // The symbol repeats the colour; screen readers read the text.
    expect(screen.getByText(symbol).getAttribute('aria-hidden')).toBe('true');
  });

  it('"none" has no symbol unless one is given', () => {
    const { container, rerender } = render(
      <TrafficLight level="none">Unvollständig</TrafficLight>,
    );
    expect(container.textContent).toBe('Unvollständig');
    rerender(
      <TrafficLight level="none" symbol="↻">
        wird aktualisiert
      </TrafficLight>,
    );
    expect(container.textContent).toBe('↻wird aktualisiert');
  });
});

describe('Notice', () => {
  it('announces an error at once and other tones politely', () => {
    const { rerender } = render(<Notice tone="error" title="Speicher voll" />);
    expect(screen.getByRole('alert').textContent).toContain('✕Speicher voll');
    rerender(<Notice tone="warn" title="Prüfen" />);
    expect(screen.getByRole('status').textContent).toContain('▲Prüfen');
  });

  it('shows body and actions', () => {
    render(
      <Notice tone="info" title="Titel" actions={<Button>Los</Button>}>
        Text
      </Notice>,
    );
    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Los' })).toBeTruthy();
  });
});

describe('Button', () => {
  it('is a plain button by default, so it never submits a form', () => {
    render(<Button>Speichern</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('can be disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Löschen
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('EmptyState (Z01)', () => {
  it('names the first steps', () => {
    render(
      <EmptyState title="Noch kein Kandidat" actions={<Button>Anlegen</Button>}>
        Lege den ersten Kandidaten an.
      </EmptyState>,
    );
    expect(
      screen.getByRole('heading', { name: 'Noch kein Kandidat' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anlegen' })).toBeTruthy();
  });
});

describe('ConfirmDialog (Z19)', () => {
  // jsdom has no modal dialog: open and close set the attribute only.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };

  const renderDialog = (open: boolean) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <ConfirmDialog
          open={open}
          title="Kandidat „Modell D“ löschen?"
          confirmLabel="Löschen"
          danger
          onConfirm={onConfirm}
          onCancel={onCancel}
        >
          Das lässt sich nicht rückgängig machen.
        </ConfirmDialog>
      </I18nextProvider>,
    );
    return { ...view, onConfirm, onCancel };
  };

  it('opens as a modal labelled by its title', () => {
    renderDialog(true);
    const dialog = screen.getByRole('dialog', {
      name: 'Kandidat „Modell D“ löschen?',
    });
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  it('confirms, cancels and treats Escape as cancel', () => {
    const { onConfirm, onCancel } = renderDialog(true);
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('closes when open turns false', () => {
    const { rerender } = renderDialog(true);
    rerender(
      <I18nextProvider i18n={i18n}>
        <ConfirmDialog
          open={false}
          title="t"
          confirmLabel="Löschen"
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </I18nextProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
