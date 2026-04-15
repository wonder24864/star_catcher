"use client";

/**
 * 低置信度映射审核页（Sprint 15 US-055）
 *
 * 列表 + 阈值/subject/schoolLevel 筛选 + 批量确认/删除 + 单条换 KP。
 */

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

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

function confidenceColor(c: number): string {
  if (c < 0.5) return "text-red-600 bg-red-50 border-red-200";
  if (c < 0.7) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-green-700 bg-green-50 border-green-200";
}

function formatDate(d: Date | string, locale: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function AdminMappingsPage() {
  const t = useTranslations("admin.mappings");
  const locale = useLocale();

  const [threshold, setThreshold] = useState(0.7);
  const [subject, setSubject] = useState<Subject | "ALL">("ALL");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel | "ALL">("ALL");
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Change-KP dialog state
  const [changeKpFor, setChangeKpFor] = useState<{ id: string; currentName: string } | null>(null);
  const [kpSearch, setKpSearch] = useState("");
  const [pickedKpId, setPickedKpId] = useState<string | null>(null);

  const listQuery = trpc.knowledgeGraph.listLowConfidenceMappings.useQuery({
    threshold,
    subject: subject === "ALL" ? undefined : subject,
    schoolLevel: schoolLevel === "ALL" ? undefined : schoolLevel,
    onlyUnverified,
    page,
    pageSize: 20,
  });

  const kpSearchQuery = trpc.knowledgeGraph.search.useQuery(
    { query: kpSearch, limit: 20 },
    { enabled: changeKpFor !== null && kpSearch.length > 0 },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.knowledgeGraph.listLowConfidenceMappings.invalidate();
  };

  const batchVerify = trpc.knowledgeGraph.batchVerifyMappings.useMutation({
    onSuccess: (res) => {
      if (res.count === 0) toast(t("toasts.noneChanged"));
      else toast.success(t("toasts.verifiedCount", { count: res.count }));
      setSelected(new Set());
      invalidate();
    },
    onError: () => toast.error(t("toasts.errorGeneric")),
  });

  const deleteMapping = trpc.knowledgeGraph.deleteMapping.useMutation({
    onSuccess: () => {
      toast.success(t("toasts.deleted"));
      setSelected((s) => {
        const n = new Set(s);
        // Can't know id here easily; refetch will fix
        return n;
      });
      invalidate();
    },
    onError: () => toast.error(t("toasts.errorGeneric")),
  });

  const updateMapping = trpc.knowledgeGraph.updateMapping.useMutation({
    onSuccess: () => {
      toast.success(t("toasts.updated"));
      setChangeKpFor(null);
      setKpSearch("");
      setPickedKpId(null);
      invalidate();
    },
    onError: () => toast.error(t("toasts.errorGeneric")),
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const items = listQuery.data?.items ?? [];

  const allSelected = useMemo(
    () => items.length > 0 && items.every((i) => selected.has(i.id)),
    [items, selected],
  );

  const handleToggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const handleToggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleBatchVerify = () => {
    if (selected.size === 0) return;
    if (!confirm(t("actions.confirmBatchVerify", { count: selected.size }))) return;
    batchVerify.mutate({ mappingIds: Array.from(selected) });
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("actions.confirmDelete"))) return;
    deleteMapping.mutate({ id });
  };

  const handleChangeKpSubmit = () => {
    if (!changeKpFor || !pickedKpId) return;
    updateMapping.mutate({ id: changeKpFor.id, newKnowledgePointId: pickedKpId });
  };

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("threshold")}</Label>
          <Select
            value={String(threshold)}
            onValueChange={(v) => {
              setThreshold(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {"< "}
                  {v.toFixed(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("subjectFilter")}</Label>
          <Select
            value={subject}
            onValueChange={(v) => {
              setSubject(v as Subject | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allSubjects")}</SelectItem>
              {SUBJECTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("schoolLevelFilter")}</Label>
          <Select
            value={schoolLevel}
            onValueChange={(v) => {
              setSchoolLevel(v as SchoolLevel | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allLevels")}</SelectItem>
              {SCHOOL_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="onlyUnverified"
            checked={onlyUnverified}
            onCheckedChange={(c) => {
              setOnlyUnverified(c === true);
              setPage(1);
            }}
          />
          <Label htmlFor="onlyUnverified" className="text-sm cursor-pointer">
            {t("onlyUnverified")}
          </Label>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("total", { count: total })}</p>

      {/* Batch bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border bg-background p-3 shadow-sm">
          <span className="text-sm">
            {t("total", { count: selected.size })}
          </span>
          <Button
            size="sm"
            onClick={handleBatchVerify}
            disabled={batchVerify.isPending}
          >
            {t("actions.batchVerify", { count: selected.size })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            ✕
          </Button>
        </div>
      )}

      {/* List */}
      {listQuery.isLoading ? (
        <p className="text-muted-foreground">...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header checkbox */}
          <div className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleToggleAll}
              aria-label="select all"
            />
            <span>
              {t("columns.question")} / {t("columns.knowledgePoint")} /{" "}
              {t("columns.confidence")} / {t("columns.source")} / {t("columns.verified")}
            </span>
          </div>

          {items.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={() => handleToggleOne(m.id)}
                    className="mt-1"
                  />

                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Question preview */}
                    <div className="text-sm">
                      <span className="text-muted-foreground mr-2">
                        [{m.question.subject}]
                      </span>
                      {m.question.contentPreview}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {m.knowledgePoint.name}
                      </Badge>
                      <span
                        className={`text-xs rounded border px-1.5 py-0.5 ${confidenceColor(m.confidence)}`}
                      >
                        {m.confidence.toFixed(2)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {t(`source.${m.mappingSource}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {m.verifiedAt && m.verifier
                          ? t("verifiedBy", {
                              date: formatDate(m.verifiedAt, locale),
                              name: m.verifier.nickname,
                            })
                          : t("unverified")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => batchVerify.mutate({ mappingIds: [m.id] })}
                      disabled={batchVerify.isPending}
                    >
                      {t("actions.verify")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setChangeKpFor({ id: m.id, currentName: m.knowledgePoint.name });
                        setKpSearch("");
                        setPickedKpId(null);
                      }}
                    >
                      {t("actions.changeKp")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(m.id)}
                      disabled={deleteMapping.isPending}
                    >
                      {t("actions.delete")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Change-KP dialog */}
      <Dialog
        open={changeKpFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setChangeKpFor(null);
            setKpSearch("");
            setPickedKpId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("changeKpDialog.title")}</DialogTitle>
            {changeKpFor && (
              <DialogDescription>
                {changeKpFor.currentName} →{" "}
                {pickedKpId && kpSearchQuery.data
                  ? kpSearchQuery.data.find((k) => k.id === pickedKpId)?.name ?? "..."
                  : "?"}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-2">
            <Input
              value={kpSearch}
              onChange={(e) => setKpSearch(e.target.value)}
              placeholder={t("changeKpDialog.searchPlaceholder")}
            />

            <div className="max-h-60 overflow-y-auto rounded border">
              {kpSearchQuery.data?.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setPickedKpId(k.id)}
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                    pickedKpId === k.id ? "bg-accent" : ""
                  }`}
                >
                  <span className="font-medium">{k.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    [{k.subject} · {k.schoolLevel}]
                  </span>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleChangeKpSubmit}
              disabled={!pickedKpId || updateMapping.isPending}
            >
              {t("changeKpDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
