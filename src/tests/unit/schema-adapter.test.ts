/**
 * Unit Tests: Schema Adapter + Bundle Validation
 *
 * Tests Canonical JSON Schema → Provider-specific conversion,
 * manifest/schema validation, and Prisma import detection.
 */
import { describe, test, expect } from "vitest";
import {
  adaptSchema,
  adaptSchemas,
  type OpenAIFunctionTool,
  type AnthropicTool,
} from "@/lib/domain/skill/schema-adapter";
import {
  validateManifest,
  validateSchema,
  checkBundleNoPrisma,
  type CanonicalSkillSchema,
} from "@/lib/domain/skill/bundle";

// ─── Test Data ────────────────────────────────────

const testSchema: CanonicalSkillSchema = {
  name: "diagnose_error",
  description: "Analyze student error patterns",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "Question text" },
      studentAnswer: { type: "string", description: "Student answer" },
      subject: { type: "string", description: "Subject area" },
    },
    required: ["question", "studentAnswer"],
  },
};

// ─── Schema Adapter ───────────────────────────────

describe("Schema Adapter", () => {
  test("converts to OpenAI function tool format", () => {
    const result = adaptSchema(testSchema, "openai") as OpenAIFunctionTool;

    expect(result.type).toBe("function");
    expect(result.function.name).toBe("diagnose_error");
    expect(result.function.description).toBe("Analyze student error patterns");
    expect(result.function.parameters).toHaveProperty("type", "object");
    expect(result.function.parameters).toHaveProperty("properties");
    expect(result.function.parameters).toHaveProperty("additionalProperties", false);
    expect(result.function.strict).toBe(true);
  });

  test("converts to Anthropic Claude tool format", () => {
    const result = adaptSchema(testSchema, "anthropic") as AnthropicTool;

    expect(result.name).toBe("diagnose_error");
    expect(result.description).toBe("Analyze student error patterns");
    expect(result.input_schema).toHaveProperty("type", "object");
    expect(result.input_schema).toHaveProperty("properties");
    // Anthropic format should NOT have additionalProperties or strict
    expect(result).not.toHaveProperty("type");
    expect(result).not.toHaveProperty("strict");
  });

  test("converts to Ollama format (OpenAI-compatible without strict)", () => {
    const result = adaptSchema(testSchema, "ollama") as OpenAIFunctionTool;

    expect(result.type).toBe("function");
    expect(result.function.name).toBe("diagnose_error");
    // Ollama should NOT have strict mode or additionalProperties
    expect(result.function.strict).toBeUndefined();
    expect(result.function.parameters).not.toHaveProperty("additionalProperties");
  });

  test("throws for unsupported provider", () => {
    expect(() =>
      adaptSchema(testSchema, "unsupported" as never),
    ).toThrow("Unsupported provider");
  });

  test("batch converts multiple schemas", () => {
    const schema2: CanonicalSkillSchema = {
      name: "review_schedule",
      description: "Get review schedule",
      parameters: {
        type: "object",
        properties: {
          studentId: { type: "string", description: "Student ID" },
        },
      },
    };

    const results = adaptSchemas([testSchema, schema2], "openai");
    expect(results).toHaveLength(2);
    expect((results[0] as OpenAIFunctionTool).function.name).toBe("diagnose_error");
    expect((results[1] as OpenAIFunctionTool).function.name).toBe("review_schedule");
  });

  test("preserves required array in all formats", () => {
    const openai = adaptSchema(testSchema, "openai") as OpenAIFunctionTool;
    const anthropic = adaptSchema(testSchema, "anthropic") as AnthropicTool;
    const ollama = adaptSchema(testSchema, "ollama") as OpenAIFunctionTool;

    expect(openai.function.parameters).toHaveProperty("required", ["question", "studentAnswer"]);
    expect(anthropic.input_schema).toHaveProperty("required", ["question", "studentAnswer"]);
    expect(ollama.function.parameters).toHaveProperty("required", ["question", "studentAnswer"]);
  });
});

// ─── Manifest Validation ──────────────────────────

describe("Manifest Validation", () => {
  test("validates correct manifest", () => {
    const result = validateManifest({
      name: "diagnose-error",
      version: "1.0.0",
      description: "Test skill",
      author: "system",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.name).toBe("diagnose-error");
      expect(result.data.main).toBe("index.js"); // default
      expect(result.data.timeout).toBe(30000); // default
    }
  });

  test("rejects invalid name (must be kebab-case)", () => {
    const result = validateManifest({
      name: "MySkill",
      version: "1.0.0",
      description: "Test",
      author: "me",
    });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid version (must be semver)", () => {
    const result = validateManifest({
      name: "my-skill",
      version: "1.0",
      description: "Test",
      author: "me",
    });
    expect(result.valid).toBe(false);
  });

  test("rejects timeout out of range", () => {
    const result = validateManifest({
      name: "my-skill",
      version: "1.0.0",
      description: "Test",
      author: "me",
      timeout: 60000, // > 30000
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Schema Validation ────────────────────────────

describe("Schema Validation", () => {
  test("validates correct schema", () => {
    const result = validateSchema({
      name: "diagnose_error",
      description: "Analyze errors",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    });
    expect(result.valid).toBe(true);
  });

  test("rejects invalid name (must be snake_case)", () => {
    const result = validateSchema({
      name: "diagnose-error",
      description: "Test",
      parameters: { type: "object", properties: {} },
    });
    expect(result.valid).toBe(false);
  });

  test("rejects missing parameters.type", () => {
    const result = validateSchema({
      name: "test_skill",
      description: "Test",
      parameters: { properties: {} },
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Prisma Import Detection ──────────────────────

describe("Bundle Prisma Check", () => {
  test("detects require('@prisma/client')", () => {
    const result = checkBundleNoPrisma(`
      const { PrismaClient } = require('@prisma/client');
    `);
    expect(result.clean).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("detects ESM import from @prisma/client", () => {
    const result = checkBundleNoPrisma(`
      import { PrismaClient } from '@prisma/client';
    `);
    expect(result.clean).toBe(false);
  });

  test("passes clean code", () => {
    const result = checkBundleNoPrisma(`
      module.exports.execute = async function(input, ctx) {
        return await ctx.callAI('TEST', { data: input });
      };
    `);
    expect(result.clean).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
