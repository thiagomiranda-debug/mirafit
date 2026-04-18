"use client";

export interface ChartDataPoint {
  date: Date;
  value: number;
}

interface ExerciseChartProps {
  data: ChartDataPoint[];
  gradientId: string;
}

export default function ExerciseChart({ data, gradientId }: ExerciseChartProps) {
  if (data.length < 2) return null;

  const W = 300;
  const H = 90;
  const PAD = { l: 36, r: 8, t: 10, b: 26 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const vals = data.map((d) => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const cx = (i: number) =>
    PAD.l + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
  const cy = (v: number) => PAD.t + (1 - (v - minV) / range) * chartH;

  const linePoints = data.map((d, i) => `${cx(i)},${cy(d.value)}`).join(" ");
  const areaPath = [
    `M ${cx(0)},${cy(data[0].value)}`,
    ...data.slice(1).map((d, i) => `L ${cx(i + 1)},${cy(d.value)}`),
    `L ${cx(data.length - 1)},${PAD.t + chartH}`,
    `L ${cx(0)},${PAD.t + chartH}`,
    "Z",
  ].join(" ");

  const labelCount = Math.min(data.length, 3);
  const labelIndices =
    labelCount === 1
      ? [0]
      : Array.from({ length: labelCount }, (_, i) =>
          Math.round((i / (labelCount - 1)) * (data.length - 1))
        );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DC2626" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#DC2626"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={cx(i)} cy={cy(d.value)} r="4" fill="#DC2626" opacity="0.2" />
          <circle cx={cx(i)} cy={cy(d.value)} r="2.5" fill="#DC2626" />
        </g>
      ))}

      {/* Y axis: min & max */}
      <text
        x={PAD.l - 4}
        y={PAD.t + 4}
        textAnchor="end"
        fontSize="9"
        fontWeight="600"
        fill="#9CA3AF"
      >
        {maxV}
      </text>
      <text
        x={PAD.l - 4}
        y={PAD.t + chartH}
        textAnchor="end"
        fontSize="9"
        fontWeight="600"
        fill="#9CA3AF"
      >
        {minV}
      </text>
      <text
        x={PAD.l - 4}
        y={PAD.t + chartH / 2 + 3}
        textAnchor="end"
        fontSize="7"
        fill="#6B7280"
      >
        kg
      </text>

      {/* X axis: dates */}
      {labelIndices.map((i) => (
        <text
          key={i}
          x={cx(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize="8"
          fontWeight="500"
          fill="#6B7280"
        >
          {data[i].date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          })}
        </text>
      ))}
    </svg>
  );
}
