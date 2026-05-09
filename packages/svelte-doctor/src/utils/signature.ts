// ASCII-only retro signature. Uses the FIGlet "Standard" glyph set so it renders
// identically in every monospace terminal — full-block characters like █ have
// inconsistent width on some macOS fonts (Menlo etc.), causing letters to
// collapse into different shapes.

const ART_LINES = [
  " ____  __     __ _____ _   _____ _____      ____   ___   ____ _____ ___  ____  ",
  "/ ___| \\ \\   / /| ____| | |_   _| ____|    |  _ \\ / _ \\ / ___|_   _/ _ \\|  _ \\ ",
  "\\___ \\  \\ \\ / / |  _| | |   | | |  _|      | | | | | | | |     | || | | | |_) |",
  " ___) |  \\ V /  | |___| |___| | | |___     | |_| | |_| | |___  | || |_| |  _ < ",
  "|____/    \\_/   |_____|_____|_| |_____|    |____/ \\___/ \\____| |_| \\___/|_| \\_\\",
];

const ORANGE_OPEN = "\x1b[38;5;208m";
const ANSI_RESET = "\x1b[0m";

function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export function renderSignature(): string {
  if (colorEnabled()) {
    return ART_LINES.map((line) => `${ORANGE_OPEN}${line}${ANSI_RESET}`).join(
      "\n",
    );
  }
  return ART_LINES.join("\n");
}
