"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, FileText, PenLine } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { useTier } from "@/components/providers/grade-tier-provider";
import { toast } from "sonner";

export default function CheckPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);
  const { tierIndex } = useTier();

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;

  const { data: sessions, isLoading } = trpc.homework.listSessions.useQuery(
    { studentId: studentId! },
    { enabled: !!studentId }
  );

  const createSession = trpc.homework.createSession.useMutation({
    onSuccess: (data) => {
      router.push(`/check/new?sessionId=${data.id}`);
    },
    onError: () => {
      toast.error(t("error.serverError"));
    },
  });

  const handleNewCheck = () => {
    if (!studentId) {
      toast.error(t("homework.selectStudent"));
      return;
    }
    createSession.mutate({ studentId });
  };

  if (isParent && !selectedStudentId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("homework.title")}</h1>
        <p className="text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  const listGap = tierIndex === 1 ? "space-y-4" : "space-y-3";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("homework.title")}</h1>
        <div className="flex items-center gap-2">
          <AdaptiveButton
            variant="outline"
            onClick={() => router.push("/check/manual")}
          >
            <PenLine className="h-4 w-4 mr-2" />
            {t("homework.manual.button")}
          </AdaptiveButton>
          <AdaptiveButton onClick={handleNewCheck} disabled={createSession.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {t("homework.newCheck")}
          </AdaptiveButton>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : !sessions || sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3" />
          <p>{t("homework.noSessions")}</p>
        </div>
      ) : (
        <div className={listGap}>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("homework.recentSessions")}
          </h2>
          {sessions.map((s, index) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.25, ease: "easeOut" }}
            >
              <AdaptiveCard
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (s.status === "CREATED" || s.status === "RECOGNITION_FAILED" || s.status === "RECOGNIZING") {
                    router.push(`/check/new?sessionId=${s.id}`);
                  } else {
                    // RECOGNIZED / CHECKING / COMPLETED all go to the canvas page.
                    router.push(`/check/${s.id}`);
                  }
                }}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {s.title || t("homework.untitled")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                        {t("homework.imageCount", {
                          count: (s as Record<string, unknown>)._count
                            ? ((s as Record<string, unknown>)._count as { images: number }).images
                            : 0,
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge variant={s.status === "COMPLETED" ? "default" : "secondary"}>
                    {t(`homework.status.${s.status}`)}
                  </Badge>
                </CardContent>
              </AdaptiveCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
