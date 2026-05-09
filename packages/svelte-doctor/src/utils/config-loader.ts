import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, PACKAGE_JSON_KEY } from "../constants.js";
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

export function loadConfig(root: string): SvelteDoctorConfig {
  const fromFile = readJson<SvelteDoctorConfig>(join(root, CONFIG_FILE_NAME));
  if (fromFile) return fromFile;

  const pkg = readJson<PackageJsonShape>(join(root, "package.json"));
  if (pkg?.[PACKAGE_JSON_KEY]) return pkg[PACKAGE_JSON_KEY];
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
    ignore: {
      rules: merged.ignore?.rules ?? [],
      files: merged.ignore?.files ?? [],
      overrides: merged.ignore?.overrides ?? [],
    },
  };
}
