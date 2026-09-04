import { useState, useEffect, useMemo } from 'react';
import {
  getLocalDateString,
  computeFocusStreak,
  type DailyRecord,
  type PomodoroTask,
  type PomodoroSettings,
  DEFAULT_SETTINGS,
} from '../../lib/pomodoro-storage';
import {
  loadObjectives,
  loadKeyResults,
  getWeekEndFromStart,
  type Objective,
  type KeyResult,
  type OKRCycle,
} from '../../lib/okr-storage';
import { getDailyPomodoroBudget, DAILY_FOCUS_MINUTES } from '../../lib/today-focus';
import { computeBestFocusWindow } from '../../lib/best-focus-window';
import { getExclusiveCycleMondays } from '../../lib/cycle-windows';
import { getMondayOf } from '../../lib/habit-storage';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekDateSpan(mondayStr: string, sundayStr: string): string {
  const [, mm, md] = mondayStr.split('-').map(Number);
  const [, sm, sd] = sundayStr.split('-').map(Number);
  const mMonth = MONTHS_SHORT[mm - 1];
  const sMonth = MONTHS_SHORT[sm - 1];

  if (mm === sm) {
    return `${md}–${sd} ${mMonth}`;
  }
  return `${md} ${mMonth} – ${sd} ${sMonth}`;
}

function formatDuration(minutes: number): { hours: number; remMinutes: number; text: string } {
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  let text = '';
  if (hours > 0 && remMinutes > 0) {
    text = `${hours}h ${remMinutes}m`;
  } else if (hours > 0) {
    text = `${hours}h`;
  } else {
    text = `${remMinutes}m`;
  }
  return { hours, remMinutes, text };
}

function formatWeekTooltip(w: {
  mondayStr: string;
  sundayStr: string;
  isUnstarted: boolean;
  sessions: number;
  minutes: number;
}): string {
  const span = formatWeekDateSpan(w.mondayStr, w.sundayStr);
  if (w.isUnstarted) {
    return `${span} · Not started yet`;
  }
  const dur = formatDuration(w.minutes);
  return `${span} · ${w.sessions} ${w.sessions === 1 ? 'session' : 'sessions'} · ${dur.text}`;
}

interface Props {
  history: DailyRecord[];
  tasks: PomodoroTask[];
  settings?: PomodoroSettings;
  activeCycle?: OKRCycle | null;
  selectedWeek?: number | 'all' | null;
  onSelectWeek?: (week: number | 'all') => void;
}

