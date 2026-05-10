import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, PACKAGE_JSON_KEY } from "../constants.js";
import { SvelteDoctorError } from "./error-handling.js";
import type { SvelteDoctorConfig } from "../types.js";

interface PackageJsonShape {
  [PACKAGE_JSON_KEY]?: SvelteDoctorConfig;
  svelteDoctor?: SvelteDoctorConfig;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export interface ResolvedConfig extends Required<Omit<SvelteDoctorConfig, "ignore" | "failOn">> {
  ignore: NonNullable<SvelteDoctorConfig["ignore"]>;
  failOn: NonNullable<SvelteDoctorConfig["failOn"]>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateConfig(
  raw: unknown,
  source: string,
): SvelteDoctorConfig {
  if (!isPlainObject(raw)) {
    throw new SvelteDoctorError(
      `${source}: expected an object, got ${Array.isArray(raw) ? "array" : typeof raw}`,
    );
  }

  const errors: string[] = [];
  const out: SvelteDoctorConfig = {};

  if (raw.lint !== undefined) {
    if (typeof raw.lint !== "boolean") errors.push(`${source}: "lint" must be a boolean`);
    else out.lint = raw.lint;
  }
  if (raw.deadCode !== undefined) {
    if (typeof raw.deadCode !== "boolean") errors.push(`${source}: "deadCode" must be a boolean`);
    else out.deadCode = raw.deadCode;
  }
  if (raw.verbose !== undefined) {
    if (typeof raw.verbose !== "boolean") errors.push(`${source}: "verbose" must be a boolean`);
    else out.verbose = raw.verbose;
  }
  if (raw.respectInlineDisables !== undefined) {
    if (typeof raw.respectInlineDisables !== "boolean") {
      errors.push(`${source}: "respectInlineDisables" must be a boolean`);
    } else out.respectInlineDisables = raw.respectInlineDisables;
  }
  if (raw.adoptExistingLintConfig !== undefined) {
    if (typeof raw.adoptExistingLintConfig !== "boolean") {
      errors.push(`${source}: "adoptExistingLintConfig" must be a boolean`);
    } else out.adoptExistingLintConfig = raw.adoptExistingLintConfig;
  }
  if (raw.customRulesOnly !== undefined) {
    if (typeof raw.customRulesOnly !== "boolean") {
      errors.push(`${source}: "customRulesOnly" must be a boolean`);
    } else out.customRulesOnly = raw.customRulesOnly;
  }
  if (raw.failOn !== undefined) {
    if (raw.failOn !== "error" && raw.failOn !== "warning" && raw.failOn !== "none") {
      errors.push(`${source}: "failOn" must be "error" | "warning" | "none"`);
    } else out.failOn = raw.failOn;
  }
  if (raw.ignore !== undefined) {
    if (!isPlainObject(raw.ignore)) {
      errors.push(`${source}: "ignore" must be an object`);
    } else {
      const ignore: NonNullable<SvelteDoctorConfig["ignore"]> = {};
      const r = raw.ignore;
      if (r.rules !== undefined) {
        if (!isStringArray(r.rules)) errors.push(`${source}: "ignore.rules" must be string[]`);
        else ignore.rules = r.rules;
      }
      if (r.files !== undefined) {
        if (!isStringArray(r.files)) errors.push(`${source}: "ignore.files" must be string[]`);
        else ignore.files = r.files;
      }
      if (r.overrides !== undefined) {
        if (!Array.isArray(r.overrides)) {
          errors.push(`${source}: "ignore.overrides" must be an array`);
        } else {
          const overrides: NonNullable<SvelteDoctorConfig["ignore"]>["overrides"] = [];
          for (let i = 0; i < r.overrides.length; i++) {
            const o = r.overrides[i];
            if (!isPlainObject(o)) {
              errors.push(`${source}: "ignore.overrides[${i}]" must be an object`);
              continue;
            }
            if (!isStringArray(o.files)) {
              errors.push(`${source}: "ignore.overrides[${i}].files" must be string[]`);
              continue;
            }
            const entry: { files: string[]; rules?: string[] } = { files: o.files };
            if (o.rules !== undefined) {
              if (!isStringArray(o.rules)) {
                errors.push(`${source}: "ignore.overrides[${i}].rules" must be string[]`);
                continue;
              }
              entry.rules = o.rules;
            }
            overrides.push(entry);
          }
          ignore.overrides = overrides;
        }
      }
      out.ignore = ignore;
    }
  }

  if (errors.length) {
    throw new SvelteDoctorError(errors.join("\n"), {
      hint: "Check svelte-doctor-cli.config.json or the svelteDoctor key in package.json against the schema.",
    });
  }

  return out;
}

export function loadConfig(root: string): SvelteDoctorConfig {
  const filePath = join(root, CONFIG_FILE_NAME);
  const fromFile = readJson<unknown>(filePath);
  if (fromFile !== null) return validateConfig(fromFile, CONFIG_FILE_NAME);

  const pkg = readJson<PackageJsonShape>(join(root, "package.json"));
  const fromPkg = pkg?.[PACKAGE_JSON_KEY];
  if (fromPkg !== undefined) {
    return validateConfig(fromPkg, `package.json#${PACKAGE_JSON_KEY}`);
  }
  return {};
}

export function resolveConfig(
  raw: SvelteDoctorConfig,
  cliOverrides: Partial<SvelteDoctorConfig> = {},
): ResolvedConfig {
  const merged: SvelteDoctorConfig = { ...raw, ...cliOverrides };
  return {
    lint: merged.lint ?? true,
    deadCode: merged.deadCode ?? true,
    verbose: merged.verbose ?? false,
    failOn: merged.failOn ?? "none",
    respectInlineDisables: merged.respectInlineDisables ?? true,
    adoptExistingLintConfig: merged.adoptExistingLintConfig ?? true,
    customRulesOnly: merged.customRulesOnly ?? false,
    ignore: {
      rules: merged.ignore?.rules ?? [],
      files: merged.ignore?.files ?? [],
      overrides: merged.ignore?.overrides ?? [],
    },
  };
}
