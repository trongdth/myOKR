import type { PomodoroTask } from '../../lib/pomodoro-storage';

interface Props {
  tasks: PomodoroTask[];
  keyResultId: string;
}

export default function LinkedTasksBadge({ tasks, keyResultId }: Props) {
  const linked = tasks.filter(t => t.keyResultId === keyResultId);
  if (linked.length === 0) return null;

  const totalPomos = linked.reduce((sum, t) => sum + t.completedPomodoros, 0);

  return (
    <span className="kr-linked-badge" title={`${linked.length} linked task(s), ${totalPomos} pomodoro(s)`}>
      🍅 {totalPomos} · {linked.length} task{linked.length !== 1 ? 's' : ''}
    </span>
  );
}
