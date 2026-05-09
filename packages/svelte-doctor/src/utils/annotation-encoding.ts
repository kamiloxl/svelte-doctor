import type { Diagnostic } from "../types.js";

/** Encode a value used in the message body of a `::level::message` line. */
export function encodeAnnotationData(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/** Encode a `key=value` property in `::level key=value,…::msg`. Properties also need `:` and `,` escaped. */
export function encodeAnnotationProp(value: string): string {
  return encodeAnnotationData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function encodeAnnotation(d: Diagnostic): string {
  const level = d.severity === "error" ? "error" : "warning";
  const props = [
    `file=${encodeAnnotationProp(d.file)}`,
    `line=${d.line}`,
    `col=${d.column}`,
  ];
  if (d.endLine) props.push(`endLine=${d.endLine}`);
  if (d.endColumn) props.push(`endColumn=${d.endColumn}`);
  const message = encodeAnnotationData(`${d.message} (${d.ruleId})`);
  return `::${level} ${props.join(",")}::${message}`;
}
