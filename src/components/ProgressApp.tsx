import { useState, useEffect } from 'react';
import ProgressTabStrip, { ProgressHeader, formatWeekLabel, type ProgressTab } from './progress/ProgressTabStrip';
import Analytics from './pomodoro/Analytics';
import ReviewApp from './ReviewApp';
import ObjectivesProgressTab from './progress/ObjectivesProgressTab';
import { getActiveCycle, type OKRCycle } from '../lib/okr-storage';
import { getExclusiveCycleMondays } from '../lib/cycle-windows';
import { useSession } from './session/SessionProvider';
import '../styles/progress.css';

interface ProgressAppProps {
  tab: ProgressTab;
}

export default function ProgressApp({ tab }: ProgressAppProps) {
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | 'all' | null>('all');
  const { history, tasks, settings } = useSession();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getActiveCycle()
        .then(c => { if (!cancelled) setActiveCycle(c); })
        .catch(() => { if (!cancelled) setActiveCycle(null); });
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', load);
    };
  }, []);

  // The shared week selector drives the h1 on the Objectives and Weekly
  // review tabs ("Week of 25–31 May"); Analytics keeps its cycle/week header
  // logic. 'all' (the cycle overview) falls back to the current week there.
  const cycleMondays = activeCycle ? getExclusiveCycleMondays(activeCycle) : [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const currentWeekIdx = Math.max(1,
    cycleMondays.findIndex(monday => {
      const end = new Date(`${monday}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      return monday <= todayISO && todayISO <= end.toISOString().slice(0, 10);
    }) + 1
  );
  const selectedMonday = (() => {
    if (cycleMondays.length === 0) return null;
    if (selectedWeek === 'all' || selectedWeek == null) return cycleMondays[currentWeekIdx - 1] ?? cycleMondays[0];
    return cycleMondays[selectedWeek - 1] ?? null;
  })();
  const weekLabel = selectedMonday ? formatWeekLabel(selectedMonday) : undefined;

  // "Continue review" from history: jump the shared selector to the draft's
  // week so the wizard opens on it.
  useEffect(() => {
    const handler = (e: Event) => {
      const weekStart = (e as CustomEvent).detail?.weekStart as string | undefined;
      if (!weekStart || !activeCycle) return;
      const mondays = getExclusiveCycleMondays(activeCycle);
      const idx = mondays.indexOf(weekStart);
      if (idx >= 0) setSelectedWeek(idx + 1);
    };
    window.addEventListener('myokr-review-continue', handler);
    return () => window.removeEventListener('myokr-review-continue', handler);
  }, [activeCycle]);

  return (
    <div className="pomodoro-container progress-shell">
      <div className="progress-shell-inner">
        <ProgressHeader activeCycle={activeCycle} title={tab !== 'analytics' ? weekLabel : undefined} />
        <ProgressTabStrip
          active={tab}
          activeCycle={activeCycle}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
        />
        {tab === 'analytics' && (
          <Analytics
            history={history}
            tasks={tasks}
            settings={settings}
            activeCycle={activeCycle}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
          />
        )}
        {tab === 'objectives-progress' && (
          <ObjectivesProgressTab activeCycle={activeCycle} />
        )}
        {tab === 'weekly-review' && (
          <ReviewApp hideHeader weekMonday={selectedMonday} />
        )}
      </div>
    </div>
  );
}
