/**
 * Unit Tests: School Level Utilities
 *
 * Verifies grade-to-school-level mapping and comparison.
 */
import { describe, test, expect } from "vitest";
import { gradeToSchoolLevel, isLowerSchoolLevel } from "@/lib/domain/school-level";

describe("gradeToSchoolLevel", () => {
  test("maps PRIMARY grades correctly", () => {
    expect(gradeToSchoolLevel("PRIMARY_1")).toBe("PRIMARY");
    expect(gradeToSchoolLevel("PRIMARY_6")).toBe("PRIMARY");
  });

  test("maps JUNIOR grades correctly", () => {
    expect(gradeToSchoolLevel("JUNIOR_1")).toBe("JUNIOR");
    expect(gradeToSchoolLevel("JUNIOR_3")).toBe("JUNIOR");
  });

  test("maps SENIOR grades correctly", () => {
    expect(gradeToSchoolLevel("SENIOR_1")).toBe("SENIOR");
    expect(gradeToSchoolLevel("SENIOR_3")).toBe("SENIOR");
  });
});

describe("isLowerSchoolLevel", () => {
  test("PRIMARY is lower than JUNIOR", () => {
    expect(isLowerSchoolLevel("PRIMARY", "JUNIOR")).toBe(true);
  });

  test("PRIMARY is lower than SENIOR", () => {
    expect(isLowerSchoolLevel("PRIMARY", "SENIOR")).toBe(true);
  });

  test("JUNIOR is lower than SENIOR", () => {
    expect(isLowerSchoolLevel("JUNIOR", "SENIOR")).toBe(true);
  });

  test("same level returns false", () => {
    expect(isLowerSchoolLevel("PRIMARY", "PRIMARY")).toBe(false);
    expect(isLowerSchoolLevel("JUNIOR", "JUNIOR")).toBe(false);
    expect(isLowerSchoolLevel("SENIOR", "SENIOR")).toBe(false);
  });

  test("higher level returns false", () => {
    expect(isLowerSchoolLevel("JUNIOR", "PRIMARY")).toBe(false);
    expect(isLowerSchoolLevel("SENIOR", "PRIMARY")).toBe(false);
    expect(isLowerSchoolLevel("SENIOR", "JUNIOR")).toBe(false);
  });
});
