import type { WhyRows } from '../../../lib/pace';

/**
 * Why it is behind — the three baseline rows (needed per week / actual
 * average / to finish on target) plus the unlinked-sessions closing note.
 * Rendered only while the selected entity is Behind pace or At risk and the
 * cycle is still open (decisions Q7/Q8) — on pace collapses the column.
 */
interface WhyCardProps {
  rows: WhyRows;
  note: string | null;
}

export default function WhyCard({ rows, note }: WhyCardProps) {
  const unitSuffix = rows.unit ? ` ${rows.unit}` : '';
  return (
    <section className="obj-card-panel obj-why" aria-label="Why it is behind">
      <h3 className="obj-panel-eyebrow">WHY IT IS BEHIND</h3>
      <div className="obj-why-row">
        <span className="obj-why-label">Needed per week</span>
        <span className="obj-why-value">{rows.neededPerWeek}{unitSuffix}</span>
      </div>
      <div className="obj-why-row">
        <span className="obj-why-label">Actual average</span>
        {/* Amber unconditionally (spec literal) — unlike the pills, this row
            is not a health verdict; a fast-late entity still reads amber. */}
        <span className="obj-why-value amber">{rows.actualAverage}{unitSuffix}</span>
      </div>
      <hr className="obj-why-divider" />
      <div className="obj-why-row">
        <span className="obj-why-label">To finish on target</span>
        <span className="obj-why-value cyan">{rows.toFinish}</span>
      </div>
      {note && <p className="obj-why-note">{note}</p>}
    </section>
  );
}
