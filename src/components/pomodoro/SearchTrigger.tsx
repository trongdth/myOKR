import { Search } from 'lucide-react';

/**
 * The ⌘K search modal's trigger button, built on the `.search-trigger-btn`
 * base. Labeled form ("Search" + ⌘K badge) for the List toolbar and Done
 * header; `iconOnly` for the Tasks tab strip's compact toggle beside the
 * cycle·week picker. The glyph runs at 15px on every surface — the
 * content-icon rule's dense-trigger exception (design-system.md, Icons).
 */
export default function SearchTrigger({
  className,
  onClick,
  iconOnly = false,
}: {
  className?: string;
  onClick: () => void;
  iconOnly?: boolean;
}) {
  const classes = className ? `search-trigger-btn ${className}` : 'search-trigger-btn';

  if (iconOnly) {
    return (
      <button className={classes} onClick={onClick} aria-label="Search" title="Search">
        <Search size={15} />
      </button>
    );
  }

  return (
    <button className={classes} onClick={onClick}>
      <Search size={15} />
      <span>Search</span>
      <kbd className="cmd-k-badge">⌘K</kbd>
    </button>
  );
}
