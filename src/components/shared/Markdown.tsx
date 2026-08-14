import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { openUrl } from '@tauri-apps/plugin-opener';

// Convert single \n (not part of \n\n) to markdown hard break (two spaces + \n).
// This ensures every Enter press creates a visible line break, independent of any plugin.
function hardBreaks(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, '  \n');
}

export default function Markdown({ children, showLinkCopy = false }: { children: string; showLinkCopy?: boolean }) {
  const copyLink = (href?: string) => {
    if (!href) return;
    navigator.clipboard.writeText(href).catch(() => {});
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ href, children, ...props }) => (
          <span className={`md-link-row${showLinkCopy ? ' has-copy' : ''}`}>
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
              {children}
            </a>
            {showLinkCopy && href && (
              <button
                type="button"
                className="md-link-copy"
                onClick={e => { e.preventDefault(); e.stopPropagation(); copyLink(href); }}
                title="Copy link"
              >
                copy
              </button>
            )}
          </span>
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
  );
}
