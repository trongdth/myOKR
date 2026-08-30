import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Copy } from 'lucide-react';

// Convert single \n (not part of \n\n) to markdown hard break (two spaces + \n).
// This ensures every Enter press creates a visible line break, independent of any plugin.
function hardBreaks(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, '  \n');
}

// Autolinked URLs render their href as the label — strip the protocol for
// display (anthropic.skilljar.com/…, not https://anthropic.skilljar.com/…).
// Labels the author typed ([text](href)) are never URL-shaped, so they pass
// through untouched.
function stripProtocol(label: string): string {
  return label.replace(/^https?:\/\//i, '');
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => {
              e.preventDefault();
              if (href) openUrl(href);
            }}
            {...props}
          >
            {typeof children === 'string' ? stripProtocol(children) : children}
          </a>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        img: ({ alt, src }) => (
          <span className="md-image-placeholder text-xs text-[var(--text-muted)] italic">
            [Image: {alt || src || 'embedded image'}]
          </span>
        ),
      }}
    >
      {hardBreaks(children)}
    </ReactMarkdown>
  );
}
