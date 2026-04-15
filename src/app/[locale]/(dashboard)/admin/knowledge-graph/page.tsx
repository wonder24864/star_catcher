"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Sprint 15: @dnd-kit 组件必须客户端渲染以避免 hydration 错配
const KGTreeEditor = dynamic(
  () => import("@/components/admin/kg-tree-editor").then((m) => m.KGTreeEditor),
  { ssr: false },
);

type Tab = "tree" | "hierarchy" | "import" | "review";
type Subject = "MATH" | "CHINESE" | "ENGLISH" | "PHYSICS" | "CHEMISTRY" | "BIOLOGY" | "HISTORY" | "GEOGRAPHY" | "POLITICS" | "OTHER";
type SchoolLevel = "PRIMARY" | "JUNIOR" | "SENIOR";
type RelationType = "PREREQUISITE" | "PARALLEL" | "CONTAINS";

export default function KnowledgeGraphPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("tree");
  const [subject, setSubject] = useState<Subject>("MATH");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("JUNIOR");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("knowledgeGraph.title")}</h1>
        <Link href="/admin/knowledge-graph/mappings">
          <Button variant="outline" size="sm">
            {t("knowledgeGraph.tabs.mappings")}
          </Button>
        </Link>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        {(["tree", "hierarchy", "import", "review"] as Tab[]).map((tabKey) => (
          <Button
            key={tabKey}
            variant={tab === tabKey ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(tabKey)}
          >
            {t(`knowledgeGraph.tabs.${tabKey}`)}
          </Button>
        ))}
      </div>

      {tab === "tree" && (
        <TreeTab
          subject={subject}
          schoolLevel={schoolLevel}
          search={search}
          page={page}
          onSubjectChange={(v) => { setSubject(v); setPage(1); }}
          onSchoolLevelChange={(v) => { setSchoolLevel(v); setPage(1); }}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          onPageChange={setPage}
        />
      )}
      {tab === "hierarchy" && <KGTreeEditor />}
      {tab === "import" && <ImportTab />}
      {tab === "review" && <ReviewTab subject={subject} />}
    </div>
  );
}

// ─── Tree Tab ───

