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
  final completedPomodoros = (task['completedPomodoros'] as num?)?.toInt() ?? 0;
  final isCompleted = task['isCompleted'] as bool? ?? false;
  if (completedPomodoros > 0 && !isCompleted) return 1.0;
  return 0.0;
}

int getDailyPomodoroBudget(Map<String, dynamic> settings) {
  final focusDuration = (settings['focusDuration'] as num?)?.toInt() ?? 25;
  return (dailyFocusMinutes / (focusDuration > 0 ? focusDuration : 25)).round();
}

int getMaxTaskBudgetShare(int budget) {
  return max(2, (budget / 2).floor());
}

int todaysSlice(Map<String, dynamic> task, int maxShare) {
  final estimated = (task['estimatedPomodoros'] as num?)?.toInt() ?? 1;
  final completed = (task['completedPomodoros'] as num?)?.toInt() ?? 0;
  final remaining = max(0, estimated - completed);
  return min(remaining, maxShare);
}

int getDaysLeftInCycle(Map<String, dynamic>? cycle) {
  if (cycle == null) return 999;
  final year = (cycle['year'] as num?)?.toInt() ?? DateTime.now().year;
  final month = (cycle['month'] as num?)?.toInt() ?? DateTime.now().month - 1;
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

  final picked = <Map<String, dynamic>>[];
  final pickedIds = <String>{};
  int cumActual = 0;
  int cumSlices = 0;

  // Phase 1
  for (final c in candidates) {
    if (picked.length >= 5) break;
    final estimated = (c['estimatedPomodoros'] as num?)?.toInt() ?? 1;
    final completed = (c['completedPomodoros'] as num?)?.toInt() ?? 0;
    final remaining = max(0, estimated - completed);
    if (remaining > 0 && remaining <= budget - cumActual) {
      picked.push(c);
      final id = c['id'];
      if (id is String) pickedIds.add(id);
      cumActual += remaining;
      cumSlices += todaysSlice(c, maxShare);
    }
  }

  // Phase 2
  for (final c in candidates) {
    if (picked.length >= 5) break;
    // Non-string ids can't participate in id-based dedup; they were already
    // considered in Phase 1, so skip them here rather than picking twice.
    if (c['id'] is! String || pickedIds.contains(c['id'])) continue;
    final slice = todaysSlice(c, maxShare);
    if (slice > 0 && slice <= budget - cumSlices) {
      picked.push(c);
      final id = c['id'];
      if (id is String) pickedIds.add(id);
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
