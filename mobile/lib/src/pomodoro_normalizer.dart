// Defensive normalization of untrusted Pomodoro-document data.
//
// Mobile mirrors desktop's reference `normalize*` layer
// (../../myOKR/src/lib/pomodoro-storage.ts) — same numeric bounds, enum
// whitelists, and defaults, against the canonical shape in this repo's
// `CONTEXT.md`. Automerge is schema-less, so merged/imported bytes can carry
// wrong types, unknown enum values, or runaway numerics; these pure functions
// coerce them to safe values at the load chokepoint so downstream UI/storage
// code never sees a value that would throw or misbehave. See ADR-0001, ADR-0003.
//
// Pure functions only: no I/O, no Flutter/Rust dependencies. Each takes untrusted
// input (Object?) and returns a safe Map (or null for non-map input).
//
// NOTE on the `undefined` mapping: desktop sets invalid `category` / non-list
// `todos` / `comments` to JS `undefined`; its load path then strips those via a
// JSON round-trip. Dart has no `undefined`, so we omit the key — the same
// observable (post-roundtrip) shape.

/// Default settings, mirroring desktop's `DEFAULT_SETTINGS` (incl.
/// `focusMusicEnabled`, which desktop writes and mobile must preserve).
const Map<String, dynamic> defaultSettings = <String, dynamic>{
  'focusDuration': 25,
  'shortBreakDuration': 5,
  'longBreakDuration': 15,
  'pomosBeforeLongBreak': 4,
  'autoStartBreaks': true, // posture ii (matches desktop DEFAULT_SETTINGS)
  'autoStartFocus': false,
  'focusMusicEnabled': false,
};

const List<String> _kEisenhowerCategories = ['do', 'decide', 'delegate', 'delete'];
const List<String> _kValidSessionTypes = ['focus', 'shortBreak', 'longBreak'];

/// Coerces [v] to a finite number, clamped to [min, max]; otherwise [fallback].
///
/// Mirrors desktop's `finiteNumber`: non-numbers, NaN, and Infinity yield
/// [fallback]; finite values are clamped to the bounds. [min]/[max] default to
/// unbounded.
num finiteNumber(Object? v, num fallback,
    [num min = double.negativeInfinity, num max = double.infinity]) {
  if (v is num && v.isFinite) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }
  return fallback;
}

bool _isStringIn(Object? v, List<String> allowed) =>
    v is String && allowed.contains(v);

/// Normalizes settings: clamps the four durations, defaults the booleans.
///
/// Bounds: focusDuration 1–120, shortBreakDuration 1–60, longBreakDuration
/// 1–120, pomosBeforeLongBreak 1–10. Booleans fall back to false on wrong type.
Map<String, dynamic> normalizeSettings(Object? raw) {
  final Map src = raw is Map ? raw : <String, dynamic>{};
  return <String, dynamic>{
    'focusDuration':
        finiteNumber(src['focusDuration'], defaultSettings['focusDuration']!, 1, 120),
    'shortBreakDuration': finiteNumber(
        src['shortBreakDuration'], defaultSettings['shortBreakDuration']!, 1, 60),
    'longBreakDuration': finiteNumber(
        src['longBreakDuration'], defaultSettings['longBreakDuration']!, 1, 120),
    'pomosBeforeLongBreak': finiteNumber(
        src['pomosBeforeLongBreak'], defaultSettings['pomosBeforeLongBreak']!, 1, 10),
    'autoStartBreaks': src['autoStartBreaks'] is bool ? src['autoStartBreaks'] : defaultSettings['autoStartBreaks']!,
    'autoStartFocus': src['autoStartFocus'] is bool ? src['autoStartFocus'] : false,
    'focusMusicEnabled':
        src['focusMusicEnabled'] is bool ? src['focusMusicEnabled'] : false,
  };
}

/// Normalizes a task. Returns null for non-map input.
///
/// Preserves all input fields (so optional/unknown keys like `description`,
/// `keyResultId`, `createdAt` survive — mirroring desktop's object spread), then
/// overrides the safety-sensitive fields: title defaults to '', the pomodoro
/// counts coerce to finite numbers (default 0, unbounded), isCompleted defaults
const List<String> _kTaskBuckets = ['today', 'this_week', 'backlog'];

