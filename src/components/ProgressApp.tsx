import { useState, useEffect } from 'react';
import ProgressTabStrip, { ProgressHeader, type ProgressTab } from './progress/ProgressTabStrip';
import Analytics from './pomodoro/Analytics';
import ReviewApp from './ReviewApp';
import { getActiveCycle, type OKRCycle } from '../lib/okr-storage';
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

  return (
    <div className="pomodoro-container progress-shell">
      <div className="progress-shell-inner">
        <ProgressHeader activeCycle={activeCycle} />
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
        {tab === 'weekly-review' && (
          <ReviewApp hideHeader />
        )}
      </div>
    </div>
  );
}
