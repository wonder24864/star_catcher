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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SkillStatus = "DRAFT" | "ACTIVE" | "DISABLED" | "DEPRECATED";

const STATUS_BADGE_VARIANT: Record<
  SkillStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  ACTIVE: "default",
  DISABLED: "secondary",
  DEPRECATED: "destructive",
};

export default function SkillsPage() {
  const t = useTranslations();
  const [statusFilter, setStatusFilter] = useState<SkillStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const pageSize = 20;

  const skillsQuery = trpc.skill.list.useQuery({
    status: statusFilter === "ALL" ? undefined : statusFilter,
    page,
    pageSize,
  });

  const enableMutation = trpc.skill.enable.useMutation({
    onSuccess: () => skillsQuery.refetch(),
  });

  const disableMutation = trpc.skill.disable.useMutation({
    onSuccess: () => skillsQuery.refetch(),
  });

  const skills = skillsQuery.data?.items ?? [];
  const total = skillsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">{t("skills.title")}</h1>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as SkillStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("skills.allStatuses")}</SelectItem>
            <SelectItem value="DRAFT">{t("skills.statusDraft")}</SelectItem>
            <SelectItem value="ACTIVE">{t("skills.statusActive")}</SelectItem>
            <SelectItem value="DISABLED">{t("skills.statusDisabled")}</SelectItem>
            <SelectItem value="DEPRECATED">
              {t("skills.statusDeprecated")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Skill List */}
      {skillsQuery.isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : skills.length === 0 ? (
        <p className="text-muted-foreground">{t("skills.empty")}</p>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {skill.name}{" "}
                    <span className="text-muted-foreground text-sm font-normal">
                      v{skill.version}
                    </span>
                  </CardTitle>
                  <Badge variant={STATUS_BADGE_VARIANT[skill.status as SkillStatus]}>
                    {t(`skills.status${skill.status.charAt(0) + skill.status.slice(1).toLowerCase()}` as Parameters<typeof t>[0])}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3 text-sm">
                  {skill.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex gap-4 text-xs">
                    <span>
                      {t("skills.calls")}: {skill.callCount}
                    </span>
                    <span>
                      {t("skills.avgDuration")}:{" "}
                      {skill.avgDurationMs
                        ? `${Math.round(skill.avgDurationMs)}${t("skills.ms")}`
                        : "-"}
                    </span>
                    <span>
                      {t("skills.author")}: {skill.author ?? "-"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSkillId(skill.id)}
                    >
                      {t("skills.details")}
                    </Button>
                    {skill.status === "ACTIVE" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => disableMutation.mutate({ id: skill.id })}
                        disabled={disableMutation.isPending}
                      >
                        {t("skills.disable")}
                      </Button>
                    ) : skill.status !== "DEPRECATED" ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => enableMutation.mutate({ id: skill.id })}
                        disabled={enableMutation.isPending}
                      >
                        {t("skills.enable")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("common.prev")}
          </Button>
          <span className="text-muted-foreground flex items-center text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}

      {/* Skill Detail Dialog */}
      <SkillDetailDialog
        skillId={selectedSkillId}
        open={!!selectedSkillId}
        onClose={() => setSelectedSkillId(null)}
      />
    </div>
  );
}

// ─── Skill Detail Dialog ─────────────────────────

function SkillDetailDialog({
  skillId,
  open,
  onClose,
}: {
  skillId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const skillQuery = trpc.skill.get.useQuery(
    { id: skillId! },
    { enabled: !!skillId },
  );
  const skill = skillQuery.data;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {skill?.name ?? "..."} v{skill?.version}
          </DialogTitle>
        </DialogHeader>
        {skillQuery.isLoading ? (
          <p>{t("common.loading")}</p>
        ) : skill ? (
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-medium">
                {t("skills.description")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {skill.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  {t("skills.status")}:
                </span>{" "}
                <Badge variant={STATUS_BADGE_VARIANT[skill.status as SkillStatus]}>
                  {skill.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("skills.author")}:
                </span>{" "}
                {skill.author ?? "-"}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("skills.calls")}:
                </span>{" "}
                {skill.callCount}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("skills.avgDuration")}:
                </span>{" "}
                {skill.avgDurationMs
                  ? `${Math.round(skill.avgDurationMs)}${t("skills.ms")}`
                  : "-"}
              </div>
            </div>

            {skill.bundleUrl && (
              <div>
                <h3 className="mb-1 text-sm font-medium">
                  {t("skills.bundleUrl")}
                </h3>
                <code className="text-muted-foreground break-all text-xs">
                  {skill.bundleUrl}
                </code>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-medium">
                {t("skills.schema")}
              </h3>
              <pre className="bg-muted max-h-60 overflow-auto rounded p-3 text-xs">
                {JSON.stringify(skill.functionSchema, null, 2)}
              </pre>
            </div>

            {skill.config &&
              Object.keys(skill.config as Record<string, unknown>).length >
                0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    {t("skills.config")}
                  </h3>
                  <pre className="bg-muted max-h-40 overflow-auto rounded p-3 text-xs">
                    {JSON.stringify(skill.config, null, 2)}
                  </pre>
                </div>
              )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
