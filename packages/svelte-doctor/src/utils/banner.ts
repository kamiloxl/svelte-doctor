import pc from "picocolors";
import { SCORE_BAR_WIDTH, VERSION } from "../constants.js";
import type { ProjectInfo, Score, ScoreLabel } from "../types.js";

interface BannerLines {
  art: string[];
  meta: string[];
}

interface FaceVariant {
  cap: string;
  eyes: string;
  mouth: string;
  tint: (s: string) => string;
  hint: string;
}

function variantFor(score: Score | null): FaceVariant {
  if (!score) {
    return {
      cap: "+ + + +",
      eyes: "?   ?",
      mouth: " ___ ",
      tint: pc.dim,
      hint: "no score",
    };
  }
  if (score.score >= 75) {
    return {
      cap: "+ + + +",
      eyes: "o   o",
      mouth: " \\_/ ",
      tint: pc.green,
      hint: "feeling great",
    };
  }
  if (score.score >= 50) {
    return {
      cap: "+ + + +",
      eyes: "-   -",
      mouth: " --- ",
      tint: pc.yellow,
      hint: "needs rest",
    };
  }
  return {
    cap: "+ + + +",
    eyes: "x   x",
    mouth: " /-\\ ",
    tint: pc.red,
    hint: "code red",
  };
}

function paintLabel(label: ScoreLabel): string {
  if (label === "Great") return pc.green(label);
  if (label === "Needs work") return pc.yellow(label);
  return pc.red(label);
}

function renderScoreBar(score: Score, tint: (s: string) => string): string {
  const filled = Math.round((score.score / 100) * SCORE_BAR_WIDTH);
  const empty = SCORE_BAR_WIDTH - filled;
  const bar = "█".repeat(filled) + pc.dim("░".repeat(empty));
  return `${tint(bar)} ${pc.bold(String(score.score))}/100  ${paintLabel(score.label)}`;
}

function formatSvelteVersion(project: ProjectInfo): string {
  const base = `svelte ${project.svelteMajor}`;
  const runes = project.svelteMajor === 5 ? " (runes)" : "";
  if (project.svelteVersionSource === "override") return `${base}${runes} (forced)`;
  if (project.svelteVersionSource === "node_modules") {
    return `${base}${runes} (resolved from node_modules)`;
  }
  if (project.svelteVersionSource === "assumed") {
    return `${base}${runes} (assumed)`;
  }
  return `${base}${runes}`;
}

function buildLines(
  project: ProjectInfo,
  score: Score | null,
  variant: FaceVariant,
): BannerLines {
  const art = [
    "      .------.       ",
    `     /${variant.cap}\\      `,
    `    /  ${variant.eyes}  \\     `,
    `   |   ${variant.mouth}   |    `,
    "    \\          /     ",
    "     '--------'      ",
    "        |  |         ",
    "       _|  |_        ",
  ].map(variant.tint);

  const meta: string[] = [];
  meta.push(
    `${pc.bold("svelte-doctor-cli")} ${pc.dim(`v${VERSION}`)}`,
  );
  meta.push(
    `${project.framework} · ${formatSvelteVersion(project)}${
      project.hasTypeScript ? pc.dim(" · ts") : ""
    }`,
  );
  if (score) {
    meta.push(renderScoreBar(score, variant.tint));
    meta.push(pc.dim(`status: ${variant.hint}`));
  }
  return { art, meta };
}

export function renderDoctorBanner(
  project: ProjectInfo,
  score: Score | null,
): string {
  const variant = variantFor(score);
  const { art, meta } = buildLines(project, score, variant);
  const rows = Math.max(art.length, meta.length);
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const left = art[i] ?? " ".repeat(art[0]?.length ?? 0);
    const right = meta[i] ?? "";
    lines.push(`${left}  ${right}`);
  }
  return lines.join("\n");
}

export function renderAmbulance(): string {
  return pc.red(
    [
      "     ___________________ ",
      "    |  +  |             |",
      "    |_____|     911     |",
      "    |  ___       ___    |",
      "    |_(   )_____(   )___|",
      "       \\_/       \\_/    ",
    ].join("\n"),
  );
}
