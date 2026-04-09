import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, type Context } from "../trpc";
import {
  generateObjectKey,
  getPresignedPutUrl,
  getPresignedGetUrl,
  deleteObject,
} from "@/lib/storage";
import {
  requestPresignedUploadUrlSchema,
  confirmUploadSchema,
  requestPresignedDownloadUrlSchema,
  deleteImageSchema,
  mimeToExtension,
  MAX_IMAGE_SIZE,
  MAX_PDF_SIZE,
  MAX_IMAGES_PER_SESSION,
  ALLOWED_IMAGE_TYPES,
} from "@/lib/validations/upload";

/** Verify the caller owns or is the student of a session. Returns the session. */
async function verifySessionAccess(
  db: Context["db"],
  sessionId: string,
  userId: string
) {
  const session = await db.homeworkSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "SESSION_NOT_FOUND" });
  }
  if (session.createdBy !== userId && session.studentId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return session;
}

export const uploadRouter = router({
  /**
   * Get a presigned PUT URL for direct client-to-MinIO upload.
   */
  getPresignedUploadUrl: protectedProcedure
    .input(requestPresignedUploadUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      // Validate file size based on type
      const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(input.contentType);
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_PDF_SIZE;
      if (input.fileSize > maxSize) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_TOO_LARGE" });
      }

      // Check image count limit
      const imageCount = await ctx.db.homeworkImage.count({
        where: { homeworkSessionId: input.sessionId },
      });
      if (imageCount >= MAX_IMAGES_PER_SESSION) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MAX_IMAGES_REACHED" });
      }

      const ext = mimeToExtension(input.contentType);
      const objectKey = generateObjectKey(ctx.session.userId, input.sessionId, ext);
      const { url } = await getPresignedPutUrl(objectKey, input.contentType);

      return { url, objectKey };
    }),

  /**
   * Confirm a successful upload and create the HomeworkImage record.
   */
  confirmUpload: protectedProcedure
    .input(confirmUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      // Re-check image count to prevent race conditions
      const imageCount = await ctx.db.homeworkImage.count({
        where: { homeworkSessionId: input.sessionId },
      });
      if (imageCount >= MAX_IMAGES_PER_SESSION) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MAX_IMAGES_REACHED" });
      }

      const image = await ctx.db.homeworkImage.create({
        data: {
          homeworkSessionId: input.sessionId,
          imageUrl: input.objectKey,
          originalFilename: input.originalFilename,
          sortOrder: input.sortOrder,
          exifRotation: input.exifRotation,
          privacyStripped: input.privacyStripped,
        },
      });

      return image;
    }),

  /**
   * Get a presigned GET URL for viewing an uploaded image.
   */
  getPresignedDownloadUrl: protectedProcedure
    .input(requestPresignedDownloadUrlSchema)
    .query(async ({ ctx, input }) => {
      const image = await ctx.db.homeworkImage.findUnique({
        where: { id: input.imageId },
        include: { homeworkSession: true },
      });
      if (!image) {
        throw new TRPCError({ code: "NOT_FOUND", message: "IMAGE_NOT_FOUND" });
      }

      const session = image.homeworkSession;
      const userId = ctx.session.userId;

      // Direct access: session creator or student
      const hasDirectAccess = session.createdBy === userId || session.studentId === userId;

      if (!hasDirectAccess) {
        // Parent access: check if parent shares a family with the student
        if (ctx.session.role === "PARENT") {
          const parentFamilies = await ctx.db.familyMember.findMany({
            where: { userId },
            select: { familyId: true },
          });
          const familyIds = parentFamilies.map((f) => f.familyId);

          const studentInFamily = await ctx.db.familyMember.findFirst({
            where: {
              userId: session.studentId,
              familyId: { in: familyIds },
            },
          });

          if (!studentInFamily) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const url = await getPresignedGetUrl(image.imageUrl);
      return { url };
    }),

  /**
   * Delete an image from MinIO and the database.
   */
  deleteImage: protectedProcedure
    .input(deleteImageSchema)
    .mutation(async ({ ctx, input }) => {
      const image = await ctx.db.homeworkImage.findUnique({
        where: { id: input.imageId },
        include: { homeworkSession: true },
      });
      if (!image) {
        throw new TRPCError({ code: "NOT_FOUND", message: "IMAGE_NOT_FOUND" });
      }

      const session = image.homeworkSession;
      if (session.createdBy !== ctx.session.userId && session.studentId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      await deleteObject(image.imageUrl);
      await ctx.db.homeworkImage.delete({ where: { id: input.imageId } });

      return { success: true };
    }),
});
