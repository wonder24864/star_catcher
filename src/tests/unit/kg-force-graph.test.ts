/**
 * Unit Tests: KG force-graph pure helpers (Sprint 26 D66)
 *
 * Covers the deterministic, side-effect-free pieces of the force-graph
 * component — the parts that can be tested without mounting d3-force.
 */
import { describe, test, expect } from "vitest";
import {
  nodeRadius,
  nodeColor,
  linkColor,
  computeNeighbors,
  type KGNode,
  type KGLink,
} from "@/components/admin/kg-force-graph";

// ─── nodeRadius ───────────────────────────────────

describe("nodeRadius (D66: sqrt(importance × examFrequency) clamped)", () => {
  test("minimum (importance=1, examFrequency=1) maps to 6px", () => {
    const r = nodeRadius({ importance: 1, examFrequency: 1 });
    expect(r).toBeCloseTo(6, 5);
  });

  test("maximum (importance=5, examFrequency=5) maps to 20px", () => {
    const r = nodeRadius({ importance: 5, examFrequency: 5 });
    expect(r).toBeCloseTo(20, 5);
  });

  test("mid-range (3 × 3) is between 6 and 20 and monotonic", () => {
    const low = nodeRadius({ importance: 1, examFrequency: 1 });
    const mid = nodeRadius({ importance: 3, examFrequency: 3 });
    const high = nodeRadius({ importance: 5, examFrequency: 5 });
    expect(mid).toBeGreaterThan(low);
    expect(mid).toBeLessThan(high);
  });

  test("importance × examFrequency product (not sum) drives radius", () => {
    // 2×3 = 6, same as 3×2 → identical radius
    expect(nodeRadius({ importance: 2, examFrequency: 3 })).toBeCloseTo(
      nodeRadius({ importance: 3, examFrequency: 2 }),
      5,
    );
  });
});

// ─── nodeColor ────────────────────────────────────

describe("nodeColor (schoolLevel tier palette)", () => {
  test("PRIMARY is blue-500", () => {
    expect(nodeColor("PRIMARY")).toBe("#3b82f6");
  });
  test("JUNIOR is purple-500", () => {
    expect(nodeColor("JUNIOR")).toBe("#a855f7");
  });
  test("SENIOR is pink-500", () => {
    expect(nodeColor("SENIOR")).toBe("#ec4899");
  });
});

// ─── linkColor ────────────────────────────────────

describe("linkColor (relation-type palette)", () => {
  test("PREREQUISITE is red", () => {
    expect(linkColor("PREREQUISITE")).toBe("#ef4444");
  });
  test("PARALLEL is slate", () => {
    expect(linkColor("PARALLEL")).toBe("#64748b");
  });
  test("CONTAINS is emerald", () => {
    expect(linkColor("CONTAINS")).toBe("#10b981");
  });
});

// ─── computeNeighbors ─────────────────────────────

describe("computeNeighbors (undirected adjacency map)", () => {
  const nodes: KGNode[] = [
    { id: "a", name: "A", depth: 0, difficulty: 3, importance: 3, examFrequency: 3 },
    { id: "b", name: "B", depth: 1, difficulty: 3, importance: 3, examFrequency: 3 },
    { id: "c", name: "C", depth: 1, difficulty: 3, importance: 3, examFrequency: 3 },
    { id: "d", name: "D", depth: 2, difficulty: 3, importance: 3, examFrequency: 3 },
  ];

  test("builds symmetric adjacency for string endpoints", () => {
    const links: KGLink[] = [
      { id: "l1", source: "a", target: "b", type: "CONTAINS", strength: 1 },
      { id: "l2", source: "a", target: "c", type: "CONTAINS", strength: 1 },
      { id: "l3", source: "b", target: "d", type: "PREREQUISITE", strength: 0.8 },
    ];

    const neighbors = computeNeighbors(nodes, links);

    expect([...neighbors.get("a")!]).toEqual(expect.arrayContaining(["b", "c"]));
    expect([...neighbors.get("b")!]).toEqual(expect.arrayContaining(["a", "d"]));
    expect([...neighbors.get("c")!]).toEqual(["a"]);
    expect([...neighbors.get("d")!]).toEqual(["b"]);
  });

  test("isolated node has empty neighbor set", () => {
    const neighbors = computeNeighbors(nodes, []);
    expect(neighbors.get("a")!.size).toBe(0);
    expect(neighbors.get("b")!.size).toBe(0);
  });

  test("handles object endpoints (post-d3-force simulation)", () => {
    const nodeA = nodes[0];
    const nodeB = nodes[1];
    const links: KGLink[] = [
      {
        id: "l1",
        source: nodeA,
        target: nodeB,
        type: "PARALLEL",
        strength: 1,
      },
    ];
    const neighbors = computeNeighbors(nodes, links);
    expect(neighbors.get("a")!.has("b")).toBe(true);
    expect(neighbors.get("b")!.has("a")).toBe(true);
  });
});
