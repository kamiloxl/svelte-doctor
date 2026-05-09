import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/utils/config-loader.js";
import { SvelteDoctorError } from "../src/utils/error-handling.js";

describe("validateConfig", () => {
  it("accepts a valid full config", () => {
    const r = validateConfig(
      {
        lint: true,
        deadCode: false,
        failOn: "warning",
        ignore: {
          rules: ["a"],
          files: ["src/**"],
          overrides: [{ files: ["legacy/**"], rules: ["b"] }],
        },
      },
      "test.json",
    );
    expect(r.lint).toBe(true);
    expect(r.failOn).toBe("warning");
    expect(r.ignore?.overrides?.[0].rules).toEqual(["b"]);
  });

  it("rejects ignore.rules as a string", () => {
    expect(() =>
      validateConfig({ ignore: { rules: "not-array" } }, "test.json"),
    ).toThrow(/"ignore.rules" must be string\[\]/);
  });

  it("rejects invalid failOn value", () => {
    expect(() => validateConfig({ failOn: "yes" }, "test.json")).toThrow(
      /"failOn" must be "error" \| "warning" \| "none"/,
    );
  });

  it("rejects non-object root", () => {
    expect(() => validateConfig([1, 2], "test.json")).toThrow(/expected an object, got array/);
  });

  it("rejects malformed overrides entry", () => {
    expect(() =>
      validateConfig(
        { ignore: { overrides: [{ files: "src/legacy" }] } },
        "test.json",
      ),
    ).toThrow(/overrides\[0\]\.files" must be string\[\]/);
  });

  it("attaches actionable hint to SvelteDoctorError", () => {
    try {
      validateConfig({ lint: "yes" }, "test.json");
    } catch (e) {
      expect(e).toBeInstanceOf(SvelteDoctorError);
      expect((e as SvelteDoctorError).hint).toMatch(/Check svelte-doctor-cli.config.json/);
    }
  });
});
