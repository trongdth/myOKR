import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:myokr_mobile/src/rust/frb_generated.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    await RustLib.init(
      externalLibrary: Platform.isMacOS
        ? ExternalLibrary.open('rust/target/debug/librust_lib_myokr_mobile.dylib')
        : null,
    );
  });

  // TimerState is device-local in shared_preferences (ADR-0002); reset the mock
  // before each test so loadAllData → loadTimerState is isolated and the binding
  // is initialized.
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    // Dropbox credentials live in secure storage (ticket 16); reset its mock
    // so disconnect/initSync never touch the real platform.
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
  });

  test('StorageProvider loads data correctly', () async {
    final tempDir = await Directory.systemTemp.createTemp('provider_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final okrStorage = OkrStorage(testDirectory: tempDir);
    final pomodoroStorage = PomodoroStorage(testDirectory: tempDir);

    // Initial save some data
    await pomodoroStorage.saveSettings({'focusDuration': 50});
    await okrStorage.saveCycles([
      {'id': 'c1', 'month': 5, 'year': 2026, 'isActive': true}
    ]);

    final provider = StorageProvider(
      okrStorage: okrStorage,
      pomodoroStorage: pomodoroStorage,
    );

    expect(provider.isLoading, true);

    await provider.loadAllData();

    expect(provider.isLoading, false);
    expect(provider.settings['focusDuration'], 50);
    expect(provider.cycles.length, 1);
    expect(provider.activeCycle?['id'], 'c1');
  });

  test('StorageProvider calculates getEffectiveCurrentValue across all 5 modes', () async {
    final tempDir = await Directory.systemTemp.createTemp('provider_kr_calc_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final okrStorage = OkrStorage(testDirectory: tempDir);
    final pomodoroStorage = PomodoroStorage(testDirectory: tempDir);

    final provider = StorageProvider(
      okrStorage: okrStorage,
      pomodoroStorage: pomodoroStorage,
    );

    provider.cycles = [
      {'id': 'c1', 'month': 4, 'year': 2026, 'name': 'May 2026', 'isActive': true}
    ];
    provider.objectives = [
      {'id': 'o1', 'cycleId': 'c1', 'title': 'Obj 1'}
    ];
    provider.settings = {'focusDuration': 30};
    provider.tasks = [
      {'id': 't1', 'keyResultId': 'kr-pomos', 'completedPomodoros': 4, 'isCompleted': true},
      {'id': 't2', 'keyResultId': 'kr-pomos', 'completedPomodoros': 2, 'isCompleted': false},
      {'id': 't3', 'keyResultId': 'kr-tasks', 'completedPomodoros': 1, 'isCompleted': true},
      {'id': 't4', 'keyResultId': 'kr-tasks', 'completedPomodoros': 0, 'isCompleted': false},
    ];
    provider.habits = [
      {
        'id': 'h1',
        'ticks': ['2026-05-01', '2026-05-05', '2026-06-01'] // 2 in May 2026 (month 4), 1 in June
      }
    ];

    final krManual = {'id': 'kr-man', 'objectiveId': 'o1', 'completionMode': 'manual', 'currentValue': 7};
    final krFocusHours = {'id': 'kr-pomos', 'objectiveId': 'o1', 'completionMode': 'focus_hours', 'currentValue': 0};
    final krFocusPomos = {'id': 'kr-pomos', 'objectiveId': 'o1', 'completionMode': 'focus_pomodoros', 'currentValue': 0};
    final krCompletedTasks = {'id': 'kr-tasks', 'objectiveId': 'o1', 'completionMode': 'completed_tasks', 'currentValue': 0};
    final krHabit = {'id': 'kr-habit', 'objectiveId': 'o1', 'completionMode': 'habit', 'habitId': 'h1', 'currentValue': 0};

    // Manual: 7
    expect(provider.getEffectiveCurrentValue(krManual), 7.0);

    // Focus hours: (4+2)*30 mins = 180 mins = 3.0 hours
    expect(provider.getEffectiveCurrentValue(krFocusHours), 3.0);

    // Focus pomodoros: 4+2 = 6
    expect(provider.getEffectiveCurrentValue(krFocusPomos), 6.0);

    // Completed tasks: t3 is completed, t4 is not = 1
    expect(provider.getEffectiveCurrentValue(krCompletedTasks), 1.0);

    // Habit: 2 ticks in May 2026
    expect(provider.getEffectiveCurrentValue(krHabit), 2.0);
  });

  test('StorageProvider KR CRUD and confidence update', () async {
    final tempDir = await Directory.systemTemp.createTemp('provider_kr_crud_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final okrStorage = OkrStorage(testDirectory: tempDir);
    final pomodoroStorage = PomodoroStorage(testDirectory: tempDir);

    final provider = StorageProvider(
      okrStorage: okrStorage,
      pomodoroStorage: pomodoroStorage,
    );

    await provider.saveKeyResult({
      'objectiveId': 'o1',
      'title': 'New KR',
      'targetValue': 10,
      'currentValue': 2,
      'unit': 'items',
      'completionMode': 'manual',
      'confidence': 'on_track',
    });

    expect(provider.keyResults.length, 1);
    final kr = provider.keyResults.first;
    expect(kr['title'], 'New KR');
    expect(kr['confidence'], 'on_track');

    final krId = kr['id'] as String;

    await provider.updateKRConfidence(krId, 'at_risk');
    expect(provider.keyResults.first['confidence'], 'at_risk');

    await provider.deleteKeyResult(krId);
    expect(provider.keyResults.isEmpty, true);
  });

  test('StorageProvider getEffectiveCurrentValueAsOf, repairReviews and syncKeyResultsFromReviews', () async {
    final tempDir = await Directory.systemTemp.createTemp('provider_review_repair_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final okrStorage = OkrStorage(testDirectory: tempDir);
    final pomodoroStorage = PomodoroStorage(testDirectory: tempDir);

    final provider = StorageProvider(
      okrStorage: okrStorage,
      pomodoroStorage: pomodoroStorage,
    );

    provider.cycles = [
      {'id': 'c1', 'month': 4, 'year': 2026, 'name': 'May 2026', 'isActive': true}
    ];
    provider.objectives = [
      {'id': 'o1', 'cycleId': 'c1', 'title': 'Obj 1'}
    ];
    provider.keyResults = [
      {
        'id': 'kr-1',
        'objectiveId': 'o1',
        'title': 'Focus Pomos KR',
        'targetValue': 10,
        'currentValue': 0,
        'completionMode': 'focus_pomodoros',
        'confidence': 'not_set',
      }
    ];
    provider.settings = {'focusDuration': 25};
    provider.tasks = [
      {'id': 't1', 'keyResultId': 'kr-1', 'completedPomodoros': 5, 'isCompleted': true, 'completedAt': '2026-05-06T10:00:00Z'}
    ];
    provider.history = [
      {
        'date': '2026-05-05',
        'completedPomodoros': 3,
        'sessions': [
          {'startedAt': '2026-05-05T09:00:00Z', 'type': 'focus', 'taskId': 't1', 'completed': true},
          {'startedAt': '2026-05-05T10:00:00Z', 'type': 'focus', 'taskId': 't1', 'completed': true},
          {'startedAt': '2026-05-05T11:00:00Z', 'type': 'focus', 'taskId': 't1', 'completed': true},
        ]
      },
      {
        'date': '2026-05-08',
        'completedPomodoros': 2,
        'sessions': [
          {'startedAt': '2026-05-08T09:00:00Z', 'type': 'focus', 'taskId': 't1', 'completed': true},
          {'startedAt': '2026-05-08T10:00:00Z', 'type': 'focus', 'taskId': 't1', 'completed': true},
        ]
      }
    ];

    // As of 2026-05-06: 3 sessions completed on May 5th
    final asOfMay6 = provider.getEffectiveCurrentValueAsOf(provider.keyResults.first, '2026-05-06');
    expect(asOfMay6, 3.0);

    // As of 2026-05-10: 3 + 2 = 5 sessions
    final asOfMay10 = provider.getEffectiveCurrentValueAsOf(provider.keyResults.first, '2026-05-10');
    expect(asOfMay10, 5.0);

    // Out-of-date review with stale entry values
    provider.reviews = [
      {
        'id': 'r1',
        'weekStartDate': '2026-05-04',
        'weekEndDate': '2026-05-10',
        'cycleId': 'c1',
        'completedAt': '2026-05-10T18:00:00Z',
        'entries': [
          {
            'keyResultId': 'kr-1',
            'previousValue': 0.0,
            'currentValue': 1.0, // Stale! Correct is 5.0
            'confidence': 'on_track',
          }
        ]
      }
    ];

    await provider.repairReviews();

    // Verify review entry currentValue repaired to 5.0
    final repairedEntry = provider.reviews.first['entries'].first;
    expect(repairedEntry['currentValue'], 5.0);

    // Verify keyResult currentValue synced from repaired review to 5.0 and confidence to on_track
    expect(provider.keyResults.first['currentValue'], 5.0);
    expect(provider.keyResults.first['confidence'], 'on_track');
  });

  test('StorageProvider handles Dropbox connect, disconnect, and syncData', () async {
    final tempDir = await Directory.systemTemp.createTemp('provider_sync_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final okrStorage = OkrStorage(testDirectory: tempDir);
    final pomodoroStorage = PomodoroStorage(testDirectory: tempDir);

    final provider = StorageProvider(
      okrStorage: okrStorage,
      pomodoroStorage: pomodoroStorage,
    );

    expect(provider.isDropboxConnected, false);
    expect(provider.lastSyncTime, isNull);

    // Initial sync reads prefs
    await provider.initSync();
    expect(provider.isDropboxConnected, false);

    // Disconnect when not connected should remain disconnected safely
    await provider.disconnectDropbox();
    expect(provider.isDropboxConnected, false);
  });
}



