import type { Area } from './areas';

// Line icons of the five areas, 24 px with 1.8 px stroke, from the design
// system's navigation (boards D1 and M1). Always next to the area's name.

const PATHS: Record<Area, React.JSX.Element> = {
  fahrprofil: (
    <path
      d="M5 17h14M7 17l1-6h8l1 6M9 11l1-4h4l1 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  ),
  kandidaten: (
    <>
      <rect
        x="4"
        y="7"
        width="16"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M20 10v4" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  parameter: (
    <>
      <path d="M5 8h14M5 16h14" stroke="currentColor" strokeWidth="1.8" />
      <circle
        cx="9"
        cy="8"
        r="2.2"
        fill="var(--surface-sunken)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="15"
        cy="16"
        r="2.2"
        fill="var(--surface-sunken)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </>
  ),
  ergebnis: (
    <path
      d="M5 19V9M12 19V5M19 19v-7"
      stroke="currentColor"
      strokeWidth="2.4"
    />
  ),
  szenarien: (
    <path
      d="M7 4h8l3 3v13H7z M15 4v3h3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  ),
};

export function NavIcon({
  area,
  className,
}: {
  area: Area;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[area]}
    </svg>
  );
}
