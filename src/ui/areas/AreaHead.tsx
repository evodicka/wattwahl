import type { ReactNode } from 'react';

/**
 * Title and intro of an area. From 900 px it heads the content; below, the
 * frame's header shows the title and this heading is for screen readers only.
 */
export function AreaHead({
  title,
  intro,
}: {
  title: string;
  intro?: ReactNode;
}) {
  return (
    <div className="page-head">
      <h1 className="h-display">{title}</h1>
      {intro !== undefined && <p className="t-sm muted">{intro}</p>}
    </div>
  );
}
