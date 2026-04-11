"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

type Tab = "tree" | "import" | "review";
type Subject = "MATH" | "CHINESE" | "ENGLISH" | "PHYSICS" | "CHEMISTRY" | "BIOLOGY" | "HISTORY" | "GEOGRAPHY" | "POLITICS" | "OTHER";
type SchoolLevel = "PRIMARY" | "JUNIOR" | "SENIOR";

export default function KnowledgeGraphPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("tree");
  const [subject, setSubject] = useState<Subject>("MATH");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("JUNIOR");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">{t("knowledgeGraph.title")}</h1>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        {(["tree", "import", "review"] as Tab[]).map((tabKey) => (
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
  const { data, isLoading } = trpc.knowledgeGraph.list.useQuery({
    subject,
    schoolLevel,
    search: search || undefined,
    page,
    pageSize: 30,
  });

  const deleteMutation = trpc.knowledgeGraph.delete.useMutation({
    onSuccess: () => { /* refetch handled by invalidation */ },
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
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive text-xs"
                  onClick={() => deleteMutation.mutate({ id: kp.id })}
                >
                  {t("common.delete")}
                </Button>
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
    </div>
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
      // 3. TODO: Enqueue kg-import job via tRPC mutation (requires queue enqueue endpoint)
      console.log("Uploaded PDF to:", objectKey, { bookTitle, subject, schoolLevel });
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
        <div>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            disabled={importing || !bookTitle.trim()}
            className="text-sm"
          />
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
