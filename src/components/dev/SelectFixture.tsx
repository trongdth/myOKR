import { useState } from 'react';
import { CalendarCheck, CalendarRange, ClipboardList, Inbox, Plus, Timer, TrendingUp } from 'lucide-react';
import { Select, type SelectOption } from '../shared/Select';
import '../../styles/select-fixture.css';

type Bucket = 'today' | 'week' | 'backlog';

const BUCKET_OPTIONS: SelectOption<Bucket>[] = [
  { value: 'today', label: 'Today', icon: <CalendarCheck size={14} /> },
  { value: 'week', label: 'This week', icon: <CalendarRange size={14} /> },
  { value: 'backlog', label: 'Backlog', icon: <Inbox size={14} /> },
];

const PRIORITY_OPTIONS: SelectOption<string>[] = [
  { value: 'do', label: 'Do', icon: <span className="fx-dot" style={{ background: 'var(--okr-on-track)' }} /> },
  { value: 'decide', label: 'Decide', icon: <span className="fx-dot" style={{ background: 'var(--color-objective)' }} /> },
  { value: 'delegate', label: 'Delegate', icon: <span className="fx-dot" style={{ background: 'var(--color-risk)' }} /> },
  { value: 'delete', label: 'Delete', icon: <span className="fx-dot" style={{ background: 'var(--okr-not-set)' }} /> },
];

const KR_OPTIONS: SelectOption<string>[] = [
  { value: 'kr-1', label: 'Ship v2 API', trailing: '12' },
  { value: 'kr-2', label: 'Onboard beta users', trailing: '3' },
  { value: 'kr-3', label: 'Cut infra cost by 30%', trailing: '0' },
];

const MODE_OPTIONS: SelectOption<string>[] = [
  { value: 'manual', label: 'Manual', icon: <ClipboardList size={14} /> },
  { value: 'focus', label: 'Focus hours', icon: <Timer size={14} /> },
  { value: 'pomo', label: 'Pomodoros', icon: <TrendingUp size={14} /> },
];

const LONG_OPTIONS: SelectOption<number>[] = Array.from({ length: 25 }, (_, i) => ({
  value: i,
  label: `Option ${i + 1}`,
}));

const HABIT_OPTIONS: SelectOption<string>[] = [
  { value: 'read', label: 'Read 20 minutes' },
  { value: 'meditate', label: 'Meditate' },
  { value: 'gym', label: 'Gym' },
];

/**
 * Dev-only fixture page (?fixture=select) exercising every Select state for
 * the Playwright suite — the component ships before any real screen uses it
 * (ticket .scratch/custom-select/issues/01). Not reachable in prod builds.
 */
