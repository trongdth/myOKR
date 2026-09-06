import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Copy } from 'lucide-react';
import '../../styles/markdown.css';

// GFM task lists emit <input type="checkbox" checked disabled>; the default
// sanitize schema strips inputs, deleting the checkbox state entirely.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'input'],
  attributes: {
    ...defaultSchema.attributes,
    input: ['checked', 'disabled', 'type'],
  },
};

// A task-list li wraps its checkbox directly when tight, but inside a <p>
// when loose (blank line after the list) — so look anywhere below it.
type HastNode = { tagName?: string; children?: readonly unknown[] };

function containsCheckbox(node?: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const el = node as HastNode;
  if (el.tagName === 'input') return true;
  return (el.children ?? []).some(containsCheckbox);
}

// Convert single \n (not part of \n\n) to markdown hard break (two spaces + \n).
// This ensures every Enter press creates a visible line break, independent of any plugin.
function hardBreaks(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, '  \n');
}

// Autolinked URLs render their href as the label — strip the protocol for
// display (anthropic.skilljar.com/…, not https://anthropic.skilljar.com/…).
// Display rule: a link whose label equals its href after the protocol strip
// is presentationally a bare URL (every true autolink is; `[url](url)` is
// indistinguishable from one at the AST level) — it gets the strip and
// truncation. Any other label is author-typed and passes through verbatim,
// whatever it contains.
function stripProtocol(label: string): string {
  return label.replace(/^https?:\/\//i, '');
}

// A bare autolink past URL_LABEL_MAX chars eats whole lines of the notes
// column; middle-truncate its display (start + … + end, keeping the trailing
// fragment) while the href and hover title keep the full URL. 34 + 22 keeps
// the domain plus path head and the id-bearing tail visible.
const URL_LABEL_MAX = 60;
const URL_HEAD = 34;
const URL_TAIL = 22;

function autolinkLabel(
  children: string,
  href?: string,
): { label: string; title?: string } {
  const stripped = stripProtocol(children);
  const isAutolink = !!href && stripProtocol(href) === stripped;
  if (!isAutolink) {
    return { label: children };
  }
  if (stripped.length > URL_LABEL_MAX) {
    return {
      label: `${stripped.slice(0, URL_HEAD)}…${stripped.slice(-URL_TAIL)}`,
      title: stripped,
    };
  }
  return { label: stripped };
}

/** Fenced code block: monospace text on its own surface with one Copy button
 *  top-right for the whole block (never per-line chips). The text comes from
 *  the rendered DOM so sanitization and syntax are already settled. */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const copy = () => {
    const text = preRef.current?.textContent ?? '';
    navigator.clipboard.writeText(text).catch(() => {});
  };
  return (
    <div className="md-code-block">
      <button type="button" className="md-code-copy" onClick={copy} title="Copy code block">
        <Copy size={12} aria-hidden="true" />
        <span>Copy</span>
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
      components={{
        a: ({ href, children, title, node: _node, ...props }) => {
          const { label, title: hoverTitle } =
            typeof children === 'string'
              ? autolinkLabel(children, href)
              : { label: children, title };
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={hoverTitle ?? title}
              onClick={e => {
                e.preventDefault();
                if (href) openUrl(href);
              }}
              {...props}
            >
              {label}
            </a>
          );
        },
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        // Task-list checkboxes are display-only: they show the `- [x]` state;
        // toggling happens by editing the notes (readOnly + disabled). The
        // "why can't I toggle" hint rides on the li — the input is
        // pointer-events: none (click pass-through) and can never be hovered.
        // Loose lists (blank line after) wrap the checkbox in a <p>, so the
        // check looks below the li, not just at direct children.
        li: ({ node, children, ...props }) => (
          <li
            {...props}
            title={containsCheckbox(node) ? 'Read-only — edit notes to toggle' : undefined}
          >
            {children}
          </li>
        ),
        input: ({ checked, node: _node, ...props }) => (
          <input
            {...props}
            type="checkbox"
            checked={!!checked}
            disabled
            readOnly
            title="Read-only — edit notes to toggle"
          />
        ),
        img: ({ alt, src }) => (
          <span className="md-image-placeholder text-xs text-[var(--text-muted)] italic">
            [Image: {alt || src || 'embedded image'}]
          </span>
        ),
      }}
    >
      {hardBreaks(children)}
      </ReactMarkdown>
    </div>
  );
}
