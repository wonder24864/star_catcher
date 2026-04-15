"use client";

/**
 * KG 拖拽层级编辑器（Sprint 15 US-056）
 *
 * 特性：
 *   - 递归树形视图，支持展开/折叠（localStorage 记忆）
 *   - 同父拖拽 → reorderSiblings
 *   - 拖到其它节点的 "drop-as-child" 区 → 跨父移动（弹 Dialog 确认）
 *   - 防环：客户端过滤祖先 + 服务端 cycle check 兜底
 *
 * SSR 注意：父级页面用 next/dynamic({ ssr: false }) 动态导入。
 */

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────

type Subject =
  | "MATH"
  | "CHINESE"
  | "ENGLISH"
  | "PHYSICS"
  | "CHEMISTRY"
  | "BIOLOGY"
  | "POLITICS"
  | "HISTORY"
  | "GEOGRAPHY"
  | "OTHER";

type SchoolLevel = "PRIMARY" | "JUNIOR" | "SENIOR";

const SUBJECTS: Subject[] = [
  "MATH",
  "CHINESE",
  "ENGLISH",
  "PHYSICS",
  "CHEMISTRY",
  "BIOLOGY",
  "POLITICS",
  "HISTORY",
  "GEOGRAPHY",
  "OTHER",
];

const SCHOOL_LEVELS: SchoolLevel[] = ["PRIMARY", "JUNIOR", "SENIOR"];

type TreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  children: TreeNode[];
  _count?: { questionMappings: number };
};

// ─── Utilities ─────────────────────────────────────────────────

function collectDescendantIds(node: TreeNode): Set<string> {
  const out = new Set<string>();
  const stack: TreeNode[] = [node];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const c of n.children) {
      out.add(c.id);
      stack.push(c);
    }
  }
  return out;
}

function countDescendants(node: TreeNode): number {
  return collectDescendantIds(node).size;
}

function findParent(roots: TreeNode[], childId: string): TreeNode | null {
  const stack: Array<{ parent: TreeNode | null; node: TreeNode }> = roots.map((r) => ({
    parent: null,
    node: r,
  }));
  while (stack.length > 0) {
    const { parent, node } = stack.pop()!;
    if (node.id === childId) return parent;
    for (const c of node.children) stack.push({ parent: node, node: c });
  }
  return null;
}

function findNode(roots: TreeNode[], id: string): TreeNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const found = findNode(r.children, id);
    if (found) return found;
  }
  return null;
}

// ─── Sortable Tree Node ────────────────────────────────────────