export function SelectFixture() {
  const [bucket, setBucket] = useState<Bucket>('week');
  const [priority, setPriority] = useState('do');
  const [plain, setPlain] = useState('Alpha');
  const [habit, setHabit] = useState<string | null>(null);
  const [kr, setKr] = useState<string | null>(null);
  const [long, setLong] = useState(2);
  const [mode, setMode] = useState('manual');
  const [dotOnly, setDotOnly] = useState('do');
  const [cycle, setCycle] = useState('July cycle');
  const [cycles, setCycles] = useState(['May cycle', 'June cycle', 'July cycle']);
  const [disabledChosen, setDisabledChosen] = useState('b');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [modalBucket, setModalBucket] = useState<Bucket>('today');
  const [showModal, setShowModal] = useState(false);

  const log = (entry: string) => setActionLog((l) => [...l, entry]);

  return (
    <div className="fx-page">
      <h1 className="fx-title">Select fixture</h1>

      <section className="fx-section" data-fx="plain">
        <h2 className="fx-heading">Plain boxed</h2>
        <Select
          options={[{ value: 'Alpha', label: 'Alpha' }, { value: 'Beta', label: 'Beta' }, { value: 'Gamma', label: 'Gamma' }]}
          value={plain}
          onChange={setPlain}
          ariaLabel="Plain value"
        />
      </section>

      <section className="fx-section" data-fx="buckets">
        <h2 className="fx-heading">With icons</h2>
        <Select options={BUCKET_OPTIONS} value={bucket} onChange={setBucket} ariaLabel="Bucket" />
      </section>

      <section className="fx-section" data-fx="priority">
        <h2 className="fx-heading">Priority dots</h2>
        <Select options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} ariaLabel="Priority" />
      </section>

      <section className="fx-section" data-fx="habit">
        <h2 className="fx-heading">Clear + action rows</h2>
        <Select
          options={HABIT_OPTIONS}
          value={habit}
          onChange={setHabit}
          placeholder="Link a habit"
          onClear={() => setHabit(null)}
          clearLabel="No habit"
          actions={[{ icon: <Plus size={14} />, label: 'Create new habit…', onSelect: () => log('create-habit') }]}
          ariaLabel="Habit link"
        />
      </section>

      <section className="fx-section" data-fx="kr">
        <h2 className="fx-heading">Trailing counts</h2>
        <Select
          options={KR_OPTIONS}
          value={kr}
          onChange={setKr}
          placeholder="Link a key result"
          onClear={() => setKr(null)}
          clearLabel="No key result"
          ariaLabel="Key result link"
        />
      </section>

      <section className="fx-section" data-fx="long">
        <h2 className="fx-heading">Long list</h2>
        <Select options={LONG_OPTIONS} value={long} onChange={setLong} ariaLabel="Long list" />
      </section>

      <section className="fx-section" data-fx="cycles">
        <h2 className="fx-heading">Remove rows</h2>
        <Select
          options={cycles.map((c) => ({ value: c, label: c }))}
          value={cycle}
          onChange={setCycle}
          onRemove={(removed) => {
            setCycles((cs) => cs.filter((c) => c !== removed));
            // The × never renders on the chosen row, but stay consistent if
            // the removed value ever equals the selection.
            if (cycle === removed) setCycle(cycles.find((c) => c !== removed) ?? '');
          }}
          actions={[{ icon: <Plus size={14} />, label: 'New blank cycle', onSelect: () => log('new-cycle') }]}
          ariaLabel="Cycle"
        />
      </section>

      <section className="fx-section" data-fx="disabled">
        <h2 className="fx-heading">Disabled</h2>
        <Select options={cycles.map((c) => ({ value: c, label: c }))} value={cycle} onChange={setCycle} disabled ariaLabel="Disabled cycle" />
      </section>

      <section className="fx-section" data-fx="disabled-chosen">
        <h2 className="fx-heading">Disabled chosen option</h2>
        <Select
          options={[
            { value: 'a', label: 'Enabled A' },
            { value: 'b', label: 'Disabled chosen', disabled: true },
            { value: 'c', label: 'Enabled C' },
          ]}
          value={disabledChosen}
          onChange={setDisabledChosen}
          ariaLabel="Disabled chosen"
        />
      </section>

      <section className="fx-section" data-fx="empty">
        <h2 className="fx-heading">Empty options</h2>
        <Select options={[]} value={null} onChange={() => {}} placeholder="Link a key result" ariaLabel="Empty" />
      </section>

      <section className="fx-section" data-fx="bare">
        <h2 className="fx-heading">Bare variants</h2>
        <Select options={MODE_OPTIONS} value={mode} onChange={setMode} variant="bare" ariaLabel="KR mode" />
        <Select options={PRIORITY_OPTIONS} value={dotOnly} onChange={setDotOnly} variant="bare" hideTriggerLabel ariaLabel="Priority dot" />
      </section>

      <section className="fx-section" data-fx="modal">
        <h2 className="fx-heading">Inside a modal</h2>
        <button type="button" className="fx-open-modal" onClick={() => setShowModal(true)}>Open modal</button>
        {showModal && (
          <div className="fx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
            <div className="fx-modal-card">
              <h3 className="fx-heading">Modal demo</h3>
              <Select options={BUCKET_OPTIONS} value={modalBucket} onChange={setModalBucket} ariaLabel="Modal bucket" />
            </div>
          </div>
        )}
      </section>

      <section className="fx-section fx-flip" data-fx="flip">
        <h2 className="fx-heading">Bottom edge (flip)</h2>
        <Select options={BUCKET_OPTIONS} value={bucket} onChange={setBucket} ariaLabel="Flip bucket" />
      </section>

      <p className="fx-log" data-fx="log">{actionLog.length > 0 ? actionLog.join(', ') : 'no actions fired'}</p>
    </div>
  );
}

export default SelectFixture;
