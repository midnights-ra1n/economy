/** Total balance today and at each month end, drawn as a line that reveals itself on load (CSS only). */
export function ForecastChart({ points }: { points: { label: string; value: number; display: string }[] }) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * 0.15;
  const W = 600;
  const H = 160;
  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - ((p.value - (min - pad)) / (max - min + 2 * pad)) * H,
  }));
  // Smooth curve: Catmull-Rom converted to cubic Béziers.
  const line = xy
    .map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const p0 = xy[i - 2] ?? xy[i - 1];
      const p1 = xy[i - 1];
      const p3 = xy[i + 1] ?? p;
      return `C${p1.x + (p.x - p0.x) / 6},${p1.y + (p.y - p0.y) / 6} ${p.x - (p3.x - p1.x) / 6},${p.y - (p3.y - p1.y) / 6} ${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <figure aria-label="Projection du solde total">
      <div className="relative h-40 sm:h-48">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="anim-reveal absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brass)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--brass)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#area)" />
          <path d={line} fill="none" stroke="var(--brass)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {xy.map((p, i) => (
          <span
            key={i}
            className={`anim-pop absolute size-2.5 rounded-full border-2 border-brass ${i === 0 ? "bg-brass" : "bg-paper"}`}
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, transform: "translate(-50%, -50%)", animationDelay: `${0.4 + (1.3 * i) / xy.length}s` }}
          />
        ))}
      </div>
      <figcaption className="mt-3 grid text-center" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <div key={p.label} className="min-w-0">
            <p className="truncate text-xs text-muted capitalize">{p.label}</p>
            <p className={`truncate text-[11px] sm:text-xs ${p.value < 0 ? "text-loss" : ""}`}>{p.display}</p>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
