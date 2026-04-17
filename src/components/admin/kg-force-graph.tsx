"use client";

/**
 * KG Force-Directed Graph (Sprint 26 D66/D67)
 *
 * 2D SVG force-layout visualization for the knowledge graph.
 *
 * Features:
 *   - d3-force simulation (link + manyBody + center + collide)
 *   - d3-zoom pan + scale (0.3x - 4x)
 *   - Node radius ∝ sqrt(importance × examFrequency) (D66), clamped [6, 20]
 *   - Node color by schoolLevel tier (primary/junior/senior)
 *   - Edge color by relation type (PREREQUISITE red + arrow, PARALLEL slate, CONTAINS emerald)
 *   - Hover → neighbors full opacity, others dim to 0.2
 *   - Adaptive alphaDecay for > 300 nodes (D67)
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";

// ─── Types ────────────────────────────────────────────────────────

export interface KGNode extends SimulationNodeDatum {
  id: string;
  name: string;
  depth: number;
  difficulty: number;
  importance: number;
  examFrequency: number;
}

export interface KGLink {
  id: string;
  source: string | KGNode;
  target: string | KGNode;
  type: "PREREQUISITE" | "PARALLEL" | "CONTAINS";
  strength: number;
}

type InternalLink = SimulationLinkDatum<KGNode> & Omit<KGLink, "source" | "target">;

interface KGForceGraphProps {
  nodes: KGNode[];
  links: KGLink[];
  width?: number;
  height?: number;
  schoolLevel: "PRIMARY" | "JUNIOR" | "SENIOR";
  /** Node to center + highlight (e.g. from search) */
  highlightId?: string | null;
  onNodeClick?: (id: string) => void;
}

// ─── Visual mapping (pure) ────────────────────────────────────────

/**
 * Node radius ∝ sqrt(importance × examFrequency), clamped to [6, 20].
 * importance/examFrequency are 1-5 each → product ∈ [1, 25] → sqrt ∈ [1, 5].
 */
export function nodeRadius(n: Pick<KGNode, "importance" | "examFrequency">): number {
  const raw = Math.sqrt(n.importance * n.examFrequency);
  // Map sqrt range [1, 5] → pixel range [6, 20]
  return 6 + ((raw - 1) / 4) * 14;
}

/**
 * Node fill color by schoolLevel (D66).
 * Uses Tailwind palette values (readable in light+dark thanks to opacity ring).
 */
export function nodeColor(schoolLevel: "PRIMARY" | "JUNIOR" | "SENIOR"): string {
  switch (schoolLevel) {
    case "PRIMARY":
      return "#3b82f6"; // blue-500
    case "JUNIOR":
      return "#a855f7"; // purple-500
    case "SENIOR":
      return "#ec4899"; // pink-500
  }
}

/** Edge stroke color by relation type (D66). */
export function linkColor(type: KGLink["type"]): string {
  switch (type) {
    case "PREREQUISITE":
      return "#ef4444"; // red-500
    case "PARALLEL":
      return "#64748b"; // slate-500
    case "CONTAINS":
      return "#10b981"; // emerald-500
  }
}

// ─── Neighbor helper (pure) ───────────────────────────────────────