export default function Analytics({
  history,
  tasks,
  settings = DEFAULT_SETTINGS,
  activeCycle = null,
  selectedWeek = null,
  onSelectWeek,
}: Props) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [objs, krs] = await Promise.all([loadObjectives(), loadKeyResults()]);
      if (!cancelled) {
        setObjectives(objs);
        setKeyResults(krs);
      }
    };
    void load();
    const handleSync = () => { void load(); };
    window.addEventListener('myokr-data-synced', handleSync);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', handleSync);
    };
  }, []);

  const today = getLocalDateString();
  const todayRecord = useMemo(() => history.find(r => r.date === today), [history, today]);
  const todaySessions = todayRecord?.completedPomodoros || 0;
  const todayMinutes = todayRecord?.totalFocusMinutes || 0;

  // Daily budget
  const dailyBudget = useMemo(() => getDailyPomodoroBudget(settings), [settings]);
  const dailyGoalMinutes = dailyBudget * (settings.focusDuration || 25);
  const dailyGoalHours = Math.round((dailyGoalMinutes / 60) * 10) / 10;
  const percentOfGoal = Math.min(100, Math.round((todayMinutes / (dailyGoalMinutes || DAILY_FOCUS_MINUTES)) * 100));

  // Streak
  const streakInfo = useMemo(() => computeFocusStreak(history), [history]);

  // Rolling 6-day baseline (past 6 days excluding today)
  const { avgSessionsRolling, avgMinutesRolling, sparklineData } = useMemo(() => {
    let sumSessions = 0;
    let sumMinutes = 0;
    const sparkline: { date: string; value: number; isToday: boolean }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = getLocalDateString(d);
      const isCurrentDay = key === today;
      const rec = history.find(r => r.date === key);
      const val = rec?.completedPomodoros || 0;
      sparkline.push({ date: key, value: val, isToday: isCurrentDay });

      if (!isCurrentDay) {
        sumSessions += val;
        sumMinutes += rec?.totalFocusMinutes || 0;
      }
    }

    return {
      avgSessionsRolling: Math.round(sumSessions / 6),
      avgMinutesRolling: Math.round(sumMinutes / 6),
      sparklineData: sparkline,
    };
  }, [history, today]);

  const diffSessions = todaySessions - avgSessionsRolling;
  const diffMinutes = todayMinutes - avgMinutesRolling;
  const maxSparklineVal = Math.max(...sparklineData.map(d => d.value), 1);

  // All time totals
  const totalSessions = useMemo(() => history.reduce((s, r) => s + (r.completedPomodoros || 0), 0), [history]);
  const totalFocusMinutes = useMemo(() => history.reduce((s, r) => s + (r.totalFocusMinutes || 0), 0), [history]);
  const { hours: totalHours, remMinutes } = formatDuration(totalFocusMinutes);

  const earliestDateLabel = useMemo(() => {
    const activeRecords = history
      .filter(r => (r.completedPomodoros || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (activeRecords.length === 0) return null;
    const [y, m, d] = activeRecords[0].date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return `${dateObj.getDate()} ${MONTHS_SHORT[dateObj.getMonth()]}`;
  }, [history]);

  // Selected week date range for SESSIONS PER DAY
  const weekDaysData = useMemo(() => {
    let mondayDate: Date;

    if (activeCycle && typeof selectedWeek === 'number') {
      const cycleMondays = getExclusiveCycleMondays(activeCycle);
      const targetMondayStr = cycleMondays[selectedWeek - 1] || cycleMondays[0];
      const [y, m, d] = targetMondayStr.split('-').map(Number);
      mondayDate = new Date(y, m - 1, d);
    } else {
      mondayDate = new Date(getMondayOf(new Date()) + 'T00:00:00');
    }

    const days: { label: string; date: string; value: number; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(mondayDate);
      current.setDate(mondayDate.getDate() + i);
      const key = getLocalDateString(current);
      const rec = history.find(r => r.date === key);
      days.push({
        label: WEEKDAYS[i],
        date: key,
        value: rec?.completedPomodoros || 0,
        isToday: key === today,
      });
    }
    return days;
  }, [activeCycle, selectedWeek, history, today]);

  const isCycleView = selectedWeek === 'all' || (selectedWeek == null && !!activeCycle);
  const weeklyGoal = dailyBudget * 7;

  // Weekly aggregation for SESSIONS PER WEEK when isCycleView is true
  const cycleWeeksData = useMemo(() => {
    if (!activeCycle) return [];
    const cycleMondays = getExclusiveCycleMondays(activeCycle);

    return cycleMondays.map((mondayStr, idx) => {
      const weekNum = idx + 1;
      const sundayStr = getWeekEndFromStart(mondayStr);

      const isUnstarted = mondayStr > today;
      const isCompleted = sundayStr < today;
      const isInProgress = mondayStr <= today && today <= sundayStr;

      let weekSessions = 0;
      let weekMinutes = 0;

      if (!isUnstarted) {
        for (const r of history) {
          if (r.date >= mondayStr && r.date <= sundayStr) {
            weekSessions += r.completedPomodoros || 0;
            weekMinutes += r.totalFocusMinutes || 0;
          }
        }
      }

      return {
        weekNum,
        label: `W${weekNum}`,
        mondayStr,
        sundayStr,
        isUnstarted,
        isCompleted,
        isInProgress,
        sessions: weekSessions,
        minutes: weekMinutes,
      };
    });
  }, [activeCycle, history, today]);

  // Tallest completed week (only completed weeks with sessions > 0 compete)
  const maxCompletedSessions = useMemo(() => {
    let max = 0;
    for (const w of cycleWeeksData) {
      if (w.isCompleted && w.sessions > max) {
        max = w.sessions;
      }
    }
    return max;
  }, [cycleWeeksData]);

  const maxCycleWeekVal = Math.max(weeklyGoal, ...cycleWeeksData.map(w => w.sessions), 1);
  const weeklyGoalLinePercent = Math.min(100, Math.max(0, (weeklyGoal / maxCycleWeekVal) * 100));

  // Dynamic caption below baseline for cycle view
  const cycleCaption = useMemo(() => {
    if (!isCycleView) return null;
    const unstarted = cycleWeeksData.filter(w => w.isUnstarted);
    if (unstarted.length === 0) {
      const allCompleted = cycleWeeksData.length > 0 && cycleWeeksData.every(w => w.isCompleted);
      return allCompleted
        ? 'One bar per cycle week · all weeks completed'
        : 'One bar per cycle week · all weeks underway';
    }
    const labels = unstarted.map(w => `W${w.weekNum}`).join(', ');
    const verb = unstarted.length === 1 ? 'has' : 'have';
    return `One bar per cycle week · ${labels} ${verb} not started · dashed means not yet, not zero`;
  }, [isCycleView, cycleWeeksData]);

  // Cycle totals and date boundaries
  const cycleStart = cycleWeeksData[0]?.mondayStr;
  const cycleEnd = cycleWeeksData[cycleWeeksData.length - 1]?.sundayStr;

  const { cycleSessions, cycleMinutes } = useMemo(() => {
    let s = 0;
    let m = 0;
    for (const w of cycleWeeksData) {
      s += w.sessions;
      m += w.minutes;
    }
    return { cycleSessions: s, cycleMinutes: m };
  }, [cycleWeeksData]);

  const { hours: cycleHours, remMinutes: cycleRemMinutes } = formatDuration(cycleMinutes);

  // Previous cycle comparison baseline
  const { hasPrevCycleData, diffCycleSessions, diffCycleMinutes } = useMemo(() => {
    if (!activeCycle) return { hasPrevCycleData: false, diffCycleSessions: 0, diffCycleMinutes: 0 };

    const prevMonth = activeCycle.month === 0 ? 11 : activeCycle.month - 1;
    const prevYear = activeCycle.month === 0 ? activeCycle.year - 1 : activeCycle.year;
    const prevMondays = getExclusiveCycleMondays({ month: prevMonth, year: prevYear });

    if (prevMondays.length === 0) {
      return { hasPrevCycleData: false, diffCycleSessions: 0, diffCycleMinutes: 0 };
    }

    const prevStart = prevMondays[0];
    const prevEnd = getWeekEndFromStart(prevMondays[prevMondays.length - 1]);

    let prevSessions = 0;
    let prevMinutes = 0;
    let recordCount = 0;

    for (const r of history) {
      if (r.date >= prevStart && r.date <= prevEnd) {
        prevSessions += r.completedPomodoros || 0;
        prevMinutes += r.totalFocusMinutes || 0;
        recordCount++;
      }
    }

    if (recordCount === 0) {
      return { hasPrevCycleData: false, diffCycleSessions: 0, diffCycleMinutes: 0 };
    }

    return {
      hasPrevCycleData: true,
      diffCycleSessions: cycleSessions - prevSessions,
      diffCycleMinutes: cycleMinutes - prevMinutes,
    };
  }, [activeCycle, history, cycleSessions, cycleMinutes]);

  const formattedCycleMinutesDiff = useMemo(() => {
    const absDiff = Math.abs(diffCycleMinutes);
    const sign = diffCycleMinutes > 0 ? '+' : '-';
    const dur = formatDuration(absDiff);
    return `${sign}${dur.text}`;
  }, [diffCycleMinutes]);

  // Single week mode calculations
  const isWeekView = typeof selectedWeek === 'number';
  const { selectedWeekSessions, selectedWeekMinutes, selectedWeekStreak } = useMemo(() => {
    if (!isWeekView) return { selectedWeekSessions: 0, selectedWeekMinutes: 0, selectedWeekStreak: { current: 0, best: 0 } };
    const dateSet = new Set(weekDaysData.map(d => d.date));
    let s = 0;
    let m = 0;
    for (const d of weekDaysData) {
      s += d.value;
    }
    const weekRecords = history.filter(r => dateSet.has(r.date));
    for (const r of weekRecords) {
      m += r.totalFocusMinutes || 0;
    }
    return {
      selectedWeekSessions: s,
      selectedWeekMinutes: m,
      selectedWeekStreak: computeFocusStreak(weekRecords),
    };
  }, [isWeekView, weekDaysData, history]);

  const { hours: selectedWeekHours, remMinutes: selectedWeekRemMinutes } = formatDuration(selectedWeekMinutes);
  const weeklyGoalMinutes = weeklyGoal * (settings.focusDuration || 25);
  const weeklyGoalHours = Math.round((weeklyGoalMinutes / 60) * 10) / 10;
  const percentOfWeeklyGoal = Math.min(100, Math.round((selectedWeekMinutes / (weeklyGoalMinutes || 1)) * 100));

  // Previous week comparison for week view
  const prevWeekData = useMemo(() => {
    if (typeof selectedWeek !== 'number' || selectedWeek <= 1) return null;
    return cycleWeeksData[selectedWeek - 2] || null;
  }, [selectedWeek, cycleWeeksData]);

  const diffPrevWeekSessions = prevWeekData ? selectedWeekSessions - prevWeekData.sessions : null;
  const diffPrevWeekMinutes = prevWeekData ? selectedWeekMinutes - prevWeekData.minutes : null;

  // Cycle target and progress
  const totalCycleWeeks = cycleWeeksData.length || 5;
  const cycleGoalMinutes = weeklyGoal * (settings.focusDuration || 25) * totalCycleWeeks;
  const cycleGoalHours = Math.round((cycleGoalMinutes / 60) * 10) / 10;
  const percentOfCycleGoal = Math.min(100, Math.round((cycleMinutes / (cycleGoalMinutes || 1)) * 100));

  // Best streak in cycle
  const cycleStreakInfo = useMemo(() => {
    if (!cycleStart || !cycleEnd) return { current: 0, best: 0 };
    const cycleRecords = history.filter(r => r.date >= cycleStart && r.date <= cycleEnd);
    return computeFocusStreak(cycleRecords);
  }, [history, cycleStart, cycleEnd]);

  // Card 1 mini sparkline data for cycle view
  const maxCycleSparklineVal = Math.max(...cycleWeeksData.map(w => w.sessions), 1);

  const maxWeekDayVal = Math.max(dailyBudget, ...weekDaysData.map(d => d.value), 1);
  const goalLinePercent = Math.min(100, Math.max(0, (dailyBudget / maxWeekDayVal) * 100));

  // LAST 5 WEEKS (35 days ending Sunday of this week)
  const heatmapData = useMemo(() => {
    const cells: { date: string; level: number; future: boolean; count: number }[] = [];
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

    // Start 4 weeks prior to this week's Monday (total 5 weeks = 35 days)
    const startMonday = new Date(now);
    startMonday.setHours(0, 0, 0, 0);
    startMonday.setDate(startMonday.getDate() - daysToMonday - 28);

    for (let i = 0; i < 35; i++) {
      const d = new Date(startMonday);
      d.setDate(startMonday.getDate() + i);
      const key = getLocalDateString(d);
      const rec = history.find(r => r.date === key);
      const count = rec?.completedPomodoros || 0;

      let level = 0;
      if (count >= 8) level = 4;
      else if (count >= 5) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      cells.push({
        date: key,
        level,
        future: key > today,
        count,
      });
    }
    return cells;
  }, [history, today]);

  // WHERE YOUR FOCUS WENT
  // Calculate distribution of completed sessions across active cycle objectives
  const { objectiveBreakdown, unlinkedCount, totalPeriodSessions, dormantObjective } = useMemo(() => {
    const cycleObjs = activeCycle ? objectives.filter(o => o.cycleId === activeCycle.id) : objectives;

    let relevantDates: Set<string> | null = null;
    if (!isCycleView) {
      relevantDates = new Set(weekDaysData.map(d => d.date));
    } else if (cycleStart && cycleEnd) {
      relevantDates = new Set();
      for (const r of history) {
        if (r.date >= cycleStart && r.date <= cycleEnd) {
          relevantDates.add(r.date);
        }
      }
    }

    const sessionCountsByObj = new Map<string, number>();
    let unlinked = 0;
    let periodTotal = 0;

    // Last session date per objective across all history (for dormant alert)
    const lastSessionByObj = new Map<string, string>();

    // Build task -> objId index map for fast resolution
    const taskToObjMap = new Map<string, string>();
    for (const t of tasks) {
      if (t.keyResultId) {
        const kr = keyResults.find(k => k.id === t.keyResultId);
        if (kr?.objectiveId) {
          taskToObjMap.set(t.id, kr.objectiveId);
        }
      }
    }

    for (const r of history) {
      const isPeriod = !relevantDates || relevantDates.has(r.date);
      for (const s of r.sessions || []) {
        if (!s.completed) continue;
        const objId = s.taskId ? taskToObjMap.get(s.taskId) : undefined;

        if (objId) {
          const currentLatest = lastSessionByObj.get(objId);
          if (!currentLatest || r.date > currentLatest) {
            lastSessionByObj.set(objId, r.date);
          }
          if (isPeriod) {
            sessionCountsByObj.set(objId, (sessionCountsByObj.get(objId) || 0) + 1);
            periodTotal++;
          }
        } else if (isPeriod) {
          unlinked++;
          periodTotal++;
        }
      }
    }

    const breakdown = cycleObjs.map(obj => {
      const count = sessionCountsByObj.get(obj.id) || 0;
      const pct = periodTotal > 0 ? Math.round((count / periodTotal) * 100) : 0;
      return {
        id: obj.id,
        title: obj.title,
        count,
        pct,
      };
    }).sort((a, b) => b.count - a.count);

    // Dormant objective alert: find active objective with 0 sessions in >= 14 days
    let dormant: { title: string; weeks: number } | null = null;
    const todayMs = new Date(today).getTime();

    for (const obj of cycleObjs) {
      const lastDate = lastSessionByObj.get(obj.id);
      let daysInactive = 0;
      if (lastDate) {
        daysInactive = Math.floor((todayMs - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      } else if (obj.createdAt) {
        daysInactive = Math.floor((todayMs - new Date(obj.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      }
      if (daysInactive >= 14) {
        const weeks = Math.max(2, Math.floor(daysInactive / 7));
        if (!dormant || weeks > dormant.weeks) {
          dormant = { title: obj.title, weeks };
        }
      }
    }

    return {
      objectiveBreakdown: breakdown,
      unlinkedCount: unlinked,
      totalPeriodSessions: periodTotal,
      dormantObjective: dormant,
    };
  }, [activeCycle, objectives, keyResults, tasks, history, weekDaysData, selectedWeek, today, cycleStart, cycleEnd]);

  const unlinkedPct = totalPeriodSessions > 0
    ? Math.round((unlinkedCount / totalPeriodSessions) * 100)
    : 0;

  // BEST TIME TO FOCUS
  // Group sessions from the last 30 calendar days into 2-hour windows
  const bestTimeStats = useMemo(() => computeBestFocusWindow(history), [history]);

  // Metric Cards Presentation ViewModel
  const cardMetrics = useMemo(() => {
    if (isCycleView) {
      return {
        card1: {
          label: 'Sessions this cycle',
          value: cycleSessions,
          badge: hasPrevCycleData
            ? (diffCycleSessions !== 0
                ? { text: (diffCycleSessions > 0 ? `+${diffCycleSessions}` : `${diffCycleSessions}`) + ' vs last cycle', cls: diffCycleSessions > 0 ? 'positive' : 'negative' }
                : { text: '0 vs last cycle', cls: 'neutral' })
            : { text: '— vs last cycle', cls: 'neutral' },
          sparklineType: 'cycle' as const,
        },
        card2: {
          label: 'Focus time this cycle',
          hours: cycleHours,
          remMinutes: cycleRemMinutes,
          totalMinutes: cycleMinutes,
          badge: hasPrevCycleData
            ? (diffCycleMinutes !== 0
                ? { text: `${formattedCycleMinutesDiff} vs last cycle`, cls: diffCycleMinutes > 0 ? 'positive' : 'negative' }
                : { text: '0m vs last cycle', cls: 'neutral' })
            : { text: '— vs last cycle', cls: 'neutral' },
          percent: percentOfCycleGoal,
          subtext: `${percentOfCycleGoal}% of your ${cycleGoalHours}h cycle goal`,
        },
        card3: {
          label: 'Best streak in cycle',
          value: cycleStreakInfo.best,
          unit: cycleStreakInfo.best === 1 ? 'day' : 'days',
          subtext: `Personal best is ${streakInfo.best} ${streakInfo.best === 1 ? 'day' : 'days'} all-time`,
        },
      };
    }

    if (isWeekView) {
      const formattedWeekDiff = diffPrevWeekMinutes !== null ? formatDuration(Math.abs(diffPrevWeekMinutes)).text : '';
      return {
        card1: {
          label: 'Sessions this week',
          value: selectedWeekSessions,
          badge: diffPrevWeekSessions !== null
            ? (diffPrevWeekSessions !== 0
                ? { text: (diffPrevWeekSessions > 0 ? `+${diffPrevWeekSessions}` : `${diffPrevWeekSessions}`) + ' vs last week', cls: diffPrevWeekSessions > 0 ? 'positive' : 'negative' }
                : { text: '0 vs last week', cls: 'neutral' })
            : { text: '— vs last week', cls: 'neutral' },
          sparklineType: 'week' as const,
        },
        card2: {
          label: 'Focus time this week',
          hours: selectedWeekHours,
          remMinutes: selectedWeekRemMinutes,
          totalMinutes: selectedWeekMinutes,
          badge: diffPrevWeekMinutes !== null
            ? (diffPrevWeekMinutes !== 0
                ? { text: (diffPrevWeekMinutes > 0 ? `+${formattedWeekDiff}` : `-${formattedWeekDiff}`) + ' vs last week', cls: diffPrevWeekMinutes > 0 ? 'positive' : 'negative' }
                : { text: '0m vs last week', cls: 'neutral' })
            : { text: '— vs last week', cls: 'neutral' },
          percent: percentOfWeeklyGoal,
          subtext: `${percentOfWeeklyGoal}% of your ${weeklyGoalHours}h weekly goal`,
        },
        card3: {
          label: 'Best streak this week',
          value: selectedWeekStreak.best,
          unit: selectedWeekStreak.best === 1 ? 'day' : 'days',
          subtext: `Personal best is ${streakInfo.best} ${streakInfo.best === 1 ? 'day' : 'days'}`,
        },
      };
    }

    // Default daily fallback (e.g. no active cycle)
    return {
      card1: {
        label: 'Sessions today',
        value: todaySessions,
        badge: diffSessions !== 0
          ? { text: (diffSessions > 0 ? `+${diffSessions}` : `${diffSessions}`) + ' vs avg', cls: diffSessions > 0 ? 'positive' : 'negative' }
          : { text: 'on avg', cls: 'neutral' },
        sparklineType: 'day' as const,
      },
      card2: {
        label: 'Focus time today',
        hours: 0,
        remMinutes: todayMinutes,
        totalMinutes: todayMinutes,
        badge: diffMinutes !== 0
          ? { text: (diffMinutes > 0 ? `+${diffMinutes}m` : `${diffMinutes}m`) + ' vs avg', cls: diffMinutes > 0 ? 'positive' : 'negative' }
          : { text: 'on avg', cls: 'neutral' },
        percent: percentOfGoal,
        subtext: `${percentOfGoal}% of your ${dailyGoalHours}h daily goal`,
      },
      card3: {
        label: 'Current streak',
        value: streakInfo.current,
        unit: streakInfo.current === 1 ? 'day' : 'days',
        subtext: `Personal best is ${streakInfo.best} ${streakInfo.best === 1 ? 'day' : 'days'}`,
      },
    };
  }, [
    isCycleView,
    isWeekView,
    cycleSessions,
    hasPrevCycleData,
    diffCycleSessions,
    cycleHours,
    cycleRemMinutes,
    cycleMinutes,
    diffCycleMinutes,
    formattedCycleMinutesDiff,
    percentOfCycleGoal,
    cycleGoalHours,
    cycleStreakInfo,
    streakInfo,
    selectedWeekSessions,
    diffPrevWeekSessions,
    selectedWeekHours,
    selectedWeekRemMinutes,
    selectedWeekMinutes,
    diffPrevWeekMinutes,
    percentOfWeeklyGoal,
    weeklyGoalHours,
    selectedWeekStreak,
    todaySessions,
    diffSessions,
    todayMinutes,
    diffMinutes,
    percentOfGoal,
    dailyGoalHours,
  ]);

  return (
    <div className="analytics-view-container">
      {/* 4 Top Metric Cards */}
      <div className="analytics-metric-cards">
        {/* Card 1: Sessions today / Sessions this cycle / Sessions this week */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-label">{cardMetrics.card1.label}</span>
          </div>
          <div className="metric-card-body">
            <span className="stat-value">{cardMetrics.card1.value}</span>
            <span className={`metric-badge ${cardMetrics.card1.badge.cls}`}>
              {cardMetrics.card1.badge.text}
            </span>
          </div>
          <div
            className="metric-sparkline"
            aria-label={cardMetrics.card1.sparklineType === 'cycle' ? 'Cycle weeks sparkline' : '7-day sessions sparkline'}
          >
            {cardMetrics.card1.sparklineType === 'cycle' ? (
              cycleWeeksData.map(w => {
                const isAccent = w.isCompleted && maxCompletedSessions > 0 && w.sessions === maxCompletedSessions;
                const h = Math.max(14, Math.round((w.sessions / maxCycleSparklineVal) * 100));
                return (
                  <div
                    key={w.weekNum}
                    className={`sparkline-bar${isAccent ? ' cycle-accent' : ''}${w.isUnstarted ? ' cycle-unstarted' : ''}`}
                    style={{ height: w.sessions > 0 ? `${h}%` : '4px' }}
                    title={`${w.label}: ${w.sessions} sessions`}
                  />
                );
              })
            ) : (
              (cardMetrics.card1.sparklineType === 'week' ? weekDaysData : sparklineData).map(d => {
                const maxVal = cardMetrics.card1.sparklineType === 'week' ? maxWeekDayVal : maxSparklineVal;
                const h = Math.max(14, Math.round((d.value / maxVal) * 100));
                return (
                  <div
                    key={d.date}
                    className={`sparkline-bar${d.isToday ? ' today' : ''}`}
                    style={{ height: d.value > 0 ? `${h}%` : '4px' }}
                    title={`${d.date}: ${d.value} sessions`}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Card 2: Focus time today / Focus time this cycle / Focus time this week */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-label">{cardMetrics.card2.label}</span>
          </div>
          <div className="metric-card-body">
            {cardMetrics.card2.hours > 0 ? (
              <>
                <span className="stat-value">{cardMetrics.card2.hours}</span>
                <span className="metric-unit">h</span>
                {cardMetrics.card2.remMinutes > 0 && (
                  <>
                    <span className="stat-value" style={{ marginLeft: '0.25rem' }}>{cardMetrics.card2.remMinutes}</span>
                    <span className="metric-unit">m</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="stat-value">{cardMetrics.card2.totalMinutes}</span>
                <span className="metric-unit">m</span>
              </>
            )}
            <span className={`metric-badge ${cardMetrics.card2.badge.cls}`}>
              {cardMetrics.card2.badge.text}
            </span>
          </div>
          <div className="metric-progress-track">
            <div
              className="metric-progress-fill"
              style={{ width: `${cardMetrics.card2.percent}%` }}
            />
          </div>
          <div className="metric-subtext">
            {cardMetrics.card2.subtext}
          </div>
        </div>

        {/* Card 3: Current streak / Best streak in cycle / Best streak this week */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-label">{cardMetrics.card3.label}</span>
          </div>
          <div className="metric-card-body">
            <span className="stat-value streak-value">{cardMetrics.card3.value}</span>
            <span className="metric-unit">{cardMetrics.card3.unit}</span>
          </div>
          <div className="metric-subtext">
            {cardMetrics.card3.subtext}
          </div>
        </div>

        {/* Card 4: All time */}
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-label">All time</span>
          </div>
          <div className="metric-card-body">
            <span className="stat-value">{totalSessions}</span>
            <span className="metric-unit">sessions</span>
          </div>
          <div className="metric-subtext">
            {totalHours}h {remMinutes}m {earliestDateLabel ? `since ${earliestDateLabel}` : 'total'}
          </div>
        </div>
      </div>

      {/* Two Columns Grid */}
      <div className="analytics-grid-body">
        {/* Left Column: SESSIONS PER DAY + LAST 5 WEEKS */}
        <div className="analytics-col-left">
          {/* SESSIONS PER DAY / WEEK Card */}
          <div className="analytics-panel-card">
            <div className="panel-header-row">
              <div className="panel-header-left-group">
                <h3 className="panel-eyebrow">
                  {isCycleView ? 'SESSIONS PER WEEK' : 'SESSIONS PER DAY'}
                </h3>
                {!isCycleView && onSelectWeek && (
                  <button
                    type="button"
                    className="cycle-overview-back-btn"
                    onClick={() => {
                      onSelectWeek('all');
                    }}
                    title="Return to cycle overview"
                  >
                    ← Cycle overview
                  </button>
                )}
              </div>
              <div className="daily-goal-indicator">
                <span>---</span>
                <span>{isCycleView ? `weekly goal ${weeklyGoal}` : `daily goal ${dailyBudget}`}</span>
              </div>
            </div>

            <div className="sessions-chart-area">
              {/* Dashed Guideline */}
              <div
                className="sessions-chart-guideline"
                style={{
                  bottom: `calc(2rem + ${(isCycleView ? weeklyGoalLinePercent : goalLinePercent) * 0.01} * (100% - 2.5rem))`
                }}
              >
                <span className="guideline-label">{isCycleView ? weeklyGoal : dailyBudget}</span>
              </div>

              {/* Day or Week Bars */}
              {isCycleView ? (
                cycleWeeksData.map(w => {
                  const tooltipText = formatWeekTooltip(w);

                  if (w.isUnstarted) {
                    return (
                      <div
                        key={w.weekNum}
                        className="sessions-bar-col weekly unstarted"
                        title={tooltipText}
                      >
                        <span className="sessions-bar-val unstarted">—</span>
                        <div className="sessions-bar-track unstarted-slot" />
                        <span className="sessions-bar-day unstarted">{w.label}</span>
                      </div>
                    );
                  }

                  const isAccent = w.isCompleted && maxCompletedSessions > 0 && w.sessions === maxCompletedSessions;
                  const barHeightPct = w.sessions > 0
                    ? Math.min(100, Math.round((w.sessions / maxCycleWeekVal) * 100))
                    : 0;

                  return (
                    <div
                      key={w.weekNum}
                      className="sessions-bar-col weekly"
                      onClick={() => {
                        onSelectWeek?.(w.weekNum);
                      }}
                      style={{ cursor: 'pointer' }}
                      title={tooltipText}
                    >
                      <span className="sessions-bar-val">{w.sessions}</span>
                      <div className="sessions-bar-track">
                        <div
                          className={`sessions-bar-fill weekly-bar${isAccent ? ' accent' : ' weekly-dimmed'}`}
                          style={{ height: w.sessions > 0 ? `${barHeightPct}%` : '4px' }}
                        />
                      </div>
                      <span className="sessions-bar-day">{w.label}</span>
                    </div>
                  );
                })
              ) : (
                weekDaysData.map(d => {
                  const barHeightPct = d.value > 0
                    ? Math.min(100, Math.round((d.value / maxWeekDayVal) * 100))
                    : 0;

                  return (
                    <div key={d.date} className="sessions-bar-col">
                      <span className="sessions-bar-val">{d.value}</span>
                      <div className="sessions-bar-track">
                        <div
                          className={`sessions-bar-fill${d.isToday ? ' active-day' : ''}`}
                          style={{ height: d.value > 0 ? `${barHeightPct}%` : '4px' }}
                        />
                      </div>
                      <span className={`sessions-bar-day${d.isToday ? ' active-day' : ''}`}>
                        {d.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Dynamic baseline caption for cycle view */}
            {isCycleView && cycleCaption && (
              <div className="sessions-chart-caption">
                {cycleCaption}
              </div>
            )}

            {/* LAST 5 WEEKS Heatmap */}
            <div style={{ marginTop: '0.5rem' }}>
              <h4 className="panel-eyebrow" style={{ marginBottom: '0.85rem' }}>LAST 5 WEEKS</h4>
              <div className="heatmap-matrix" role="img" aria-label="Last 5 weeks activity heatmap">
                {heatmapData.map((cell, idx) => (
                  <div
                    key={idx}
                    className={`heatmap-cell${cell.level ? ` level-${cell.level}` : ''}${cell.future ? ' future' : ''}`}
                    title={`${cell.date}: ${cell.count} ${cell.count === 1 ? 'session' : 'sessions'}`}
                  />
                ))}
              </div>
              <div className="heatmap-legend">
                <span>less</span>
                <div className="heatmap-legend-box" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="heatmap-legend-box" style={{ background: 'color-mix(in srgb, var(--color-primary) 25%, transparent)' }} />
                <div className="heatmap-legend-box" style={{ background: 'color-mix(in srgb, var(--color-primary) 50%, transparent)' }} />
                <div className="heatmap-legend-box" style={{ background: 'color-mix(in srgb, var(--color-primary) 75%, transparent)' }} />
                <div className="heatmap-legend-box" style={{ background: 'var(--color-primary)' }} />
                <span>more</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: WHERE YOUR FOCUS WENT + BEST TIME TO FOCUS */}
        <div className="analytics-col-right">
          {/* WHERE YOUR FOCUS WENT Card */}
          <div className="analytics-panel-card">
            <div className="panel-header-row">
              <h3 className="panel-eyebrow">WHERE YOUR FOCUS WENT</h3>
            </div>

            <div className="focus-objectives-list">
              {objectiveBreakdown.map(item => (
                <div key={item.id} className="focus-objective-row">
                  <div className="focus-objective-header">
                    <span className="focus-objective-title" title={item.title}>{item.title}</span>
                    <span className="focus-objective-stats">{item.count} · {item.pct}%</span>
                  </div>
                  <div className="focus-objective-track">
                    <div
                      className={`focus-objective-fill${item.count === 0 ? ' zero' : ''}`}
                      style={{ width: item.count > 0 ? `${item.pct}%` : '6px' }}
                    />
                  </div>
                </div>
              ))}

              {/* Unlinked Work */}
              <div className="focus-objective-row">
                <div className="focus-objective-header">
                  <span className="focus-objective-title">Unlinked work</span>
                  <span className="focus-objective-stats">{unlinkedCount} · {unlinkedPct}%</span>
                </div>
                <div className="focus-objective-track">
                  <div
                    className="focus-objective-fill unlinked"
                    style={{ width: unlinkedCount > 0 ? `${unlinkedPct}%` : '0%' }}
                  />
                </div>
              </div>
            </div>

            {/* Dormant Objective Alert Banner */}
            {dormantObjective && (
              <div className="dormant-alert-banner">
                {dormantObjective.title} has had no focus time in {dormantObjective.weeks} weeks.
                Drop it or schedule it in the weekly review.
              </div>
            )}
          </div>

          {/* BEST TIME TO FOCUS Card */}
          <div className="analytics-panel-card">
            <div className="panel-header-row">
              <h3 className="panel-eyebrow">BEST TIME TO FOCUS</h3>
            </div>

            <div className="best-time-readout-row">
              {bestTimeStats.hasStandout ? (
                <>
                  <span className="best-time-window">{bestTimeStats.bestWindow}</span>
                  <span className="best-time-completion">
                    {bestTimeStats.rate}% completion · {bestTimeStats.sessionCount}{' '}
                    {bestTimeStats.sessionCount === 1 ? 'session' : 'sessions'}
                  </span>
                </>
              ) : bestTimeStats.hasData ? (
                <span className="best-time-none">No standout time yet</span>
              ) : (
                <span className="best-time-window">--:-- – --:--</span>
              )}
            </div>

            <div className="best-time-insight">
              {bestTimeStats.insight}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
