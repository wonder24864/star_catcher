"use client";

/**
 * QuestionBox — a single overlay rectangle + status badge on the homework
 * canvas. Renders inside an SVG with viewBox 0-100, so all coordinates are
 * in percentage units (matches SessionQuestion.imageRegion).
 *
 * Status drives color and icon. The whole group is clickable, and
 * `highlighted` puts a dashed ring on the active box (used when the detail
 * sheet is open on this question).
 */

import { cn } from "@/lib/utils";

export type QuestionBoxStatus = "correct" | "incorrect" | "review" | "unknown";

const STATUS_STYLES: Record<
  QuestionBoxStatus,
  {
    stroke: string;
    fillOpacity: string;
    fill: string;
    badgeFill: string;
    badgeStroke: string;
    symbolFill: string;
    symbol: string;
  }
> = {
  correct: {
    stroke: "rgb(34 197 94)", // green-500
    fill: "rgb(34 197 94)",
    fillOpacity: "0.08",
    badgeFill: "rgb(34 197 94)",
    badgeStroke: "white",
    symbolFill: "white",
    symbol: "check",
  },
  incorrect: {
    stroke: "rgb(239 68 68)", // red-500
    fill: "rgb(239 68 68)",
    fillOpacity: "0.1",
    badgeFill: "rgb(239 68 68)",
    badgeStroke: "white",
    symbolFill: "white",
    symbol: "cross",
  },
  review: {
    stroke: "rgb(245 158 11)", // amber-500
    fill: "rgb(245 158 11)",
    fillOpacity: "0.08",
    badgeFill: "rgb(245 158 11)",
    badgeStroke: "white",
    symbolFill: "white",
    symbol: "question",
  },
  unknown: {
    stroke: "rgb(156 163 175)", // gray-400
    fill: "rgb(156 163 175)",
    fillOpacity: "0.06",
    badgeFill: "rgb(156 163 175)",
    badgeStroke: "white",
    symbolFill: "white",
    symbol: "question",
  },
};

export function QuestionBox({
  x,
  y,
  w,
  h,
  questionNumber,
  status,
  highlighted = false,
  onTap,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  questionNumber: number;
  status: QuestionBoxStatus;
  highlighted?: boolean;
  onTap: () => void;
}) {
  const s = STATUS_STYLES[status];
  // Badge geometry: sized in viewBox % units. Keep it small (radius ~2.5%)
  // so it reads at any zoom level. Anchor top-right of the bbox, clamped so
  // it never clips off the image edge.
  const badgeR = Math.max(Math.min(Math.min(w, h) * 0.15, 4.5), 2);
  const bx = Math.min(Math.max(x + w, badgeR), 100 - badgeR);
  const by = Math.max(y, badgeR);

  // The "clickable-question" class is what we pass to react-zoom-pan-pinch's
  // panning.excluded so taps on boxes fire onTap instead of starting a pan.
  // It stays on in read-only sessions too because users still open the detail
  // sheet to review answers after COMPLETED.
  return (
    <g
      className={cn("clickable-question cursor-pointer pointer-events-auto")}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      style={{ touchAction: "manipulation" }}
    >
      {/* Rectangle outline */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={s.fill}
        fillOpacity={s.fillOpacity}
        stroke={s.stroke}
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        rx="0.8"
      />
      {highlighted && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke={s.stroke}
          strokeWidth="1.5"
          strokeDasharray="2 1"
          vectorEffect="non-scaling-stroke"
          rx="0.8"
        />
      )}

      {/* Question number — top-left, tiny */}
      <text
        x={x + 0.6}
        y={y + badgeR * 0.8}
        fontSize={Math.max(Math.min(h * 0.15, 2.8), 1.5)}
        fill={s.stroke}
        fontWeight="700"
        style={{ pointerEvents: "none" }}
      >
        {questionNumber}
      </text>

      {/* Status badge — top-right */}
      <circle
        cx={bx}
        cy={by}
        r={badgeR}
        fill={s.badgeFill}
        stroke={s.badgeStroke}
        strokeWidth="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <BadgeSymbol cx={bx} cy={by} r={badgeR} symbol={s.symbol} fill={s.symbolFill} />
    </g>
  );
}

function BadgeSymbol({
  cx,
  cy,
  r,
  symbol,
  fill,
}: {
  cx: number;
  cy: number;
  r: number;
  symbol: string;
  fill: string;
}) {
  if (symbol === "check") {
    const d = `M ${cx - r * 0.45} ${cy + r * 0.05} L ${cx - r * 0.1} ${cy + r * 0.4} L ${cx + r * 0.5} ${cy - r * 0.35}`;
    return (
      <path
        d={d}
        stroke={fill}
        strokeWidth={r * 0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (symbol === "cross") {
    const off = r * 0.42;
    return (
      <g stroke={fill} strokeWidth={r * 0.35} strokeLinecap="round">
        <line x1={cx - off} y1={cy - off} x2={cx + off} y2={cy + off} vectorEffect="non-scaling-stroke" />
        <line x1={cx - off} y1={cy + off} x2={cx + off} y2={cy - off} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  // question mark
  return (
    <text
      x={cx}
      y={cy + r * 0.4}
      fontSize={r * 1.3}
      fill={fill}
      textAnchor="middle"
      fontWeight="700"
      style={{ pointerEvents: "none" }}
    >
      ?
    </text>
  );
}
