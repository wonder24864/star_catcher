/**
 * Unit tests: OCR worker maps AI's sourceImageIndex → homeworkImageId.
 *
 * Sprint 17. The worker's resolveImageId closure has three cases:
 *   - valid 0-based index → images[index].id
 *   - undefined / null → images[0].id (AI sometimes omits it on single-image)
 *   - out-of-range index → images[0].id (defensive fallback)
 *
 * The logic is duplicated here to pin the contract. If the worker formula
 * changes, this test should move in lockstep.
 */

import { describe, test, expect } from "vitest";

type Image = { id: string; sortOrder: number };

/** Kept in sync with src/worker/handlers/ocr-recognize.ts. */
function resolveImageId(
  images: Image[],
  idx: number | null | undefined,
): string {
  const i = typeof idx === "number" && idx >= 0 && idx < images.length ? idx : 0;
  return images[i]!.id;
}

describe("OCR worker: sourceImageIndex → homeworkImageId mapping", () => {
  const images: Image[] = [
    { id: "img-a", sortOrder: 0 },
    { id: "img-b", sortOrder: 1 },
    { id: "img-c", sortOrder: 2 },
  ];

  test("maps valid 0-based index to the corresponding image", () => {
    expect(resolveImageId(images, 0)).toBe("img-a");
    expect(resolveImageId(images, 1)).toBe("img-b");
    expect(resolveImageId(images, 2)).toBe("img-c");
  });

  test("falls back to the first image when index is undefined", () => {
    expect(resolveImageId(images, undefined)).toBe("img-a");
  });

  test("falls back to the first image when index is null", () => {
    expect(resolveImageId(images, null)).toBe("img-a");
  });

  test("falls back on negative index", () => {
    expect(resolveImageId(images, -1)).toBe("img-a");
  });

  test("falls back on out-of-range index", () => {
    expect(resolveImageId(images, 99)).toBe("img-a");
    expect(resolveImageId(images, images.length)).toBe("img-a");
  });

  test("single-image session always resolves to its sole image", () => {
    const one: Image[] = [{ id: "solo", sortOrder: 0 }];
    expect(resolveImageId(one, 0)).toBe("solo");
    expect(resolveImageId(one, 7)).toBe("solo");
    expect(resolveImageId(one, undefined)).toBe("solo");
  });
});
