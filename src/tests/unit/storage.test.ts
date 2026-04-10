/**
 * Unit Tests: Storage Service
 * Tests generateObjectKey and module exports.
 */
import { describe, test, expect } from "vitest";
import { generateObjectKey } from "@/lib/infra/storage";

describe("Storage Service", () => {
  describe("generateObjectKey", () => {
    test("returns correct format: homework/{userId}/{sessionId}/{uuid}.{ext}", () => {
      const key = generateObjectKey("user123", "session456", "jpg");
      expect(key).toMatch(/^homework\/user123\/session456\/[a-f0-9-]+\.jpg$/);
    });

    test("normalizes extension to lowercase", () => {
      const key = generateObjectKey("user1", "sess1", "PNG");
      expect(key).toMatch(/\.png$/);
    });

    test("strips leading dot from extension", () => {
      const key = generateObjectKey("user1", "sess1", ".jpeg");
      expect(key).toMatch(/\.jpeg$/);
    });

    test("generates unique keys for same inputs", () => {
      const key1 = generateObjectKey("user1", "sess1", "jpg");
      const key2 = generateObjectKey("user1", "sess1", "jpg");
      expect(key1).not.toBe(key2);
    });
  });
});
