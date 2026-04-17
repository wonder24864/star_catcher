"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TodayReviewsProps {
  studentId?: string;
}

export function TodayReviews({ studentId }: TodayReviewsProps) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.mastery.todayReviews.useQuery({ studentId });

  // Event-driven refresh — replaces the old 60s refetchInterval.
  // Publishers: mastery.submitReview (self-triggered) and mastery-evaluation
  // worker (Brain-dispatched). Window-focus refetch (React Query default)
  // covers the time-flow edge case where a KP's dueDate crosses 'today'
  // without any DB write.
  trpc.subscription.onMasteryUpdate.useSubscription(
    { studentId },
    {
      onData: () => {
        void utils.mastery.todayReviews.invalidate({ studentId });
      },
    },
  );

  if (isLoading) return null;
  if (!data || data.count === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-muted-foreground">{t("noReviews")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noReviewsSubtext")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{t("todayReviews")}</h2>
            <Badge variant="destructive">{data.count}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/mastery?filter=OVERDUE")}
          >
            {t("viewAll")}
          </Button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("reviewCount", { count: data.count })}
        </p>
        <div className="space-y-2">
          {data.items.slice(0, 5).map((item) => (
            <div
              key={item.knowledgePointId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {item.knowledgePointName}
                </p>
                <Badge variant="outline" className="mt-1 text-xs">
                  {item.subject}
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  router.push(`/mastery?review=${item.knowledgePointId}`)
                }
              >
                {t("startReview")}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
