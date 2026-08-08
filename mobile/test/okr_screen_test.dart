import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/okr_screen.dart';

class _FakeOkrStorageProvider extends StorageProvider {
  _FakeOkrStorageProvider({
    required List<Map<String, dynamic>> testCycles,
    required List<Map<String, dynamic>> testObjectives,
    required List<Map<String, dynamic>> testKeyResults,
  }) : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    cycles = testCycles;
    objectives = testObjectives;
    keyResults = testKeyResults;
    if (testCycles.isNotEmpty) {
      selectedCycleId = testCycles.first['id'] as String?;
    }
    isLoading = false;
  }

  @override
  Future<void> createNextCycle() async {
    final newCycle = {
      'id': 'cycle-june',
      'name': 'June 2026',
      'month': 5,
      'year': 2026,
      'isActive': false,
      'createdAt': DateTime.now().toIso8601String(),
    };
    cycles = [...cycles, newCycle];
    selectedCycleId = 'cycle-june';
    notifyListeners();
  }

  @override
  Future<void> cloneActiveCycle() async {
    final newCycle = {
      'id': 'cycle-cloned',
      'name': 'June 2026',
      'month': 5,
      'year': 2026,
      'isActive': false,
      'createdAt': DateTime.now().toIso8601String(),
    };
    cycles = [...cycles, newCycle];
    selectedCycleId = 'cycle-cloned';
    notifyListeners();
  }

  @override
  Future<void> saveObjective(Map<String, dynamic> obj) async {
    final item = Map<String, dynamic>.from(obj);
    if (item['id'] == null || (item['id'] as String).isEmpty) {
      item['id'] = 'obj-new';
    }
    final existingIdx = objectives.indexWhere((o) => o['id'] == item['id']);
    if (existingIdx >= 0) {
      objectives[existingIdx] = item;
    } else {
      objectives.add(item);
    }
    notifyListeners();
  }

  @override
  Future<void> deleteObjective(String objId) async {
    objectives.removeWhere((o) => o['id'] == objId);
    keyResults.removeWhere((kr) => kr['objectiveId'] == objId);
    notifyListeners();
  }

  @override
  Future<void> saveKeyResult(Map<String, dynamic> kr) async {
    final item = Map<String, dynamic>.from(kr);
    if (item['id'] == null || (item['id'] as String).isEmpty) {
      item['id'] = 'kr-new';
    }
    final existingIdx = keyResults.indexWhere((k) => k['id'] == item['id']);
    if (existingIdx >= 0) {
      keyResults[existingIdx] = item;
    } else {
      keyResults.add(item);
    }
    notifyListeners();
  }

  @override
  Future<void> deleteKeyResult(String krId) async {
    keyResults.removeWhere((kr) => kr['id'] == krId);
    notifyListeners();
  }

  @override
  Future<void> updateKRConfidence(String krId, String confidence) async {
    final idx = keyResults.indexWhere((kr) => kr['id'] == krId);
    if (idx >= 0) {
      keyResults[idx]['confidence'] = confidence;
      notifyListeners();
    }
  }
}

class _FailingOkrStorageProvider extends _FakeOkrStorageProvider {
  _FailingOkrStorageProvider({
    required super.testCycles,
    required super.testObjectives,
    required super.testKeyResults,
  });

  @override
  Future<void> saveObjective(Map<String, dynamic> obj) async =>
      throw Exception('disk full');
}

