import 'dart:math';

const int dailyFocusMinutes = 240;

const double weightCategory = 0.45;
const double weightConfidence = 0.30;
const double weightUrgency = 0.15;
const double weightMomentum = 0.10;

final Map<String, double> categoryNorm = {
  'do': 1.0,
  'decide': 0.66,
  'delegate': 0.33,
  'delete': 0.0,
};

final Map<String, double> confidenceNorm = {
  'off_track': 1.0,
  'at_risk': 0.66,
  'on_track': 0.33,
  'not_set': 0.16,
  'no_kr': 0.0,
};

double urgencyNorm(int daysLeft) {
  if (daysLeft <= 7) return 1.0;
  if (daysLeft <= 14) return 0.5;
  return 0.0;
}

double momentumNorm(Map<String, dynamic> task) {
  final completedPomodoros = task['completedPomodoros'] as int? ?? 0;
  final isCompleted = task['isCompleted'] as bool? ?? false;
  if (completedPomodoros > 0 && !isCompleted) return 1.0;
  return 0.0;
}

int getDailyPomodoroBudget(Map<String, dynamic> settings) {
  final focusDuration = settings['focusDuration'] as int? ?? 25;
  return (dailyFocusMinutes / focusDuration).round();
}

int getMaxTaskBudgetShare(int budget) {
  return max(2, (budget / 2).floor());
}

int todaysSlice(Map<String, dynamic> task, int maxShare) {
  final estimated = task['estimatedPomodoros'] as int? ?? 1;
  final completed = task['completedPomodoros'] as int? ?? 0;
  final remaining = max(0, estimated - completed);
  return min(remaining, maxShare);
}

int getDaysLeftInCycle(Map<String, dynamic>? cycle) {
  if (cycle == null) return 999;
  final year = cycle['year'] as int;
  final month = cycle['month'] as int;
  // Get last day of the month by setting day=0 of next month
  final lastDay = DateTime(year, month + 2, 0);
  final today = DateTime.now();
  final lastDayMidnight = DateTime(lastDay.year, lastDay.month, lastDay.day);
  final todayMidnight = DateTime(today.year, today.month, today.day);
  final diff = lastDayMidnight.difference(todayMidnight).inDays;
  return max(0, diff);
}

Map<String, double> scoreTask(Map<String, dynamic> task, Map<String, dynamic>? kr, int daysLeft) {
  final catRaw = categoryNorm[task['category'] ?? 'decide'] ?? categoryNorm['decide']!;
  final confRaw = kr != null ? (confidenceNorm[kr['confidence']] ?? confidenceNorm['not_set']!) : confidenceNorm['no_kr']!;
  final urgRaw = urgencyNorm(daysLeft);
  final momRaw = momentumNorm(task);

  final total = weightCategory * catRaw + weightConfidence * confRaw + weightUrgency * urgRaw + weightMomentum * momRaw;

  return {
    'categoryRaw': catRaw,
    'confidenceRaw': confRaw,
    'urgencyRaw': urgRaw,
    'momentumRaw': momRaw,
    'total': total,
  };
}

List<Map<String, dynamic>> pickForBudget(
  List<Map<String, dynamic>> tasks,
  List<Map<String, dynamic>> keyResults,
  Map<String, dynamic>? cycle,
  Map<String, dynamic> settings,
) {
  final krMap = {for (var kr in keyResults) kr['id']: kr};
  final daysLeft = getDaysLeftInCycle(cycle);
  final budget = getDailyPomodoroBudget(settings);
  final maxShare = getMaxTaskBudgetShare(budget);

  final candidates = tasks
      .where((t) => !(t['isCompleted'] as bool? ?? false) && t['category'] != 'delete')
      .map((t) {
    final kr = t['keyResultId'] != null ? krMap[t['keyResultId']] : null;
    final score = scoreTask(t, kr, daysLeft);
    return {...t, '_score': score};
  }).toList();

  candidates.sort((a, b) {
    final scoreA = (a['_score'] as Map<String, double>)['total']!;
    final scoreB = (b['_score'] as Map<String, double>)['total']!;
    if (scoreB != scoreA) {
      return scoreB.compareTo(scoreA);
    }
    final createdA = a['createdAt'] as String? ?? '';
    final createdB = b['createdAt'] as String? ?? '';
    return createdA.compareTo(createdB);
  });

  // Single pass over candidates in score order. The former Phase 1 was
  // redundant (ticket 27): slice = min(remaining, maxShare) <= remaining and
  // cumulative slices never exceed cumulative remainings, so Phase 2 always
  // admitted everything Phase 1 did, in the same order. With one pass, no
  // id-based dedup is needed either — each candidate is visited exactly once.
  final picked = <Map<String, dynamic>>[];
  int cumSlices = 0;

  for (final c in candidates) {
    if (picked.length >= 5) break;
    final slice = todaysSlice(c, maxShare);
    if (slice > 0 && slice <= budget - cumSlices) {
      picked.push(c);
      cumSlices += slice;
    }
  }

  if (picked.isEmpty && candidates.isNotEmpty) {
    picked.push(candidates.first);
  }

  return picked;
}

extension ListExtensions<T> on List<T> {
  void push(T element) => add(element);
}
