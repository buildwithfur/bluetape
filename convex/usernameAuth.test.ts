import { describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  usernameAccountId,
  validateUsername,
  validateUsernamePassword,
} from "./usernameAuth";

describe("username authentication", () => {
  it("normalizes usernames for lookup", () => {
    expect(normalizeUsername("  Maria_Lee ")).toBe("maria_lee");
    expect(usernameAccountId(" Maria_Lee ")).toBe("maria_lee@username.invalid");
  });

  it("accepts valid usernames and rejects unsafe values", () => {
    expect(isValidUsername("maria_lee")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("maria lee")).toBe(false);
    expect(() => validateUsername("maria lee")).toThrow();
  });

  it("requires an eight-character password", () => {
    expect(() => validateUsernamePassword("short")).toThrow();
    expect(() => validateUsernamePassword("long-enough")).not.toThrow();
  });
});
