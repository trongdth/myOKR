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
            {children}
          </a>
        ),
      }}
    >
      {hardBreaks(children)}
    </ReactMarkdown>
  );
}