function TreeTab({
  subject,
  schoolLevel,
  search,
  page,
  onSubjectChange,
  onSchoolLevelChange,
  onSearchChange,
  onPageChange,
}: {
  subject: Subject;
  schoolLevel: SchoolLevel;
  search: string;
  page: number;
  onSubjectChange: (v: Subject) => void;
  onSchoolLevelChange: (v: SchoolLevel) => void;
  onSearchChange: (v: string) => void;
  onPageChange: (v: number) => void;
}) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = trpc.knowledgeGraph.list.useQuery({
    subject,
    schoolLevel,
    search: search || undefined,
    page,
    pageSize: 30,
  });

  const deleteMutation = trpc.knowledgeGraph.delete.useMutation({
    onSuccess: () => {
      utils.knowledgeGraph.list.invalidate();
    },
  });

  const totalPages = data ? Math.ceil(data.total / 30) : 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={subject} onValueChange={(v) => onSubjectChange(v as Subject)}>
          <SelectTrigger className="w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY", "BIOLOGY", "HISTORY", "GEOGRAPHY", "POLITICS"].map((s) => (
              <SelectItem key={s} value={s}>{t(`subjects.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={schoolLevel} onValueChange={(v) => onSchoolLevelChange(v as SchoolLevel)}>
          <SelectTrigger className="w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PRIMARY">{t("knowledgeGraph.primary")}</SelectItem>
            <SelectItem value="JUNIOR">{t("knowledgeGraph.junior")}</SelectItem>
            <SelectItem value="SENIOR">{t("knowledgeGraph.senior")}</SelectItem>
          </SelectContent>
        </Select>

        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("knowledgeGraph.searchPlaceholder")}
          className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
        />
      </div>

      {/* Knowledge points list */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((kp) => (
            <Card key={kp.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{"─".repeat(kp.depth)}</span>
                  <span className="font-medium text-sm">{kp.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {t(`knowledgeGraph.difficulty`)} {kp.difficulty}
                  </Badge>
                  {kp._count.questionMappings > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {t("knowledgeGraph.questionCount", { count: kp._count.questionMappings })}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setEditingId(kp.id)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive text-xs"
                    onClick={() => deleteMutation.mutate({ id: kp.id })}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t("knowledgeGraph.empty")}
            </p>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {t("common.prev")}
          </Button>
          <span className="text-sm self-center">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            {t("common.next")}
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      {editingId && (
        <KPEditDialog
          kpId={editingId}
          open={!!editingId}
          onOpenChange={(open) => { if (!open) setEditingId(null); }}
        />
      )}
    </div>
  );
}

// ─── KP Edit Dialog ───

function KPEditDialog({
  kpId,
  open,
  onOpenChange,
}: {
  kpId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const utils = trpc.useUtils();

  // Fetch full KP data with relations
  const { data: kp, isLoading } = trpc.knowledgeGraph.getById.useQuery(
    { id: kpId },
    { enabled: open },
  );

  // Edit form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [importance, setImportance] = useState("3");
  const [examFrequency, setExamFrequency] = useState("3");
  const [formInitialized, setFormInitialized] = useState(false);

  // Initialize form when data loads
  if (kp && !formInitialized) {
    setName(kp.name);
    setDescription(kp.description ?? "");
    setDifficulty(String(kp.difficulty));
    setImportance(String(kp.importance));
    setExamFrequency(String(kp.examFrequency));
    setFormInitialized(true);
  }

  // Reset form state when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormInitialized(false);
    }
    onOpenChange(nextOpen);
  };

  // Update mutation
  const updateMutation = trpc.knowledgeGraph.update.useMutation({
    onSuccess: () => {
      toast.success(t("knowledgeGraph.edit.save"));
      utils.knowledgeGraph.list.invalidate();
      utils.knowledgeGraph.getById.invalidate({ id: kpId });
    },
  });

  // Relation mutations
  const addRelationMutation = trpc.knowledgeGraph.addRelation.useMutation({
    onSuccess: () => {
      utils.knowledgeGraph.getById.invalidate({ id: kpId });
      setRelationSearchQuery("");
      setRelationSearchResults([]);
      setSelectedTargetId("");
    },
  });

  const removeRelationMutation = trpc.knowledgeGraph.removeRelation.useMutation({
    onSuccess: () => {
      utils.knowledgeGraph.getById.invalidate({ id: kpId });
    },
  });

  // Relation add form state
  const [relationSearchQuery, setRelationSearchQuery] = useState("");
  const [relationSearchResults, setRelationSearchResults] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("PREREQUISITE");

  // Search for target KP
  const searchQuery = trpc.knowledgeGraph.search.useQuery(
    { query: relationSearchQuery, limit: 10 },
    { enabled: relationSearchQuery.length >= 1 },
  );

  // Sync search results when query data changes
  if (searchQuery.data && searchQuery.data !== relationSearchResults) {
    const filtered = searchQuery.data.filter((item) => item.id !== kpId);
    if (
      filtered.length !== relationSearchResults.length ||
      filtered.some((f, i) => f.id !== relationSearchResults[i]?.id)
    ) {
      setRelationSearchResults(filtered);
    }
  }

  function handleSave() {
    updateMutation.mutate({
      id: kpId,
      name,
      description: description || undefined,
      difficulty: parseInt(difficulty, 10),
      importance: parseInt(importance, 10),
      examFrequency: parseInt(examFrequency, 10),
    });
  }

  function handleAddRelation() {
    if (!selectedTargetId) return;
    addRelationMutation.mutate({
      fromId: kpId,
      toId: selectedTargetId,
      type: relationType,
    });
  }

  function handleRemoveRelation(relationId: string) {
    removeRelationMutation.mutate({ id: relationId });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("knowledgeGraph.edit.title")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : kp ? (
          <div className="space-y-6">
            {/* Edit Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kp-name">{t("knowledgeGraph.name")}</Label>
                <Input
                  id="kp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kp-description">{t("knowledgeGraph.edit.description")}</Label>
                <Textarea
                  id="kp-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>{t("knowledgeGraph.difficulty")}</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("knowledgeGraph.edit.importance")}</Label>
                  <Select value={importance} onValueChange={setImportance}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("knowledgeGraph.edit.examFrequency")}</Label>
                  <Select value={examFrequency} onValueChange={setExamFrequency}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || !name.trim()}
                className="w-full"
              >
                {t("knowledgeGraph.edit.save")}
              </Button>
            </div>

            {/* Relations Section */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-medium text-sm">{t("knowledgeGraph.relations.title")}</h3>

              {/* Existing relations from this KP */}
              {kp.relationsFrom.length > 0 ? (
                <div className="space-y-1">
                  {kp.relationsFrom.map((rel) => (
                    <div
                      key={rel.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {t(`knowledgeGraph.relations.${rel.type}` as never)}
                        </Badge>
                        <span className="text-sm">{rel.toPoint.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive text-xs h-7"
                        onClick={() => handleRemoveRelation(rel.id)}
                        disabled={removeRelationMutation.isPending}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t("knowledgeGraph.empty")}
                </p>
              )}

              {/* Add relation row */}
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{t("knowledgeGraph.relations.add")}</p>

                <div className="space-y-2">
                  <Label className="text-xs">{t("knowledgeGraph.relations.target")}</Label>
                  <Input
                    value={relationSearchQuery}
                    onChange={(e) => {
                      setRelationSearchQuery(e.target.value);
                      setSelectedTargetId("");
                    }}
                    placeholder={t("knowledgeGraph.relations.searchPlaceholder")}
                    className="text-sm"
                  />
                  {relationSearchResults.length > 0 && !selectedTargetId && (
                    <div className="rounded-md border max-h-32 overflow-y-auto">
                      {relationSearchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50"
                          onClick={() => {
                            setSelectedTargetId(item.id);
                            setRelationSearchQuery(item.name);
                            setRelationSearchResults([]);
                          }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t("knowledgeGraph.relations.type")}</Label>
                    <Select
                      value={relationType}
                      onValueChange={(v) => setRelationType(v as RelationType)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["PREREQUISITE", "PARALLEL", "CONTAINS"] as RelationType[]).map(
                          (type) => (
                            <SelectItem key={type} value={type}>
                              {t(`knowledgeGraph.relations.${type}` as never)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddRelation}
                    disabled={!selectedTargetId || addRelationMutation.isPending}
                  >
                    {t("knowledgeGraph.relations.add")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Tab ───

function ImportTab() {
  const t = useTranslations();
  const [bookTitle, setBookTitle] = useState("");
  const [subject, setSubject] = useState<Subject>("MATH");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("JUNIOR");
  const [importing, setImporting] = useState(false);

  const uploadUrlMutation = trpc.knowledgeGraph.getImportUploadUrl.useMutation();
  const startImportMutation = trpc.knowledgeGraph.startImport.useMutation();

  async function handleImport(file: File) {
    if (!bookTitle.trim()) return;
    setImporting(true);
    try {
      // 1. Get presigned URL for PDF upload
      const { url, objectKey } = await uploadUrlMutation.mutateAsync({
        filename: file.name,
      });
      // 2. Upload to MinIO
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      // 3. Enqueue kg-import worker job
      await startImportMutation.mutateAsync({
        fileUrl: objectKey,
        bookTitle,
        subject,
        schoolLevel,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("knowledgeGraph.import.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">{t("knowledgeGraph.import.bookTitle")}</label>
          <input
            type="text"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            placeholder={t("knowledgeGraph.import.bookTitlePlaceholder")}
            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-3">
          <Select value={subject} onValueChange={(v) => setSubject(v as Subject)}>
            <SelectTrigger className="w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY"].map((s) => (
                <SelectItem key={s} value={s}>{t(`subjects.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={schoolLevel} onValueChange={(v) => setSchoolLevel(v as SchoolLevel)}>
            <SelectTrigger className="w-28 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIMARY">{t("knowledgeGraph.primary")}</SelectItem>
              <SelectItem value="JUNIOR">{t("knowledgeGraph.junior")}</SelectItem>
              <SelectItem value="SENIOR">{t("knowledgeGraph.senior")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">{t("knowledgeGraph.import.selectFile")}</label>
          <Input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            disabled={importing || !bookTitle.trim()}
          />
          {!bookTitle.trim() && (
            <p className="text-xs text-muted-foreground">{t("knowledgeGraph.import.fillBookTitleFirst")}</p>
          )}
        </div>
        {importing && (
          <p className="text-sm text-muted-foreground">{t("knowledgeGraph.import.importing")}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Review Tab ───

function ReviewTab({ subject }: { subject: Subject }) {
  const t = useTranslations();
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.knowledgeGraph.list.useQuery({
    subject,
    importStatus: "pending_review",
    page,
    pageSize: 50,
  });

  const batchMutation = trpc.knowledgeGraph.batchUpdateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">
          {t("knowledgeGraph.review.empty")}
        </p>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {data?.total} {t("knowledgeGraph.review.pendingCount")}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => batchMutation.mutate({ ids: items.map((i) => i.id), importStatus: "approved" })}
              >
                {t("knowledgeGraph.review.approveAll")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => batchMutation.mutate({ ids: items.map((i) => i.id), importStatus: "rejected" })}
              >
                {t("knowledgeGraph.review.rejectAll")}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {items.map((kp) => (
              <div key={kp.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                <span className="text-sm">{kp.name}</span>
                <Badge variant="outline" className="text-xs">{t(`knowledgeGraph.difficulty`)} {kp.difficulty}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
