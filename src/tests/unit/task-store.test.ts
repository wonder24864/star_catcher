/**
 * Unit tests: Zustand task-store (ADR-013).
 *
 * Verifies upsert / applyEvent merge precedence / hydrate / remove.
 * The "applyEvent merges over prev" invariant is the trickiest part:
 * optimistic inserts use ephemeral values that must survive when a real
 * SSE event with taskId arrives later.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { useTaskStore, type TaskState } from "@/lib/stores/task-store";

function reset() {
  useTaskStore.setState({ tasksByKey: {} });
}

function makeTask(partial: Partial<TaskState> = {}): TaskState {
  return {
    type: "OCR",
    key: "ocr:s1",
    status: "QUEUED",
    startedAt: 1000,
    updatedAt: 1000,
    ...partial,
  };
}

beforeEach(reset);

describe("upsert", () => {
  test("adds a new entry", () => {
    useTaskStore.getState().upsert(makeTask());
    expect(useTaskStore.getState().tasksByKey["ocr:s1"]).toBeDefined();
  });

  test("replaces an existing entry at the same key", () => {
    useTaskStore.getState().upsert(makeTask({ step: "first" }));
    useTaskStore.getState().upsert(makeTask({ step: "second" }));
    expect(useTaskStore.getState().tasksByKey["ocr:s1"].step).toBe("second");
  });
});

describe("applyEvent", () => {
  test("creates a new entry when none exists", () => {
    useTaskStore.getState().applyEvent({
      key: "help:s1:q1:1",
      type: "HELP",
      status: "RUNNING",
      taskId: "task_abc",
      step: "task.step.help.generating",
    });
    const e = useTaskStore.getState().tasksByKey["help:s1:q1:1"];
    expect(e.taskId).toBe("task_abc");
    expect(e.type).toBe("HELP");
    expect(e.status).toBe("RUNNING");
  });

  test("merges into an existing optimistic entry, preserving originRoute", () => {
    // Optimistic insert — no taskId yet, but originRoute is set
    useTaskStore.getState().upsert(
      makeTask({
        key: "help:s1:q1:1",
        type: "HELP",
        originRoute: "/check/s1/results",
      }),
    );

    // SSE event arrives with the real taskId
    useTaskStore.getState().applyEvent({
      key: "help:s1:q1:1",
      type: "HELP",
      status: "RUNNING",
      taskId: "task_99",
    });

    const e = useTaskStore.getState().tasksByKey["help:s1:q1:1"];
    expect(e.taskId).toBe("task_99");
    expect(e.originRoute).toBe("/check/s1/results"); // preserved!
    expect(e.status).toBe("RUNNING");
  });

  test("updatedAt advances each apply", async () => {
    useTaskStore.getState().applyEvent({ key: "k", status: "QUEUED" });
    const t1 = useTaskStore.getState().tasksByKey.k.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    useTaskStore.getState().applyEvent({ key: "k", status: "RUNNING" });
    const t2 = useTaskStore.getState().tasksByKey.k.updatedAt;
    expect(t2).toBeGreaterThan(t1);
  });
});

describe("hydrate", () => {
  test("replaces entire tasksByKey with server-provided list", () => {
    // Stale client state
    useTaskStore.getState().upsert(makeTask({ key: "stale:1" }));
    useTaskStore.getState().upsert(makeTask({ key: "stale:2" }));

    useTaskStore.getState().hydrate([
      makeTask({ key: "fresh:1", taskId: "t1" }),
      makeTask({ key: "fresh:2", taskId: "t2" }),
    ]);

    const keys = Object.keys(useTaskStore.getState().tasksByKey);
    expect(keys.sort()).toEqual(["fresh:1", "fresh:2"]);
  });

  test("an empty hydrate clears the store", () => {
    useTaskStore.getState().upsert(makeTask());
    useTaskStore.getState().hydrate([]);
    expect(Object.keys(useTaskStore.getState().tasksByKey)).toHaveLength(0);
  });
});

describe("remove", () => {
  test("deletes by key without touching others", () => {
    useTaskStore.getState().upsert(makeTask({ key: "a" }));
    useTaskStore.getState().upsert(makeTask({ key: "b" }));
    useTaskStore.getState().remove("a");
    const keys = Object.keys(useTaskStore.getState().tasksByKey);
    expect(keys).toEqual(["b"]);
  });

  test("removing a missing key is a no-op", () => {
    useTaskStore.getState().upsert(makeTask({ key: "a" }));
    useTaskStore.getState().remove("does-not-exist");
    expect(useTaskStore.getState().tasksByKey.a).toBeDefined();
  });
});

describe("getByKey", () => {
  test("returns the entry or undefined", () => {
    useTaskStore.getState().upsert(makeTask({ key: "a" }));
    expect(useTaskStore.getState().getByKey("a")?.key).toBe("a");
    expect(useTaskStore.getState().getByKey("nope")).toBeUndefined();
  });
});
