// Defensive normalization of untrusted OKR domain data.
//
// Mirrors desktop's reference `normalize*` logic in `src/lib/okr-storage.ts` —
// same numeric bounds, enum whitelists, and fallback defaults against the
// canonical shape defined in `CONTEXT.md`.
//
// Pure functions only: no I/O, no Flutter/Rust dependencies.

import 'package:myokr_mobile/src/pomodoro_normalizer.dart';

const List<String> kValidConfidenceValues = [
  'on_track',
  'at_risk',
  'off_track',
  'not_set',
];

const List<String> kValidCompletionModeValues = [
  'manual',
  'focus_hours',
  'focus_pomodoros',
  'completed_tasks',
  'habit',
];

/// Normalizes a single OKR Cycle. Returns null for non-map inputs.
Map<String, dynamic>? normalizeCycle(Object? raw) {
  if (raw is! Map) return null;

  final cycle = <String, dynamic>{};
  for (final entry in raw.entries) {
    if (entry.key is String) {
      cycle[entry.key as String] = entry.value;
    }
  }

  cycle['id'] = cycle['id'] is String ? cycle['id'] : '';
  cycle['name'] = cycle['name'] is String ? cycle['name'] : '';
  cycle['month'] = finiteNumber(cycle['month'], DateTime.now().month - 1, 0, 11).toInt();
  cycle['year'] = finiteNumber(cycle['year'], DateTime.now().year, 1970, 2100).toInt();
  cycle['isActive'] = cycle['isActive'] is bool ? cycle['isActive'] : false;
  cycle['createdAt'] = cycle['createdAt'] is String ? cycle['createdAt'] : DateTime.now().toIso8601String();

  return cycle;
}

/// Normalizes a list of OKR Cycles.
List<Map<String, dynamic>> normalizeCycles(Object? raw) {
  if (raw is! List) return <Map<String, dynamic>>[];
  return raw
      .map((item) => normalizeCycle(item))
      .whereType<Map<String, dynamic>>()
      .toList();
}

/// Normalizes a single Objective. Returns null for non-map inputs.
Map<String, dynamic>? normalizeObjective(Object? raw) {
  if (raw is! Map) return null;

  final obj = <String, dynamic>{};
  for (final entry in raw.entries) {
    if (entry.key is String) {
      obj[entry.key as String] = entry.value;
    }
  }

  obj['id'] = obj['id'] is String ? obj['id'] : '';
  obj['cycleId'] = obj['cycleId'] is String ? obj['cycleId'] : '';
  obj['title'] = obj['title'] is String ? obj['title'] : '';
  if (obj['description'] != null && obj['description'] is! String) {
    obj.remove('description');
  }
  if (obj['reward'] != null && obj['reward'] is! String) {
    obj.remove('reward');
  }
  obj['order'] = finiteNumber(obj['order'], 0).toInt();
  obj['createdAt'] = obj['createdAt'] is String ? obj['createdAt'] : DateTime.now().toIso8601String();

  return obj;
}

/// Normalizes a list of Objectives.
List<Map<String, dynamic>> normalizeObjectives(Object? raw) {
  if (raw is! List) return <Map<String, dynamic>>[];
  return raw
      .map((item) => normalizeObjective(item))
      .whereType<Map<String, dynamic>>()
      .toList();
}

/// Normalizes a single Key Result. Returns null for non-map inputs.
Map<String, dynamic>? normalizeKeyResult(Object? raw) {
  if (raw is! Map) return null;

  final kr = <String, dynamic>{};
  for (final entry in raw.entries) {
    if (entry.key is String) {
      kr[entry.key as String] = entry.value;
    }
  }

  kr['id'] = kr['id'] is String ? kr['id'] : '';
  kr['objectiveId'] = kr['objectiveId'] is String ? kr['objectiveId'] : '';
  kr['title'] = kr['title'] is String ? kr['title'] : '';
  kr['targetValue'] = finiteNumber(kr['targetValue'], 0);
  kr['currentValue'] = finiteNumber(kr['currentValue'], 0);
  kr['unit'] = kr['unit'] is String ? kr['unit'] : '';
  kr['order'] = finiteNumber(kr['order'], 0).toInt();

  final confidence = kr['confidence'];
  kr['confidence'] = kValidConfidenceValues.contains(confidence) ? confidence : 'not_set';

  final completionMode = kr['completionMode'];
  kr['completionMode'] = kValidCompletionModeValues.contains(completionMode) ? completionMode : 'manual';

  if (kr['habitId'] != null && kr['habitId'] is! String) {
    kr.remove('habitId');
  }

  kr['createdAt'] = kr['createdAt'] is String ? kr['createdAt'] : DateTime.now().toIso8601String();
  kr['updatedAt'] = kr['updatedAt'] is String ? kr['updatedAt'] : DateTime.now().toIso8601String();

  return kr;
}