/// Normalizes a task. Returns null for non-map input.
Map<String, dynamic>? normalizeTask(Object? t) {
  if (t is! Map) return null;
  final task = <String, dynamic>{};
  for (final entry in t.entries) {
    if (entry.key is String) {
      task[entry.key as String] = entry.value;
    }
  }

  task['title'] = task['title'] is String ? task['title'] : '';
  task['estimatedPomodoros'] = finiteNumber(task['estimatedPomodoros'], 0);
  task['completedPomodoros'] = finiteNumber(task['completedPomodoros'], 0);
  task['isCompleted'] = task['isCompleted'] is bool ? task['isCompleted'] : false;

  if (!_isStringIn(task['bucket'], _kTaskBuckets)) {
    task['bucket'] = 'backlog';
  }
  if (task['dueDate'] is! String || (task['dueDate'] as String).trim().isEmpty) {
    task.remove('dueDate');
  } else {
    task['dueDate'] = (task['dueDate'] as String).trim();
  }
  // Weekly pomodoro plan (P4): mirrors desktop finiteNumber(_, undefined, 0, 99)
  // — invalid types are dropped (absent stays absent), finite values clamp.
  final weeklyPlan = finiteNumber(task['weeklyPomodoroPlan'], -1, 0, 99);
  if (weeklyPlan < 0) {
    task.remove('weeklyPomodoroPlan');
  } else {
    task['weeklyPomodoroPlan'] = weeklyPlan;
  }

  if (!_isStringIn(task['category'], _kEisenhowerCategories)) {
    task.remove('category');
  }
  if (task['todos'] is! List) {
    task.remove('todos');
  }
  if (task['comments'] is! List) {
    task.remove('comments');
  }
  return task;
}

/// Normalizes a session record. Returns null for non-map input.
///
/// Builds a strictly-shaped map: startedAt/endedAt default to '', `type` is
/// restricted to the session-type whitelist (else 'focus'), completed defaults
/// to false, and `taskId` is included only when it is a string.
Map<String, dynamic>? normalizeSession(Object? s) {
  if (s is! Map) return null;
  final sess = s;
  final result = <String, dynamic>{
    'startedAt': sess['startedAt'] is String ? sess['startedAt'] : '',
    'endedAt': sess['endedAt'] is String ? sess['endedAt'] : '',
    'type': _isStringIn(sess['type'], _kValidSessionTypes) ? sess['type'] : 'focus',
    'completed': sess['completed'] is bool ? sess['completed'] : false,
  };
  if (sess['taskId'] is String) {
    result['taskId'] = sess['taskId'];
  }
  return result;
}

/// Normalizes a daily history record. Returns null for non-map input.
///
/// `date` defaults to '', the three counts coerce to finite numbers (default 0,
/// unbounded — mirroring desktop), and `sessions` is recursively normalized
/// with nulls filtered out (non-list → empty list).
Map<String, dynamic>? normalizeDailyRecord(Object? r) {
  if (r is! Map) return null;
  final rec = r;
  final sessions = <Map<String, dynamic>>[];
  final sessionsRaw = rec['sessions'];
  if (sessionsRaw is List) {
    for (final s in sessionsRaw) {
      final norm = normalizeSession(s);
      if (norm != null) sessions.add(norm);
    }
  }
  return <String, dynamic>{
    'date': rec['date'] is String ? rec['date'] : '',
    'completedPomodoros': finiteNumber(rec['completedPomodoros'], 0),
    'totalFocusMinutes': finiteNumber(rec['totalFocusMinutes'], 0),
    'tasksCompleted': finiteNumber(rec['tasksCompleted'], 0),
    'sessions': sessions,
  };
}

/// Normalizes the device-local TimerState. Returns null for non-map input.
///
/// `sessionType` is restricted to the whitelist (else 'focus'); timeLeft and
/// completedPomos coerce to finite numbers ≥ 0; isRunning defaults to false;
/// lastUpdated defaults to a generated ISO timestamp (mirrors desktop's
/// `new Date().toISOString()`); activeTaskId / sessionStartedAt default to null
/// when not a string.
Map<String, dynamic>? normalizeTimerState(Object? raw) {
  if (raw is! Map) return null;
  final s = raw;
  return <String, dynamic>{
    'sessionType':
        _isStringIn(s['sessionType'], _kValidSessionTypes) ? s['sessionType'] : 'focus',
    'timeLeft': finiteNumber(s['timeLeft'], 0, 0),
    'isRunning': s['isRunning'] is bool ? s['isRunning'] : false,
    'lastUpdated': s['lastUpdated'] is String
        ? s['lastUpdated']
        : DateTime.now().toUtc().toIso8601String(),
    'activeTaskId': s['activeTaskId'] is String ? s['activeTaskId'] : null,
    'completedPomos': finiteNumber(s['completedPomos'], 0, 0),
    'sessionStartedAt': s['sessionStartedAt'] is String ? s['sessionStartedAt'] : null,
  };
}
