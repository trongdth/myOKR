import { useMemo } from 'react';
import type { DailyRecord, PomodoroTask } from '../../lib/pomodoro-storage';

interface Props {
  history: DailyRecord[];
  tasks: PomodoroTask[];
  onExport: () => void;
  onClear: () => void;
}

export default function Analytics({ history, tasks, onExport, onClear }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = history.find(r => r.date === today);

  // Streak calculation
  const streak = useMemo(() => {
    let count = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      const rec = history.find(r => r.date === key);
      if (rec && rec.completedPomodoros > 0) {
        count++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [history]);

  // Weekly data (last 7 days)
  const weekData = useMemo(() => {
    const days: { label: string; value: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const rec = history.find(r => r.date === key);
      days.push({ label: dayNames[d.getDay()], value: rec?.completedPomodoros || 0, date: key });
    }
    return days;
  }, [history]);

  const maxWeekValue = Math.max(...weekData.map(d => d.value), 1);

  // Monthly heatmap (last 35 days, 5 weeks)
  const heatmapData = useMemo(() => {
    const cells: { date: string; level: number; future: boolean }[] = [];
    const todayDate = new Date();
    // Start from 34 days ago
    for (let i = 34; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const rec = history.find(r => r.date === key);
      const count = rec?.completedPomodoros || 0;
      let level = 0;
      if (count >= 8) level = 4;
      else if (count >= 5) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;
      cells.push({ date: key, level, future: d > todayDate });
    }
    return cells;
  }, [history]);

  // Totals
  const totalPomodoros = history.reduce((s, r) => s + r.completedPomodoros, 0);
  const totalFocusHours = Math.round(history.reduce((s, r) => s + r.totalFocusMinutes, 0) / 60 * 10) / 10;
  const totalTasksDone = tasks.filter(t => t.isCompleted).length;

  return (
    <div className="analytics-section">
      <div className="analytics-header">
        <h3>📊 Analytics</h3>
        <div className="analytics-actions">
          <button className="btn-sm" onClick={onExport}>Export JSON</button>
          <button className="btn-sm danger" onClick={onClear}>Clear Data</button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🍅</div>
          <div className="stat-value">{todayRecord?.completedPomodoros || 0}</div>
          <div className="stat-label">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-value">{todayRecord?.totalFocusMinutes || 0}m</div>
          <div className="stat-label">Focus Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-value">{totalPomodoros}</div>
          <div className="stat-label">All Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-value">{streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
      </div>

      {/* Weekly bar chart */}
      <div className="chart-container">
        <div className="chart-title">
          Last 7 Days
          {streak > 1 && <span className="streak-badge" style={{ marginLeft: '0.75em' }}>🔥 {streak} days</span>}
        </div>
        <div className="bar-chart">
          {weekData.map(d => (
            <div key={d.date} className="bar-column">
              <span className="bar-value">{d.value || ''}</span>
              <div
                className={`bar${d.value === 0 ? ' empty' : ''}`}
                style={{ height: d.value > 0 ? `${(d.value / maxWeekValue) * 100}%` : undefined }}
              />
              <span className="bar-label">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly heatmap */}
      <div className="heatmap-container">
        <div className="chart-title">Last 5 Weeks</div>
        <div className="heatmap-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="heatmap-day-label">{d}</div>
          ))}
          {heatmapData.map((cell, i) => (
            <div
              key={i}
              className={`heatmap-cell${cell.level ? ` level-${cell.level}` : ''}${cell.future ? ' future' : ''}`}
              title={`${cell.date}: ${cell.level > 0 ? `Level ${cell.level}` : 'No sessions'}`}
            />
          ))}
        </div>
        <div className="heatmap-legend">
          <span>Less</span>
          <div className="heatmap-legend-cell" style={{ background: 'var(--bg-tertiary)' }} />
          <div className="heatmap-legend-cell level-1" style={{ background: 'rgba(6,182,212,0.2)' }} />
          <div className="heatmap-legend-cell level-2" style={{ background: 'rgba(6,182,212,0.4)' }} />
          <div className="heatmap-legend-cell level-3" style={{ background: 'rgba(6,182,212,0.65)' }} />
          <div className="heatmap-legend-cell level-4" style={{ background: 'var(--accent-cyan)' }} />
          <span>More</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="chart-container">
        <div className="chart-title">Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em', textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalFocusHours}h</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Focus</div>
          </div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalPomodoros}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pomodoros</div>
          </div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalTasksDone}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tasks Done</div>
          </div>
        </div>
      </div>

      {/* Task completion report */}
      {tasks.length > 0 && (
        <div className="report-table-container">
          <div className="chart-title">Task Report</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Pomodoros</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const pct = task.estimatedPomodoros > 0 ? Math.round((task.completedPomodoros / task.estimatedPomodoros) * 100) : 0;
                return (
                  <tr key={task.id}>
                    <td style={{ color: 'var(--text-primary)' }}>{task.title}</td>
                    <td>{task.isCompleted ? '✅ Done' : '⏳ Active'}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{task.completedPomodoros}/{task.estimatedPomodoros}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