export function computeNeighbors(
  nodes: KGNode[],
  links: KGLink[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const n of nodes) map.set(n.id, new Set());
  for (const l of links) {
    const s = typeof l.source === "string" ? l.source : l.source.id;
    const t = typeof l.target === "string" ? l.target : l.target.id;
    map.get(s)?.add(t);
    map.get(t)?.add(s);
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────

export function KGForceGraph({
  nodes,
  links,
  width = 800,
  height = 560,
  schoolLevel,
  highlightId,
  onNodeClick,
}: KGForceGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // re-render driver for simulation ticks

  // Clone node/link data so we don't mutate the caller's arrays (d3 mutates x/y)
  const simNodes = useMemo<KGNode[]>(
    () => nodes.map((n) => ({ ...n })),
    [nodes],
  );
  const simLinks = useMemo<InternalLink[]>(
    () =>
      links.map((l) => ({
        id: l.id,
        source: typeof l.source === "string" ? l.source : l.source.id,
        target: typeof l.target === "string" ? l.target : l.target.id,
        type: l.type,
        strength: l.strength,
      })),
    [links],
  );

  const neighbors = useMemo(() => computeNeighbors(simNodes, links), [simNodes, links]);

  // ── d3-force simulation lifecycle ─────────────────────
  useEffect(() => {
    if (simNodes.length === 0) return;

    const decay = simNodes.length > 300 ? 0.06 : 0.028; // D67
    const sim = forceSimulation<KGNode>(simNodes)
      .force(
        "link",
        forceLink<KGNode, InternalLink>(simLinks)
          .id((d) => d.id)
          .distance(60)
          .strength(0.3),
      )
      .force("charge", forceManyBody<KGNode>().strength(-120))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<KGNode>().radius((d) => nodeRadius(d) + 4),
      )
      .alphaDecay(decay);

    sim.on("tick", () => setTick((t) => t + 1));

    return () => {
      sim.stop();
    };
  }, [simNodes, simLinks, width, height]);

  // ── d3-zoom setup (pan + scale) ───────────────────────
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });
    zoomBehaviorRef.current = zoomBehavior;

    svg.call(zoomBehavior);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  // ── Highlight: center on highlightId ──────────────────
  useEffect(() => {
    if (!highlightId || !svgRef.current || !zoomBehaviorRef.current) return;
    const target = simNodes.find((n) => n.id === highlightId);
    if (!target || target.x == null || target.y == null) return;
    const scale = 1.5;
    const tx = width / 2 - target.x * scale;
    const ty = height / 2 - target.y * scale;
    const svg = select(svgRef.current);
    // d3-selection's .call is synchronous — no transition animation, but avoids
    // needing the separate d3-transition module. Acceptable for a focus jump.
    svg.call(
      zoomBehaviorRef.current.transform,
      zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [highlightId, simNodes, width, height, tick]); // tick so we wait for initial layout

  // ── Derived opacity / stroke based on hover ──────────
  const activeId = hoverId ?? highlightId ?? null;

  function nodeOpacity(id: string): number {
    if (!activeId) return 1;
    if (id === activeId) return 1;
    return neighbors.get(activeId)?.has(id) ? 1 : 0.2;
  }

  function linkOpacity(l: InternalLink): number {
    if (!activeId) return 0.55;
    const s = typeof l.source === "string" ? l.source : (l.source as KGNode).id;
    const t = typeof l.target === "string" ? l.target : (l.target as KGNode).id;
    return s === activeId || t === activeId ? 0.9 : 0.08;
  }

  // ── Empty state ──
  if (simNodes.length === 0) {
    return null;
  }

  const fillColor = nodeColor(schoolLevel);

  // Use `tick` to force re-render when sim updates (x/y mutated in place)
  void tick;

  const svgStyle: CSSProperties = {
    cursor: "grab",
    background: "transparent",
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={svgStyle}
      aria-label="knowledge graph force layout"
    >
      <defs>
        {/* Arrow markers for PREREQUISITE direction */}
        <marker
          id="kg-arrow-prereq"
          viewBox="0 -5 10 10"
          refX={18}
          refY={0}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill={linkColor("PREREQUISITE")} />
        </marker>
        <marker
          id="kg-arrow-contains"
          viewBox="0 -5 10 10"
          refX={16}
          refY={0}
          markerWidth={5}
          markerHeight={5}
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill={linkColor("CONTAINS")} />
        </marker>
      </defs>

      <g ref={gRef}>
        {/* Links */}
        {simLinks.map((l) => {
          const src = l.source as KGNode;
          const tgt = l.target as KGNode;
          if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) {
            return null;
          }
          const markerRef =
            l.type === "PREREQUISITE"
              ? "url(#kg-arrow-prereq)"
              : l.type === "CONTAINS"
                ? "url(#kg-arrow-contains)"
                : undefined;
          return (
            <line
              key={l.id}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={linkColor(l.type)}
              strokeWidth={1 + l.strength * 0.8}
              strokeOpacity={linkOpacity(l)}
              markerEnd={markerRef}
              style={{ transition: "stroke-opacity 150ms" }}
            />
          );
        })}

        {/* Nodes */}
        {simNodes.map((n) => {
          if (n.x == null || n.y == null) return null;
          const r = nodeRadius(n);
          const isActive = n.id === activeId;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{
                cursor: "pointer",
                opacity: nodeOpacity(n.id),
                transition: "opacity 150ms",
              }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onNodeClick?.(n.id)}
            >
              <circle
                r={r}
                fill={fillColor}
                stroke={isActive ? "#fbbf24" : "#ffffff"}
                strokeOpacity={isActive ? 1 : 0.6}
                strokeWidth={isActive ? 3 : 1.5}
              />
              <text
                y={r + 12}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