/// Normalizes a list of Key Results.
List<Map<String, dynamic>> normalizeKeyResults(Object? raw) {
  if (raw is! List) return <Map<String, dynamic>>[];
  return raw
      .map((item) => normalizeKeyResult(item))
      .whereType<Map<String, dynamic>>()
      .toList();
}

/// Normalizes a single Review Entry.
Map<String, dynamic>? normalizeReviewEntry(Object? raw) {
  if (raw is! Map) return null;

  final entry = <String, dynamic>{};
  for (final e in raw.entries) {
    if (e.key is String) {
      entry[e.key as String] = e.value;
    }
  }

  entry['keyResultId'] = entry['keyResultId'] is String ? entry['keyResultId'] : '';
  entry['previousValue'] = finiteNumber(entry['previousValue'], 0);
  entry['currentValue'] = finiteNumber(entry['currentValue'], 0);

  final confidence = entry['confidence'];
  entry['confidence'] = kValidConfidenceValues.contains(confidence) ? confidence : 'not_set';

  if (entry['note'] != null && entry['note'] is! String) {
    entry.remove('note');
  }

  return entry;
}

/// Normalizes a single Weekly Review.
Map<String, dynamic>? normalizeReview(Object? raw) {
  if (raw is! Map) return null;

  final review = <String, dynamic>{};
  for (final e in raw.entries) {
    if (e.key is String) {
      review[e.key as String] = e.value;
    }
  }

  review['id'] = review['id'] is String ? review['id'] : '';
  review['weekStartDate'] = review['weekStartDate'] is String ? review['weekStartDate'] : '';
  review['weekEndDate'] = review['weekEndDate'] is String ? review['weekEndDate'] : '';
  review['cycleId'] = review['cycleId'] is String ? review['cycleId'] : '';

  if (review['entries'] is List) {
    review['entries'] = (review['entries'] as List)
        .map((e) => normalizeReviewEntry(e))
        .whereType<Map<String, dynamic>>()
        .toList();
  } else {
    review['entries'] = <Map<String, dynamic>>[];
  }

  if (review['reflection'] != null && review['reflection'] is! String) {
    review.remove('reflection');
  }

  final ps = review['pomodoroStats'] is Map ? review['pomodoroStats'] as Map : <String, dynamic>{};
  final pbyKrRaw = ps['pomodorosByKeyResult'] is Map ? ps['pomodorosByKeyResult'] as Map : <String, dynamic>{};
  final pbyKr = <String, num>{};
  for (final e in pbyKrRaw.entries) {
    if (e.key is String) {
      pbyKr[e.key as String] = finiteNumber(e.value, 0);
    }
  }

  review['pomodoroStats'] = <String, dynamic>{
    'totalPomodoros': finiteNumber(ps['totalPomodoros'], 0),
    'totalFocusMinutes': finiteNumber(ps['totalFocusMinutes'], 0),
    'tasksCompleted': finiteNumber(ps['tasksCompleted'], 0),
    'pomodorosByKeyResult': pbyKr,
  };

  return review;
}

/// Normalizes a list of Weekly Reviews.
List<Map<String, dynamic>> normalizeReviews(Object? raw) {
  if (raw is! List) return <Map<String, dynamic>>[];
  return raw
      .map((item) => normalizeReview(item))
      .whereType<Map<String, dynamic>>()
      .toList();
}

const List<String> kValidHabitStatusValues = [
  'want_to_form',
  'in_progress',
  'formed',
];

/// Normalizes a single Habit.
Map<String, dynamic>? normalizeHabit(Object? raw) {
  if (raw is! Map) return null;

  final habit = <String, dynamic>{};
  for (final e in raw.entries) {
    if (e.key is String) {
      habit[e.key as String] = e.value;
    }
  }

  habit['id'] = habit['id'] is String ? habit['id'] : '';
  habit['name'] = habit['name'] is String ? habit['name'] : '';
  final status = habit['status'];
  habit['status'] = kValidHabitStatusValues.contains(status) ? status : 'want_to_form';

  List<String> ticks = [];
  if (habit['ticks'] is List) {
    final valid = (habit['ticks'] as List)
        .whereType<String>()
        .where((t) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(t))
        .toSet()
        .toList()
      ..sort();
    ticks = valid;
  }
  habit['ticks'] = ticks;
  habit['order'] = finiteNumber(habit['order'], 0).toInt();
  habit['createdAt'] = habit['createdAt'] is String ? habit['createdAt'] : DateTime.now().toIso8601String();
  habit['updatedAt'] = habit['updatedAt'] is String ? habit['updatedAt'] : DateTime.now().toIso8601String();

  return habit;
}

/// Normalizes a list of Habits.
List<Map<String, dynamic>> normalizeHabits(Object? raw) {
  if (raw is! List) return <Map<String, dynamic>>[];
  return raw
      .map((item) => normalizeHabit(item))
      .whereType<Map<String, dynamic>>()
      .toList();
}

