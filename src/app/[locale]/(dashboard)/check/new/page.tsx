"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { trpc } from "@/lib/trpc/client";
import { useUpload, type UploadProgress } from "@/hooks/use-upload";
import { PhotoCapture } from "@/components/homework/photo-capture";
import { PhotoGrid } from "@/components/homework/photo-grid";
import { MAX_IMAGES_PER_SESSION } from "@/lib/domain/validations/upload";
import { toast } from "sonner";

interface QueueItem {
  id: string;
  file: File;
  sortOrder: number;
}

export default function NewCheckPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentUpload, setCurrentUpload] = useState<{
    id: string;
    filename: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    status: "idle",
    progress: 0,
  });
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.homework.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  );

  const deleteImageMutation = trpc.upload.deleteImage.useMutation({
    onSuccess: () => {
      utils.homework.getSession.invalidate({ sessionId: sessionId! });
    },
    onError: () => {
      toast.error(t("error.serverError"));
    },
  });

  const reorderMutation = trpc.homework.updateImageOrder.useMutation({
    onSuccess: () => {
      utils.homework.getSession.invalidate({ sessionId: sessionId! });
    },
  });

  const startRecognition = trpc.homework.startRecognition.useMutation({
    onSuccess: () => {
      router.push(`/check/${sessionId}`);
    },
    onError: () => {
      utils.homework.getSession.invalidate({ sessionId: sessionId! });
      toast.error(t("homework.recognitionFailed"));
    },
  });

  const { upload, uploadProgress: hookProgress, reset } = useUpload({
    sessionId: sessionId!,
    onSuccess: () => {
      utils.homework.getSession.invalidate({ sessionId: sessionId! });
      setCurrentUpload(null);
      processNext();
    },
    onError: (errorKey) => {
      toast.error(t(errorKey));
      setCurrentUpload(null);
      processNext();
    },
  });

  // Sync hook progress to local state
  useEffect(() => {
    setUploadProgress(hookProgress);
  }, [hookProgress]);

  const processNext = useCallback(() => {
    const nextQueue = queueRef.current;
    if (nextQueue.length === 0) {
      processingRef.current = false;
      return;
    }

    const next = nextQueue[0];
    queueRef.current = nextQueue.slice(1);
    setQueue(queueRef.current);

    setCurrentUpload({ id: next.id, filename: next.file.name });
    reset();
    upload(next.file, next.sortOrder);
  }, [upload, reset]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!sessionId) return;

      const currentCount = (session?.images.length ?? 0) + queueRef.current.length + (currentUpload ? 1 : 0);
      const remaining = MAX_IMAGES_PER_SESSION - currentCount;

      const filesToAdd = files.slice(0, remaining);
      if (filesToAdd.length < files.length) {
        toast.warning(t("homework.maxPhotosReached", { max: MAX_IMAGES_PER_SESSION }));
      }

      const newItems: QueueItem[] = filesToAdd.map((file, i) => ({
        id: `upload-${Date.now()}-${i}`,
        file,
        sortOrder: currentCount + i,
      }));

      queueRef.current = [...queueRef.current, ...newItems];
      setQueue(queueRef.current);

      if (!processingRef.current) {
        processingRef.current = true;
        processNext();
      }
    },
    [sessionId, session, currentUpload, processNext, t]
  );

  const handleDelete = useCallback(
    (imageId: string) => {
      deleteImageMutation.mutate({ imageId });
    },
    [deleteImageMutation]
  );

  const handleReorder = useCallback(
    (imageIds: string[]) => {
      if (!sessionId) return;
      reorderMutation.mutate({ sessionId, imageIds });
    },
    [sessionId, reorderMutation]
  );

  if (!sessionId) {
    router.push("/check");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const images = session?.images ?? [];
  const totalCount = images.length + queue.length + (currentUpload ? 1 : 0);
  const maxRemaining = MAX_IMAGES_PER_SESSION - totalCount;
  const isUploading = currentUpload !== null || queue.length > 0;

  // Build uploading items for the grid
  const uploadingItems = [
    ...(currentUpload
      ? [{ id: currentUpload.id, filename: currentUpload.filename, progress: uploadProgress }]
      : []),
    ...queue.map((q) => ({
      id: q.id,
      filename: q.file.name,
      progress: { status: "idle" as const, progress: 0 },
    })),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/check")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">{t("homework.newCheck")}</h1>
        </div>
      </div>

      {/* Photo grid area */}
      <div className="flex-1 overflow-y-auto py-4">
        <PhotoGrid
          sessionId={sessionId}
          images={images.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            originalFilename: img.originalFilename,
            sortOrder: img.sortOrder,
          }))}
          uploadingItems={uploadingItems}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      </div>

      {/* Bottom action bar */}
      <div className="border-t pt-4 space-y-3">
        <PhotoCapture
          onFilesSelected={handleFilesSelected}
          disabled={isUploading && maxRemaining <= 0}
          maxRemaining={maxRemaining}
        />

        {/* Start Recognition / Retry button */}
        {session?.status === "RECOGNITION_FAILED" ? (
          <AdaptiveButton
            className="w-full"
            size="lg"
            variant="destructive"
            disabled={startRecognition.isPending}
            onClick={() => startRecognition.mutate({ sessionId: sessionId! })}
          >
            {startRecognition.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {startRecognition.isPending
              ? t("homework.recognizing")
              : t("homework.retryRecognition")}
          </AdaptiveButton>
        ) : (
          <AdaptiveButton
            className="w-full"
            size="lg"
            disabled={images.length === 0 || isUploading || startRecognition.isPending}
            onClick={() => startRecognition.mutate({ sessionId: sessionId! })}
          >
            {startRecognition.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {startRecognition.isPending
              ? t("homework.recognizing")
              : t("homework.startRecognition")}
          </AdaptiveButton>
        )}
      </div>
    </div>
  );
}
