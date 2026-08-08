import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/pomodoro_normalizer.dart';

// Regression tests for the pure Dart normalization layer (ADR-0001, ADR-0003).
// These mirror desktop's reference `normalize*` functions
// (src/lib/pomodoro-storage.ts): same numeric bounds, enum whitelists, defaults.
//
// Every fixture here is malformed in a way that the *current* un-normalized
// mobile code path gets wrong:
//   - PomodoroStorage.loadSettings merges values verbatim (no clamping, no
//     focusMusicEnabled default).
//   - Pomodoro*Model.fromJson hard-casts (`json['title'] as String`) → crashes
//     on a null/wrong-typed title from a desktop-synced doc.
// So each assertion encodes desired safe behaviour, not current behaviour, and
// is red against today's code.
void main() {
  group('normalizeSettings', () {
    test('null/missing → full defaults incl. focusMusicEnabled', () {
      final s = normalizeSettings(null);
      expect(s, {
        'focusDuration': 25,
        'shortBreakDuration': 5,
        'longBreakDuration': 15,
        'pomosBeforeLongBreak': 4,
        'autoStartBreaks': true,
        'autoStartFocus': false,
        'focusMusicEnabled': false,
      });
    });

    test('runaway numerics are clamped to [min, max]', () {
      final s = normalizeSettings({
        'focusDuration': 9999, // 1–120
        'shortBreakDuration': 0, // 1–60
        'longBreakDuration': -5, // 1–120
        'pomosBeforeLongBreak': 99, // 1–10
      });
      expect(s['focusDuration'], 120);
      expect(s['shortBreakDuration'], 1);
      expect(s['longBreakDuration'], 1);
      expect(s['pomosBeforeLongBreak'], 10);
    });

    test('wrong-typed values fall back to defaults', () {
      // '30' as a string, 'yes' as a string, null numerics.
      final s = normalizeSettings({
        'focusDuration': '30',
        'autoStartBreaks': 'yes',
        'longBreakDuration': null,
      });
      expect(s['focusDuration'], 25);
      expect(s['autoStartBreaks'], isTrue); // posture ii: invalid falls back to the new default (true)
      expect(s['longBreakDuration'], 15);
    });

    test('NaN / Infinity are treated as non-finite → default', () {
      final s = normalizeSettings({
        'focusDuration': double.nan,
        'shortBreakDuration': double.infinity,
        'pomosBeforeLongBreak': double.negativeInfinity,
      });
      expect(s['focusDuration'], 25);
      expect(s['shortBreakDuration'], 5);
      expect(s['pomosBeforeLongBreak'], 4);
    });

    test('focusMusicEnabled is preserved (desktop writes it)', () {
      final s = normalizeSettings({'focusMusicEnabled': true});
      expect(s['focusMusicEnabled'], isTrue);
      // siblings still default
      expect(s['focusDuration'], 25);
    });

    test('valid values pass through unchanged', () {
      final s = normalizeSettings({
        'focusDuration': 50,
        'shortBreakDuration': 10,
        'longBreakDuration': 20,
        'pomosBeforeLongBreak': 6,
        'autoStartBreaks': true,
        'autoStartFocus': true,
        'focusMusicEnabled': true,
      });
      expect(s, {
        'focusDuration': 50,
        'shortBreakDuration': 10,
        'longBreakDuration': 20,
        'pomosBeforeLongBreak': 6,
        'autoStartBreaks': true,
        'autoStartFocus': true,
        'focusMusicEnabled': true,
      });
    });
  });

  group('normalizeTask', () {
    test('non-map input → null', () {
      expect(normalizeTask(null), isNull);
      expect(normalizeTask('x'), isNull);
      expect(normalizeTask(42), isNull);
    });

    test('missing/wrong-typed title → empty string (no crash), bucket defaults to backlog', () {
      final t = normalizeTask({'id': 't1'});
      expect(t, isNotNull);
      expect(t!['title'], '');
      expect(t['bucket'], 'backlog');
      expect(t.containsKey('dueDate'), isFalse);
      expect(t['estimatedPomodoros'], 0);
      expect(t['completedPomodoros'], 0);
      expect(t['isCompleted'], isFalse);
      expect(t.containsKey('category'), isFalse);
      expect(t.containsKey('todos'), isFalse);
      expect(t.containsKey('comments'), isFalse);
    });

    test('wrong types coerce to safe defaults; unknown category dropped', () {
      final t = normalizeTask({
        'id': 't1',
        'title': 123,
        'estimatedPomodoros': '4',
        'completedPomodoros': '2',
        'isCompleted': 'true',
        'category': 'bogus',
      })!;
      expect(t['title'], '');
      expect(t['estimatedPomodoros'], 0);
      expect(t['completedPomodoros'], 0);
      expect(t['isCompleted'], isFalse);
      expect(t.containsKey('category'), isFalse); // dropped, not kept-as-bogus
    });

    test('preserves todos + comments arrays and optional fields', () {
      final todos = [
        {'id': 'todo-1', 'text': 'step', 'completed': false}
      ];
      final comments = [
        {'id': 'c-1', 'text': 'note'}
      ];
      final t = normalizeTask({
        'id': 't1',
        'title': 'Write spec',
        'description': 'desc',
        'todos': todos,
        'comments': comments,
        'category': 'do',
        'keyResultId': 'kr-9',
        'createdAt': '2026-07-20T00:00:00.000Z',
      })!;
      expect(t['title'], 'Write spec');
      expect(t['category'], 'do');
      expect(t['todos'], todos);
      expect(t['comments'], comments);
      expect(t['keyResultId'], 'kr-9');
      expect(t['description'], 'desc');
    });

    test('non-list todos/comments are dropped', () {
      final t = normalizeTask({
        'id': 't1',
        'todos': 'not-a-list',
        'comments': null,
      })!;
      expect(t.containsKey('todos'), isFalse);
      expect(t.containsKey('comments'), isFalse);
    });

    test('non-finite pomodoros → 0; finite values kept (unbounded)', () {
      final t = normalizeTask({
        'id': 't1',
        'estimatedPomodoros': double.infinity,
        'completedPomodoros': double.nan,
      })!;
      expect(t['estimatedPomodoros'], 0);
      expect(t['completedPomodoros'], 0);

      // Tasks have no min/max bound (desktop finiteNumber fallback 0, no bounds),
      // so a normal finite value — even a large one — is preserved.
      final t2 = normalizeTask({'id': 't2', 'estimatedPomodoros': 99})!;
      expect(t2['estimatedPomodoros'], 99);
    });

    test('only the four Eisenhower categories survive', () {
      for (final c in ['do', 'decide', 'delegate', 'delete']) {
        final t = normalizeTask({'id': 't', 'category': c})!;
        expect(t['category'], c, reason: '$c should be preserved');
      }
      // Anything else is dropped.
      final bad = normalizeTask({'id': 't', 'category': 'urgent'})!;
      expect(bad.containsKey('category'), isFalse);
    });
  });

  group('normalizeSession', () {
    test('non-map input → null', () {
      expect(normalizeSession(null), isNull);
      expect(normalizeSession('x'), isNull);
    });

    test('unknown session type → focus; missing fields → defaults', () {
      final s = normalizeSession({'type': 'bogus'})!;
      expect(s['type'], 'focus');
      expect(s['startedAt'], '');
      expect(s['endedAt'], '');
      expect(s['completed'], isFalse);
      expect(s.containsKey('taskId'), isFalse);
    });

    test('valid session passes through; taskId included only when string', () {
      final s = normalizeSession({
        'startedAt': 'a',
        'endedAt': 'b',
        'type': 'shortBreak',
        'completed': true,
        'taskId': 't1',
      })!;
      expect(s, {
        'startedAt': 'a',
        'endedAt': 'b',
        'type': 'shortBreak',
        'completed': true,
        'taskId': 't1',
      });

      // Non-string taskId is dropped.
      final s2 = normalizeSession({'type': 'focus', 'taskId': 123})!;
      expect(s2.containsKey('taskId'), isFalse);
    });

    test('wrong-typed scalar fields coerce', () {
      final s = normalizeSession({
        'startedAt': 99,
        'endedAt': null,
        'type': 'longBreak',
        'completed': 'yes',
      })!;
      expect(s['startedAt'], '');
      expect(s['endedAt'], '');
      expect(s['type'], 'longBreak');
      expect(s['completed'], isFalse);
    });
  });

  group('normalizeDailyRecord', () {
    test('non-map input → null', () {
      expect(normalizeDailyRecord(null), isNull);
      expect(normalizeDailyRecord([]), isNull);
    });

    test('coerces numerics, normalizes+filters sessions', () {
      final r = normalizeDailyRecord({
        'date': '2026-07-20',
        'completedPomodoros': 3,
        'totalFocusMinutes': 'x', // non-finite-ish (string) → 0
        'tasksCompleted': -1, // finite, unbounded → preserved (mirrors desktop)
        'sessions': [
          {'type': 'focus', 'completed': true},
          'garbage', // non-map → dropped
          null, // non-map → dropped
          {'type': 'bogus'}, // → type normalized to 'focus'
        ],
      })!;
      expect(r['date'], '2026-07-20');
      expect(r['completedPomodoros'], 3);
      expect(r['totalFocusMinutes'], 0);
      expect(r['tasksCompleted'], -1);
      final sessions = r['sessions'] as List;
      expect(sessions.length, 2); // the two map entries survive
      expect(sessions[0]['type'], 'focus');
      expect(sessions[1]['type'], 'focus'); // 'bogus' coerced
    });

    test('non-list sessions → empty list', () {
      final r = normalizeDailyRecord({'date': '2026-07-20', 'sessions': 'nope'})!;
      expect((r['sessions'] as List).isEmpty, isTrue);
      expect(r['date'], '2026-07-20');
    });
  });

  group('normalizeTimerState', () {
    test('non-map input → null', () {
      expect(normalizeTimerState(null), isNull);
      expect(normalizeTimerState('x'), isNull);
    });

    test('malformed → safe defaults (focus/0/false)', () {
      final s = normalizeTimerState({
        'sessionType': 'bogus',
        'timeLeft': -50, // clamped to min 0
        'isRunning': 'yes', // wrong type → false
        'completedPomos': 2.5, // finite, no max → kept
      })!;
      expect(s['sessionType'], 'focus');
      expect(s['timeLeft'], 0);
      expect(s['isRunning'], isFalse);
      expect(s['completedPomos'], 2.5);
      expect(s['activeTaskId'], isNull);
      expect(s['sessionStartedAt'], isNull);
      // lastUpdated defaults to a generated ISO timestamp.
      expect(s['lastUpdated'], isA<String>());
      expect((s['lastUpdated'] as String).isNotEmpty, isTrue);
    });

    test('valid state passes through unchanged', () {
      final s = normalizeTimerState({
        'sessionType': 'focus',
        'timeLeft': 1500,
        'isRunning': true,
        'lastUpdated': '2026-07-20T00:00:00.000Z',
        'activeTaskId': 't1',
        'completedPomos': 2,
        'sessionStartedAt': '2026-07-20T00:25:00.000Z',
      })!;
      expect(s, {
        'sessionType': 'focus',
        'timeLeft': 1500,
        'isRunning': true,
        'lastUpdated': '2026-07-20T00:00:00.000Z',
        'activeTaskId': 't1',
        'completedPomos': 2,
        'sessionStartedAt': '2026-07-20T00:25:00.000Z',
      });
    });

    test('non-finite timeLeft/completedPomos → 0', () {
      final s = normalizeTimerState({
        'timeLeft': double.nan,
        'completedPomos': double.infinity,
      })!;
      expect(s['timeLeft'], 0);
      expect(s['completedPomos'], 0);
      expect(s['sessionType'], 'focus');
    });
  });

  group('weeklyPomodoroPlan (P4 mirror)', () {
    test('valid plan is preserved', () {
      final t = normalizeTask({
        'id': 't1', 'title': 'Task', 'weeklyPomodoroPlan': 20,
      })!;
      expect(t['weeklyPomodoroPlan'], 20);
    });

    test('non-numeric plan is removed (absent stays absent)', () {
      final t = normalizeTask({
        'id': 't1', 'title': 'Task', 'weeklyPomodoroPlan': '20',
      })!;
      expect(t.containsKey('weeklyPomodoroPlan'), isFalse);
    });

    test('runaway plan is clamped to 99 (normalizer convention)', () {
      final t = normalizeTask({
        'id': 't1', 'title': 'Task', 'weeklyPomodoroPlan': 500,
      })!;
      expect(t['weeklyPomodoroPlan'], 99);
    });

    test('plan of 0 is respected', () {
      final t = normalizeTask({
        'id': 't1', 'title': 'Task', 'weeklyPomodoroPlan': 0,
      })!;
      expect(t['weeklyPomodoroPlan'], 0);
    });
  });

  group('defaultSettings', () {
    test('matches desktop DEFAULT_SETTINGS (incl. focusMusicEnabled)', () {
      expect(defaultSettings, {
        'focusDuration': 25,
        'shortBreakDuration': 5,
        'longBreakDuration': 15,
        'pomosBeforeLongBreak': 4,
        'autoStartBreaks': true,
        'autoStartFocus': false,
        'focusMusicEnabled': false,
      });
    });
  });
}
