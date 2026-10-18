/** Markup that is already safe (escaped or produced by the sanitising Markdown renderer). */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type Child = string | number | SafeHtml | null | undefined | false | readonly Child[];

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

function append(child: Child, out: string[]): void {
  if (child === null || child === undefined || child === false) return;
  if (child instanceof SafeHtml) out.push(child.value);
  else if (Array.isArray(child)) for (const c of child as readonly Child[]) append(c, out);
  else out.push(escapeHtml(String(child)));
}

/** Template tag: every interpolated value is escaped unless it is SafeHtml. */
export function html(strings: TemplateStringsArray, ...values: Child[]): SafeHtml {
  const out: string[] = [];
  strings.forEach((part, i) => {
    out.push(part);
    if (i < values.length) append(values[i]!, out);
  });
  return new SafeHtml(out.join(""));
}

export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}
