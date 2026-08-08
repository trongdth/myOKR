import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:myokr_mobile/src/rust/frb_generated.dart';
import 'package:myokr_mobile/src/okr_storage.dart';

void main() {
  setUpAll(() async {
    await RustLib.init(
      externalLibrary: Platform.isMacOS 
        ? ExternalLibrary.open('rust/target/debug/librust_lib_myokr_mobile.dylib')
        : null,
    );
  });

  test('OkrStorage CRUD and defensive normalization tests', () async {
    final tempDir = await Directory.systemTemp.createTemp('okr_test');
    addTearDown(() => tempDir.delete(recursive: true));
    final storage = OkrStorage(testDirectory: tempDir);

    // 1. Initial state should be empty
    final initialCycles = await storage.loadCycles();
    expect(initialCycles, isEmpty);

    // 2. Add a cycle
    final newCycle = {
      'id': 'cycle-1',
      'name': 'Test Cycle',
      'month': 5,
      'year': 2026,
      'isActive': true,
      'createdAt': '2026-06-23T00:00:00.000Z'
    };
    await storage.saveCycles([newCycle]);

    // 3. Load and verify
    final loadedCycles = await storage.loadCycles();
    expect(loadedCycles.length, 1);
    expect(loadedCycles[0]['id'], 'cycle-1');
    expect(loadedCycles[0]['name'], 'Test Cycle');
    expect(loadedCycles[0]['month'], 5);
    expect(loadedCycles[0]['year'], 2026);
    expect(loadedCycles[0]['isActive'], true);

    // 4. Test Key Results with malformed confidence & completionMode
    final malformedKR = {
      'id': 'kr-1',
      'objectiveId': 'obj-1',
      'title': 'Test KR',
      'targetValue': 'not a number',
      'confidence': 'super_high',
      'completionMode': 'unknown_mode',
    };
    await storage.saveKeyResults([malformedKR]);

    final loadedKRs = await storage.loadKeyResults();
    expect(loadedKRs.length, 1);
    expect(loadedKRs[0]['targetValue'], 0);
    expect(loadedKRs[0]['confidence'], 'not_set');
    expect(loadedKRs[0]['completionMode'], 'manual');

    // 5. Test Reviews array saving and loading
    final reviewData = [
      {
        'id': 'rev-1',
        'weekStartDate': '2026-05-04',
        'weekEndDate': '2026-05-10',
        'cycleId': 'cycle-1',
        'entries': [],
        'pomodoroStats': {
          'totalPomodoros': 10,
          'totalFocusMinutes': 250,
          'tasksCompleted': 3,
          'pomodorosByKeyResult': {},
        },
      }
    ];
    await storage.saveReviews(reviewData);

    final loadedReviews = await storage.loadReviews();
    expect(loadedReviews.length, 1);
    expect(loadedReviews[0]['id'], 'rev-1');
    expect(loadedReviews[0]['pomodoroStats']['totalPomodoros'], 10);
  });
}
