import type { ReactNode } from "react";

const W = 600;

/** Catmull-Rom spline through the points, as cubic Béziers: a smooth line without overshooting much. */
function smooth(pts: { x: number; y: number }[]) {
  return pts
    .map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const p0 = pts[i - 2] ?? pts[i - 1];
      const p1 = pts[i - 1];
      const p3 = pts[i + 1] ?? p;
      return `C${p1.x + (p.x - p0.x) / 6},${p1.y + (p.y - p0.y) / 6} ${p.x - (p3.x - p1.x) / 6},${p.y - (p3.y - p1.y) / 6} ${p.x},${p.y}`;
    })
    .join(" ");
}

function Dot({ x, y, H, filled, delay }: { x: number; y: number; H: number; filled?: boolean; delay: number }) {
  return (
    <span
      className={`anim-pop absolute size-2.5 rounded-full border-2 border-accent ${filled ? "bg-accent" : "bg-surface"}`}
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, transform: "translate(-50%, -50%)", animationDelay: `${delay}s` }}
    />
  );
}

/** SVG stretched to the container width; strokes stay crisp thanks to non-scaling-stroke. */
function Plot({ H, className, children }: { H: number; className: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`absolute inset-0 size-full overflow-visible ${className}`} aria-hidden>
      {children}
    </svg>
  );
}

const Area = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
    <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
  </linearGradient>
);

/** Total balance today and at each month end. */
export function ForecastChart({ points }: { points: { label: string; value: number; display: string }[] }) {
  const H = 160;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * 0.15;
  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - ((p.value - (min - pad)) / (max - min + 2 * pad)) * H,
  }));
  const line = smooth(xy);
  return (
    <figure aria-label="Projection du solde total">
      <div className="relative h-36 sm:h-44">
        <Plot H={H} className="anim-reveal">
          <defs><Area id="forecast-area" /></defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#forecast-area)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </Plot>
        {xy.map((p, i) => <Dot key={i} {...p} H={H} filled={i === 0} delay={0.35 + (1.2 * i) / xy.length} />)}
      </div>
      <figcaption className="mt-3 grid text-center" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <div key={p.label} className="min-w-0">
            <p className="truncate text-xs text-muted capitalize">{p.label}</p>
            <p className={`truncate font-mono text-[11px] tracking-tight sm:text-xs ${p.value < 0 ? "text-loss" : ""}`}>{p.display}</p>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * Cumulative spending, day by day: this month (up to today) against the whole previous month.
 * `current` and `previous` hold the running total at the end of each day, in cents.
 */
export function SpendingChart({ current, previous }: { current: number[]; previous: number[] }) {
  const H = 140;
  const days = Math.max(current.length, previous.length, 2);
  const max = Math.max(...current, ...previous, 1) * 1.1;
  const toXY = (v: number, i: number) => ({ x: (i / (days - 1)) * W, y: H - (v / max) * H });
  const cur = current.map(toXY);
  const prev = previous.map(toXY);
  const last = cur.at(-1)!;
  // Straight segments: a cumulative total only goes up, a spline would dip between days.
  const linear = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const curLine = linear(cur);
  return (
    <div className="relative h-32 sm:h-40">
      <Plot H={H} className="">
        <path d={linear(prev)} fill="none" stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </Plot>
      <Plot H={H} className="anim-reveal">
        <defs><Area id="spending-area" /></defs>
        <path d={`${curLine} L${last.x},${H} L0,${H} Z`} fill="url(#spending-area)" />
        <path d={curLine} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Plot>
      <Dot {...last} H={H} filled delay={1.5} />
    </div>
  );
}
