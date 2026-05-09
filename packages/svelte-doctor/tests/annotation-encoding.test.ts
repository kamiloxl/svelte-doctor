import { describe, expect, it } from "vitest";
import {
  encodeAnnotation,
  encodeAnnotationData,
  encodeAnnotationProp,
} from "../src/utils/annotation-encoding.js";
import type { Diagnostic } from "../src/types.js";

describe("encodeAnnotationData (message body)", () => {
  it("escapes %, CR, LF", () => {
    expect(encodeAnnotationData("a%b\rc\nd")).toBe("a%25b%0Dc%0Ad");
  });
  it("does not escape : or ,", () => {
    expect(encodeAnnotationData("use event:fetch, not bare")).toBe(
      "use event:fetch, not bare",
    );
  });
});

describe("encodeAnnotationProp (key=value pieces)", () => {
  it("escapes :, ,, %, CR, LF", () => {
    expect(encodeAnnotationProp("C:\\path\\with,comma\nlb")).toBe(
      "C%3A\\path\\with%2Ccomma%0Alb",
    );
  });
});

describe("encodeAnnotation (full directive)", () => {
  const diag: Diagnostic = {
    ruleId: "svelte-doctor-cli/x",
    category: "state-effects",
    severity: "error",
    message: "use event:fetch, see https://x.io\nin load",
    file: "C:\\repo\\src\\app.svelte",
    line: 5,
    column: 7,
    endLine: 5,
    endColumn: 12,
  };

  it("emits a properly escaped GitHub Actions directive", () => {
    const out = encodeAnnotation(diag);
    expect(out).toBe(
      "::error file=C%3A\\repo\\src\\app.svelte,line=5,col=7,endLine=5,endColumn=12::use event:fetch, see https://x.io%0Ain load (svelte-doctor-cli/x)",
    );
  });
});
