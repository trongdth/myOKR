import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:myokr_mobile/src/rust/frb_generated.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Storage-layer tests. The CRUD test covers the happy round-trip; the hostile
// fixtures below prove every load path runs its raw decoded value through the
// normalizer (ticket 02). Each hostile case is red against the pre-wiring code
// (which trusts raw bytes / hard-casts) and green once normalize is wired in.
void main() {
  setUpAll(() async {
    await RustLib.init(
      externalLibrary: Platform.isMacOS
          ? ExternalLibrary.open('rust/target/debug/librust_lib_myokr_mobile.dylib')
          : null,
    );
  });

  // Timer state is device-local (shared_preferences) as of ADR-0002; reset its
  // mock before each test so timer-state tests (and the CRUD timer section) are
  // isolated from each other.
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('PomodoroStorage CRUD tests', () async {
    final tempDir = await Directory.systemTemp.createTemp('pomo_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final storage = PomodoroStorage(testDirectory: tempDir);

    // 1. Load settings (should give defaults)
    final settings = await storage.loadSettings();
    expect(settings['focusDuration'], 25);
    expect(settings['shortBreakDuration'], 5);

    // 2. Save modified settings
    settings['focusDuration'] = 30;
    await storage.saveSettings(settings);

    final loadedSettings = await storage.loadSettings();
    expect(loadedSettings['focusDuration'], 30);
    expect(loadedSettings['shortBreakDuration'], 5); // Merged properly

    // 3. Save and load tasks
    final newTask = {
      'id': 'task-1',
      'title': 'Test Task',
      'estimatedPomodoros': 4,
      'completedPomodoros': 0,
      'isCompleted': false,
    };
    await storage.saveTasks([newTask]);

    final loadedTasks = await storage.loadTasks();
    expect(loadedTasks.length, 1);
    expect(loadedTasks[0]['title'], 'Test Task');

    // 4. Timer state
    final timerState = await storage.loadTimerState();
    expect(timerState, isNull);

    final newTimerState = {
      'sessionType': 'focus',
      'timeLeft': 1500,
      'isRunning': true,
      'lastUpdated': '2026-06-23T00:00:00.000Z',
    };
    await storage.saveTimerState(newTimerState);

    final loadedTimerState = await storage.loadTimerState();
    expect(loadedTimerState?['sessionType'], 'focus');

    await storage.clearTimerState();
    final clearedTimerState = await storage.loadTimerState();
    expect(clearedTimerState, isNull);
  });

  // --- Hostile-fixture regression tests (red on the un-wired load code) ---
  // These seed the real Automerge doc with malformed values via saveProperty,
  // then assert the load path returns normalized, safe output. Faithful mirror
  // of desktop's load* (normalize at the chokepoint, never throw on bad data).

  test('loadSettings clamps bounds and injects focusMusicEnabled default',
      () async {
    final storage = await _freshStorage();
    await storage.saveProperty('settings',
        {'focusDuration': 9999, 'pomosBeforeLongBreak': 99});
    final s = await storage.loadSettings();
    expect(s['focusDuration'], 120); // clamped 1–120
    expect(s['pomosBeforeLongBreak'], 10); // clamped 1–10
    expect(s['shortBreakDuration'], 5); // default
    expect(s['focusMusicEnabled'], false); // default injected by normalizer
  });

  test('loadSettings clamps lower bounds to 1', () async {
    final storage = await _freshStorage();
    await storage.saveProperty('settings', {
      'focusDuration': 0,
      'shortBreakDuration': -5,
      'longBreakDuration': 0,
      'pomosBeforeLongBreak': 0,
    });
    final s = await storage.loadSettings();
    expect(s['focusDuration'], 1); // clamped 1–120
    expect(s['shortBreakDuration'], 1); // clamped 1–60
    expect(s['longBreakDuration'], 1); // clamped 1–120
    expect(s['pomosBeforeLongBreak'], 1); // clamped 1–10
  });

  test('loadSettings yields defaults on a hostile top-level shape (no throw)',
      () async {
    final storage = await _freshStorage();
    await storage.saveProperty('settings', [1, 2, 3]); // object expected, got array
    final s = await storage.loadSettings();
    expect(s['focusDuration'], 25);
    expect(s['focusMusicEnabled'], false);
  });

  test('loadTasks normalizes hostile elements and drops non-maps', () async {
    final storage = await _freshStorage();
    await storage.saveProperty('tasks', [
      {'title': null, 'estimatedPomodoros': 'x', 'category': 'bogus'},
      'not-a-map',
      {'title': 'Real', 'estimatedPomodoros': 3},
    ]);
    final tasks = await storage.loadTasks();
    expect(tasks.length, 2); // 'not-a-map' dropped
    expect(tasks[0]['title'], '');
    expect(tasks[0]['estimatedPomodoros'], 0);
    expect(tasks[0].containsKey('category'), isFalse);
    expect(tasks[1]['title'], 'Real');
    expect(tasks[1]['estimatedPomodoros'], 3);
  });

  test('loadTasks yields empty list on a hostile top-level shape (no throw)',
      () async {
    final storage = await _freshStorage();
    await storage.saveProperty('tasks', {'not': 'a-list'}); // array expected
    expect(await storage.loadTasks(), isEmpty);
  });

  test('loadHistory normalizes counts and filters/fixes sessions', () async {
    final storage = await _freshStorage();
    await storage.saveProperty('history', [
      {
        'date': '2026-07-20',
        'totalFocusMinutes': 'x',
        'sessions': [
          {'type': 'bogus'},
          'junk',
          {'type': 'focus', 'completed': true},
        ],
      }
    ]);
    final hist = await storage.loadHistory();
    expect(hist.length, 1);
    expect(hist[0]['date'], '2026-07-20');
    expect(hist[0]['totalFocusMinutes'], 0); // non-numeric → 0
    final sessions = hist[0]['sessions'] as List;
    expect(sessions.length, 2); // 'junk' (non-map) dropped
    expect(sessions[0]['type'], 'focus'); // 'bogus' coerced to default
    expect(sessions[0]['completed'], false); // missing → default
    expect(sessions[0]['startedAt'], ''); // missing → default
    expect(sessions[0]['endedAt'], ''); // missing → default
    expect(sessions[1]['type'], 'focus');
  });

  test('loadTimerState normalizes hostile shapes', () async {
    final storage = await _freshStorage();
    await storage.saveProperty('timerState',
        {'sessionType': 'bogus', 'timeLeft': -50, 'isRunning': 'yes'});
    final ts = await storage.loadTimerState();
    expect(ts, isNotNull);
    expect(ts!['sessionType'], 'focus');
    expect(ts['timeLeft'], 0); // clamped ≥ 0
    expect(ts['isRunning'], isFalse); // wrong type → false
  });

  test('loadTimerState returns null when absent', () async {
    final storage = await _freshStorage();
    expect(await storage.loadTimerState(), isNull);
  });

  // --- Read-modify-write preservation (ADR-0004) ---
  // The write-side defence against silent cross-device field erasure. Mobile's
  // normalizeSettings builds a fixed-shape map, so the only thing standing between
  // a sibling key the other app wrote and erasure is the SAVE merging onto the
  // loaded doc object instead of wholesale-replacing it. Each test seeds the real
  // Automerge doc, performs a save, and asserts the unknown field survives in the
  // doc (the bytes that sync) — red on the old wholesale-replace save.

  test('saveSettings preserves unknown sibling keys across a save (ADR-0004)',
      () async {
    final storage = await _freshStorage();
    // Seed the doc as desktop might: a known field mobile edits, plus a sibling
    // key no mobile code path models yet.
    await storage.saveProperty('settings', {
      'focusDuration': 25,
      'focusMusicEnabled': true,
      'soundTheme': 'rain', // future desktop field mobile does not model
    });

    // Mobile saves its full known settings shape (no `soundTheme`).
    await storage.saveSettings({
      'focusDuration': 30,
      'shortBreakDuration': 5,
      'longBreakDuration': 15,
      'pomosBeforeLongBreak': 4,
      'autoStartBreaks': false,
      'autoStartFocus': false,
      'focusMusicEnabled': true,
    });

    // The doc — what syncs to the other device — must still carry the unknown
    // sibling key. Wholesale replace erases it; read-modify-write preserves it.
    final raw = await storage.getProperty('settings');
    expect(raw, isA<Map>());
    expect(raw['focusDuration'], 30); // mobile's edit applied
    expect(raw['soundTheme'], 'rain'); // unknown sibling preserved — the fix
    expect(raw['focusMusicEnabled'], true); // known sibling preserved too

    // Mobile's own load still yields a normalized, safe map.
    final loaded = await storage.loadSettings();
    expect(loaded['focusDuration'], 30);
  });

  test('saveTasks preserves unknown fields on task elements (ADR-0004)',
      () async {
    final storage = await _freshStorage();
    // Seed a task carrying a field mobile does not model. normalizeTask preserves
    // unknown keys (object spread), and saveTasks writes the loaded elements back
    // as-is, so a load → edit → save round-trip keeps the field.
    await storage.saveProperty('tasks', [
      {
        'id': 't1',
        'title': 'Ship it',
        'estimatedPomodoros': 3,
        'completedPomodoros': 1,
        'isCompleted': false,
        'effortScore': 7, // future desktop field mobile does not model
      }
    ]);

    // Load → edit (bump completedPomodoros) → save, the way the UI does it
    // (copy the loaded element, overlay the changed field — never a fresh literal).
    final tasks = await storage.loadTasks();
    final updated = tasks.map((t) {
      if (t['id'] == 't1') {
        final copy = Map<String, dynamic>.from(t);
        copy['completedPomodoros'] = (copy['completedPomodoros'] as int? ?? 0) + 1;
        return copy;
      }
      return t;
    }).toList();
    await storage.saveTasks(updated);

    final reloaded = await storage.loadTasks();
    expect(reloaded.length, 1);
    expect(reloaded[0]['completedPomodoros'], 2); // edit applied
    expect(reloaded[0]['effortScore'], 7); // unknown field preserved
  });

  test('saveHistory preserves canonical fields across a save (ADR-0004)',
      () async {
    final storage = await _freshStorage();
    // normalizeDailyRecord builds a fixed-shape map that mirrors desktop exactly
    // (ADR-0001/0003): both apps drop unknown keys symmetrically, so — unlike
    // settings — there is no asymmetric cross-app erasure to defend against, and
    // matching desktop means this test is a green regression guard for the
    // canonical-field round-trip, not a red-on-old bug fix.
    await storage.saveProperty('history', [
      {
        'date': '2026-07-21',
        'completedPomodoros': 2,
        'totalFocusMinutes': 50,
        'tasksCompleted': 1,
        'sessions': [
          {'type': 'focus', 'completed': true, 'startedAt': 'a', 'endedAt': 'b'},
        ],
      }
    ]);

    // Load → edit (bump today's pomos) → save, the way the timer records a session.
    final hist = await storage.loadHistory();
    final updated = hist.map((r) {
      if (r['date'] == '2026-07-21') {
        final copy = Map<String, dynamic>.from(r);
        copy['completedPomodoros'] = (copy['completedPomodoros'] as int? ?? 0) + 1;
        return copy;
      }
      return r;
    }).toList();
    await storage.saveHistory(updated);

    final reloaded = await storage.loadHistory();
    expect(reloaded.length, 1);
    expect(reloaded[0]['completedPomodoros'], 3); // edit applied
    expect(reloaded[0]['totalFocusMinutes'], 50); // canonical field preserved
    expect(reloaded[0]['tasksCompleted'], 1); // canonical field preserved
    expect((reloaded[0]['sessions'] as List).length, 1); // sessions preserved
  });

  // --- TimerState is device-local (ADR-0002) ---
  // The running timer's ephemeral state lives in shared_preferences (mobile's
  // localStorage analog), NOT the synced doc, so a timer started on one device
  // never appears as running on the other. A one-time migration adopts any
  // timerState the doc still carries from the old app version; the doc key is
  // left in place (deleting it would itself be a syncing mutation). Each test
  // starts from a clean shared_preferences mock (see setUp).

  test('save/load timer state uses device storage, not the doc (ADR-0002)',
      () async {
    final storage = await _freshStorage();
    await storage.saveTimerState({
      'sessionType': 'focus',
      'timeLeft': 1500,
      'isRunning': true,
      'lastUpdated': '2026-07-21T00:00:00.000Z',
    });

    // A relaunch on the same device recovers the running timer.
    final loaded = await storage.loadTimerState();
    expect(loaded, isNotNull);
    expect(loaded!['sessionType'], 'focus');
    expect(loaded['timeLeft'], 1500);

    // The doc — what syncs to the other device — must NOT carry the timer state.
    expect(await storage.getProperty('timerState'), isNull);
  });

  test('loadTimerState migrates a stale doc timerState once (ADR-0002)',
      () async {
    final storage = await _freshStorage();
    // An old-app doc carrying a running timer; device storage is empty.
    await storage.saveProperty('timerState', {
      'sessionType': 'focus',
      'timeLeft': 999,
      'isRunning': true,
      'lastUpdated': '2026-07-20T00:00:00.000Z',
    });

    // First load adopts (migrates) the doc value into device storage.
    final migrated = await storage.loadTimerState();
    expect(migrated, isNotNull);
    expect(migrated!['sessionType'], 'focus');
    expect(migrated['timeLeft'], 999);

    // Later saves route to device storage only; the doc key is never re-read.
    await storage.saveTimerState({
      'sessionType': 'shortBreak',
      'timeLeft': 300,
      'isRunning': false,
      'lastUpdated': '2026-07-21T00:00:00.000Z',
    });
    expect((await storage.loadTimerState())!['sessionType'], 'shortBreak');

    // The doc was never mutated: its stale timerState is unchanged, not deleted.
    final docTimerState = await storage.getProperty('timerState');
    expect(docTimerState, isA<Map>());
    expect(docTimerState['sessionType'], 'focus');
  });

  test('clearTimerState clears device storage, leaves the doc key (ADR-0002)',
      () async {
    final storage = await _freshStorage();
    await storage.saveProperty('timerState', {
      'sessionType': 'focus',
      'timeLeft': 60,
      'isRunning': true,
      'lastUpdated': '2026-07-20T00:00:00.000Z',
    });
    await storage.loadTimerState(); // migrate into device storage
    await storage.clearTimerState();

    expect(await storage.loadTimerState(), isNull); // device-local cleared
    // The stale doc key is deliberately left in place (ADR-0002).
    expect(await storage.getProperty('timerState'), isA<Map>());
  });

  test('loadTimerState prefers device storage over a stale doc (ADR-0002)',
      () async {
    final storage = await _freshStorage();
    // Device storage already holds a running timer.
    await storage.saveTimerState({
      'sessionType': 'focus',
      'timeLeft': 42,
      'isRunning': true,
      'lastUpdated': '2026-07-21T00:00:00.000Z',
    });
    // The doc carries a DIFFERENT stale timer (the old app's, never cleared).
    await storage.saveProperty('timerState', {
      'sessionType': 'longBreak',
      'timeLeft': 999,
      'isRunning': true,
      'lastUpdated': '2026-07-20T00:00:00.000Z',
    });

    final loaded = await storage.loadTimerState();
    expect(loaded!['timeLeft'], 42); // device value wins, doc NOT adopted
    expect(loaded['sessionType'], 'focus');
    // The stale doc value is ignored, not copied over (one-time copy runs only
    // when device storage is empty).
    expect((await storage.getProperty('timerState'))['sessionType'], 'longBreak');
  });

  test('loadTimerState tolerates corrupt device-local state (ADR-0002)',
      () async {
    final storage = await _freshStorage();
    // Corrupt bytes in device storage (a bad write / partial upgrade). The two
    // keys mirror PomodoroStorage's private _kTimerStatePrefKey / ...MigratedKey.
    SharedPreferences.setMockInitialValues(<String, Object>{
      'myokr_timer_state': '{not valid json',
      'myokr_timer_state_migrated': true,
    });

    // No throw — the corrupt value is discarded and the timer reads as idle.
    expect(await storage.loadTimerState(), isNull);
  });
}

/// A fresh PomodoroStorage backed by an isolated temp directory.
Future<PomodoroStorage> _freshStorage() async {
  final tempDir = await Directory.systemTemp.createTemp('pomo_norm_test');
  addTearDown(() => tempDir.delete(recursive: true));
  return PomodoroStorage(testDirectory: tempDir);
}