function SortableTreeNode({
  node,
  expanded,
  onToggle,
  forbiddenAsChild,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  forbiddenAsChild: Set<string>;
}) {
  const t = useTranslations("knowledgeGraph.hierarchy");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  // Separate droppable zone on the right side: "drop here to become my child"
  const { setNodeRef: setChildDropRef, isOver: isOverChildZone } = useDroppable({
    id: `child-of-${node.id}`,
    data: { asChildOf: node.id },
    disabled: forbiddenAsChild.has(node.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div ref={setNodeRef} style={style} className="mb-0.5">
      <div className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 hover:bg-accent/50">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="w-5 text-xs text-muted-foreground hover:text-foreground"
          disabled={!hasChildren}
          aria-label={isExpanded ? t("collapse") : t("expand")}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : "·"}
        </button>

        {/* Drag handle (the row itself is sortable) */}
        <span
          {...attributes}
          {...listeners}
          className="flex-1 cursor-grab text-sm select-none"
          title={t("dragHint")}
        >
          {node.name}
        </span>

        <Badge variant="outline" className="text-xs shrink-0">
          {t("depthBadge", { depth: node.depth })}
        </Badge>

        {node._count && node._count.questionMappings > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {node._count.questionMappings}
          </span>
        )}

        {/* Drop-as-child zone */}
        <div
          ref={setChildDropRef}
          className={`shrink-0 rounded border border-dashed px-2 py-0.5 text-xs ${
            isOverChildZone && !forbiddenAsChild.has(node.id)
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-muted-foreground/30 text-muted-foreground"
          }`}
          aria-label="drop as child"
        >
          ↳
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-6 mt-0.5">
          <SortableContext
            items={node.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {node.children.map((c) => (
              <SortableTreeNode
                key={c.id}
                node={c}
                expanded={expanded}
                onToggle={onToggle}
                forbiddenAsChild={forbiddenAsChild}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ───────────────────────────────────────────────

export function KGTreeEditor() {
  const t = useTranslations("knowledgeGraph.hierarchy");
  const [subject, setSubject] = useState<Subject>("MATH");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("PRIMARY");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveIntent, setMoveIntent] = useState<{
    sourceNode: TreeNode;
    targetParentId: string | null;
    targetNodeName: string;
  } | null>(null);

  const storageKey = `kg-tree-expanded:${subject}-${schoolLevel}`;

  // Restore expanded state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
      else setExpanded(new Set());
    } catch {
      setExpanded(new Set());
    }
  }, [storageKey]);

  const persistExpanded = (next: Set<string>) => {
    setExpanded(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore quota errors */
    }
  };

  const treeQuery = trpc.knowledgeGraph.getTree.useQuery({
    subject,
    schoolLevel,
    maxDepth: 10,
  });

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.knowledgeGraph.getTree.invalidate({ subject, schoolLevel, maxDepth: 10 });
  };

  const reorderSiblings = trpc.knowledgeGraph.reorderSiblings.useMutation({
    onSuccess: () => {
      toast.success(t("reorderSuccess"));
      invalidate();
    },
    onError: () => toast.error(t("errorGeneric")),
  });

  const updateKP = trpc.knowledgeGraph.update.useMutation({
    onSuccess: () => {
      toast.success(t("moveSuccess"));
      invalidate();
      setMoveIntent(null);
    },
    onError: (err) => {
      if (err.message.includes("descendant")) toast.error(t("errorCycle"));
      else if (err.message.includes("depth")) toast.error(t("errorDepthMax"));
      else toast.error(t("errorGeneric"));
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const roots: TreeNode[] = useMemo(() => {
    if (!treeQuery.data) return [];
    // Recursive cast — tRPC returns objects matching TreeNode shape
    return treeQuery.data as unknown as TreeNode[];
  }, [treeQuery.data]);

  // Compute set of ids forbidden to be drop-as-child target
  // (active node + its descendants, to prevent cycles)
  const forbiddenAsChild = useMemo(() => {
    if (!activeId) return new Set<string>();
    const activeNode = findNode(roots, activeId);
    if (!activeNode) return new Set<string>();
    const forbidden = collectDescendantIds(activeNode);
    forbidden.add(activeId); // Can't drop onto self
    return forbidden;
  }, [activeId, roots]);

  const handleToggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Case A: drop onto "child-of-X" zone → cross-parent move
    const asChildOf = over.data.current?.asChildOf as string | undefined;
    if (asChildOf) {
      if (forbiddenAsChild.has(asChildOf)) {
        toast.error(t("errorCycle"));
        return;
      }
      const sourceNode = findNode(roots, activeId);
      const targetNode = findNode(roots, asChildOf);
      if (!sourceNode || !targetNode) return;
      // If already a child of that target, no-op
      if (sourceNode.parentId === asChildOf) return;
      setMoveIntent({
        sourceNode,
        targetParentId: asChildOf,
        targetNodeName: targetNode.name,
      });
      return;
    }

    // Case B: sortable reorder within same parent
    if (activeId === overId) return;

    const activeParent = findParent(roots, activeId);
    const overParent = findParent(roots, overId);
    // Only reorder if siblings (same parent)
    if (activeParent?.id !== overParent?.id) {
      // Different parents via sortable (e.g., dropping on a child at different level)
      // Treat as cross-parent move to overNode's parent
      if (!overParent) {
        // Over a root → move to root level
        const sourceNode = findNode(roots, activeId);
        if (!sourceNode || sourceNode.parentId === null) return;
        setMoveIntent({
          sourceNode,
          targetParentId: null,
          targetNodeName: t("collapse"), // placeholder — UI shows "root"
        });
      }
      return;
    }

    const parent = activeParent;
    const siblings = parent ? parent.children : roots;
    const oldIndex = siblings.findIndex((n) => n.id === activeId);
    const newIndex = siblings.findIndex((n) => n.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(siblings, oldIndex, newIndex);
    reorderSiblings.mutate({
      parentId: parent?.id ?? null,
      orderedIds: reordered.map((n) => n.id),
    });
  };

  const handleConfirmMove = () => {
    if (!moveIntent) return;
    updateKP.mutate({
      id: moveIntent.sourceNode.id,
      parentId: moveIntent.targetParentId,
    });
  };

  return (
    <div className="space-y-3">
      {/* Subject + level selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Subject</Label>
          <Select value={subject} onValueChange={(v) => setSubject(v as Subject)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">School Level</Label>
          <Select
            value={schoolLevel}
            onValueChange={(v) => setSchoolLevel(v as SchoolLevel)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHOOL_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("dragHint")}</p>

      {/* Tree */}
      {treeQuery.isLoading ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : roots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={roots.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {roots.map((root) => (
                <SortableTreeNode
                  key={root.id}
                  node={root}
                  expanded={expanded}
                  onToggle={handleToggle}
                  forbiddenAsChild={forbiddenAsChild}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div className="rounded border bg-background px-2 py-1 text-sm shadow">
                {findNode(roots, activeId)?.name ?? "..."}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Move confirmation dialog */}
      <Dialog
        open={moveIntent !== null}
        onOpenChange={(open) => {
          if (!open) setMoveIntent(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("moveConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {moveIntent &&
                (moveIntent.targetParentId === null
                  ? t("moveConfirmRoot", {
                      source: moveIntent.sourceNode.name,
                      descendantCount: countDescendants(moveIntent.sourceNode),
                    })
                  : t("moveConfirmDesc", {
                      source: moveIntent.sourceNode.name,
                      target: moveIntent.targetNodeName,
                      descendantCount: countDescendants(moveIntent.sourceNode),
                    }))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveIntent(null)}
              disabled={updateKP.isPending}
            >
              ✕
            </Button>
            <Button onClick={handleConfirmMove} disabled={updateKP.isPending}>
              {t("confirmMove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