class _FakeOkrStorage extends OkrStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePomodoroStorage extends PomodoroStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('OkrScreen renders cycle header and opens management sheet', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider(
      testCycles: [
        {
          'id': 'cycle-1',
          'name': 'May 2026',
          'month': 4,
          'year': 2026,
          'isActive': true,
          'createdAt': '2026-05-01T00:00:00Z',
        }
      ],
      testObjectives: [
        {
          'id': 'obj-1',
          'cycleId': 'cycle-1',
          'title': 'Ship Mobile App',
          'order': 0,
        }
      ],
      testKeyResults: [
        {
          'id': 'kr-1',
          'objectiveId': 'obj-1',
          'title': 'Complete UI',
          'targetValue': 10,
          'currentValue': 5,
          'unit': 'tasks',
          'confidence': 'on_track',
          'completionMode': 'manual',
        }
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: OkrScreen(provider: provider),
      ),
    );

    expect(find.text('May 2026 ▾'), findsOneWidget);
    expect(find.text('50%'), findsNWidgets(2));


    await tester.tap(find.text('May 2026 ▾'));
    await tester.pumpAndSettle();

    expect(find.text('Cycle Management'), findsOneWidget);
    expect(find.text('+ Add Next Month'), findsOneWidget);
    expect(find.text('📋 Clone Current Cycle'), findsOneWidget);

    await tester.tap(find.text('📋 Clone Current Cycle'));
    await tester.pumpAndSettle();

    expect(find.text('June 2026 ▾'), findsOneWidget);
  });

  testWidgets('saveObjective failure shows a snackbar and keeps the sheet open', (WidgetTester tester) async {
    final provider = _FailingOkrStorageProvider(
      testCycles: [
        {
          'id': 'cycle-1',
          'name': 'May 2026',
          'month': 4,
          'year': 2026,
          'isActive': true,
          'createdAt': '2026-05-01T00:00:00Z',
        }
      ],
      testObjectives: [],
      testKeyResults: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: OkrScreen(provider: provider),
      ),
    );

    await tester.tap(find.text('+ Add Objective'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('obj_title_input')), 'Doomed');
    await tester.tap(find.text('Save Objective'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Failed to save'), findsOneWidget);
    expect(find.text('New Objective'), findsOneWidget); // sheet still open
  });

  testWidgets('OkrScreen allows adding and editing objectives via bottom sheet', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider(
      testCycles: [
        {
          'id': 'cycle-1',
          'name': 'May 2026',
          'month': 4,
          'year': 2026,
          'isActive': true,
          'createdAt': '2026-05-01T00:00:00Z',
        }
      ],
      testObjectives: [],
      testKeyResults: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: OkrScreen(provider: provider),
      ),
    );

    expect(find.text('+ Add Objective'), findsOneWidget);
    await tester.tap(find.text('+ Add Objective'));
    await tester.pumpAndSettle();

    expect(find.text('New Objective'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('obj_title_input')), 'Launch Feature X');
    await tester.enterText(find.byKey(const Key('obj_reward_input')), 'Coffee Badge');
    await tester.tap(find.text('Save Objective'));
    await tester.pumpAndSettle();

    expect(find.text('🎯 Launch Feature X'), findsOneWidget);
    expect(find.text('🏆 Coffee Badge'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Edit Objective'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('obj_title_input')), 'Launch Feature Y');
    await tester.tap(find.text('Save Objective'));
    await tester.pumpAndSettle();

    expect(find.text('🎯 Launch Feature Y'), findsOneWidget);
  });

  testWidgets('OkrScreen displays Key Result row, updates confidence pill and manual increment/decrement', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider(
      testCycles: [
        {
          'id': 'cycle-1',
          'name': 'May 2026',
          'month': 4,
          'year': 2026,
          'isActive': true,
          'createdAt': '2026-05-01T00:00:00Z',
        }
      ],
      testObjectives: [
        {
          'id': 'obj-1',
          'cycleId': 'cycle-1',
          'title': 'Ship Mobile App',
        }
      ],
      testKeyResults: [
        {
          'id': 'kr-1',
          'objectiveId': 'obj-1',
          'title': 'Build 5 Widgets',
          'targetValue': 5,
          'currentValue': 2,
          'unit': 'widgets',
          'confidence': 'on_track',
          'completionMode': 'manual',
        }
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: OkrScreen(provider: provider),
      ),
    );

    expect(find.text('Build 5 Widgets'), findsOneWidget);
    expect(find.text('2 / 5 widgets'), findsOneWidget);
    expect(find.text('🟢 On Track'), findsOneWidget);

    // Tap confidence pill to change to At Risk
    await tester.tap(find.byKey(const Key('confidence_pill')));
    await tester.pumpAndSettle();

    expect(find.text('Update Confidence Status'), findsOneWidget);
    await tester.tap(find.text('At Risk'));
    await tester.pumpAndSettle();

    expect(find.text('🟡 At Risk'), findsOneWidget);

    // Increment manual value
    await tester.tap(find.byKey(const Key('kr_inc_kr-1')));
    await tester.pumpAndSettle();

    expect(find.text('3 / 5 widgets'), findsOneWidget);
  });

  testWidgets('OkrScreen allows adding a new Key Result via bottom sheet', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider(
      testCycles: [
        {
          'id': 'cycle-1',
          'name': 'May 2026',
          'month': 4,
          'year': 2026,
          'isActive': true,
          'createdAt': '2026-05-01T00:00:00Z',
        }
      ],
      testObjectives: [
        {
          'id': 'obj-1',
          'cycleId': 'cycle-1',
          'title': 'Ship Mobile App',
        }
      ],
      testKeyResults: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: OkrScreen(provider: provider),
      ),
    );

    expect(find.text('+ Add Key Result'), findsOneWidget);
    await tester.tap(find.text('+ Add Key Result'));
    await tester.pumpAndSettle();

    expect(find.text('New Key Result'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('kr_title_input')), 'Write 10 Tests');
    await tester.enterText(find.byKey(const Key('kr_target_input')), '10');
    await tester.enterText(find.byKey(const Key('kr_unit_input')), 'tests');

    await tester.tap(find.byKey(const Key('save_kr_btn')));
    await tester.pumpAndSettle();

    expect(find.text('Write 10 Tests'), findsOneWidget);
    expect(find.text('0 / 10 tests'), findsOneWidget);
  });
}

