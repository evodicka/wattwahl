// Symbols of the assignment plan (board D6): the EV, the petrol car, the two
// workplaces and the arrow. They are drawn in `currentColor`, so the caller
// colours them, and hidden from assistive technology: the text alternative of
// every line says what they show.

const PATHS = {
  bolt: (
    <path
      d="M13 2L5 14h6l-1 8 8-12h-6z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  ),
  pump: (
    <path
      d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M3 21h13M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V9l-3-3M7 8h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  office: (
    <path
      d="M5 21V4h9v17M14 9h5v12M3 21h18M8 8h2M8 12h2M8 16h2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  plant: (
    <path
      d="M3 21V11l6 4v-4l6 4V5h4v16z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  arrow: (
    <path
      d="M4 12h15M14 6l6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
} as const;

export type PlanIconName = keyof typeof PATHS;

export function PlanIcon({
  name,
  className,
}: {
  name: PlanIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The icon of a workplace: the office for A, the plant for B. */
export const wayIcon = (way: 'a' | 'b'): PlanIconName =>
  way === 'a' ? 'office' : 'plant';

type Glyph = { name: PlanIconName; className?: string };

const SIZE = 12;
const GAP = 1;

/**
 * One line of the plan as a single image: the icons side by side in one SVG
 * with the sentence as its text alternative. One SVG per line (not per icon)
 * keeps the page light: a plan has hundreds of lines.
 */
export function PlanLineGlyph({
  icons,
  label,
  className,
}: {
  icons: Glyph[];
  label: string;
  className?: string;
}) {
  const width = icons.length * SIZE + (icons.length - 1) * GAP;
  return (
    <svg
      className={className}
      role="img"
      aria-label={label}
      width={width}
      height={SIZE}
      viewBox={`0 0 ${width} ${SIZE}`}
      focusable="false"
    >
      {icons.map((icon, index) => (
        <g
          // Icons repeat within a line (office, plant), so the position is the key.
          key={index}
          className={icon.className}
          transform={`translate(${index * (SIZE + GAP)} 0) scale(${SIZE / 24})`}
        >
          {PATHS[icon.name]}
        </g>
      ))}
    </svg>
  );
}
