import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  // jsdom has no modal dialog: the spies stand in for showModal and close,
  // and the test checks that the component calls the modal variant.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
      // As in browsers: the first focusable element gets the focus.
      this.querySelector<HTMLElement>('button')?.focus();
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = false;
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  const dialog = (open: boolean, danger = true) => (
    <I18nextProvider i18n={i18n}>
      <ConfirmDialog
        open={open}
        title="Kandidat „Modell D“ löschen?"
        confirmLabel="Löschen"
        danger={danger}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Das lässt sich nicht rückgängig machen.
      </ConfirmDialog>
    </I18nextProvider>
  );
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('opens with showModal, labelled by its title', () => {
    render(dialog(true));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('dialog', { name: 'Kandidat „Modell D“ löschen?' }),
    ).toBeTruthy();
  });

  it('a danger dialog opens with the focus on "Abbrechen", not on the destructive button', () => {
    render(dialog(true));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Abbrechen' }),
    );
  });

  it('confirms, cancels and treats Escape as cancel', () => {
    render(dialog(true));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('closes with close when open turns false', () => {
    const { rerender } = render(dialog(true));
    rerender(dialog(false));
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
