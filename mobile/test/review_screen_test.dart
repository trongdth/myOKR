import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/review_screen.dart';
import 'package:myokr_mobile/src/screens/review_wizard_screen.dart';
import 'package:myokr_mobile/src/screens/review_history_widget.dart';
import 'package:myokr_mobile/src/screens/progress_chart_widget.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _FakeOkrStorageProvider extends StorageProvider {
  _FakeOkrStorageProvider()
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        );

  bool saveReviewCalled = false;
  bool deleteReviewCalled = false;

  @override
  Future<void> saveReview(Map<String, dynamic> review) async {
    saveReviewCalled = true;
    final idx = reviews.indexWhere((r) => r['id'] == review['id']);
    if (idx >= 0) {
      reviews[idx] = review;
    } else {
      reviews.add(review);
    }
    notifyListeners();
  }

  @override
  Future<void> deleteReview(String reviewId) async {
    deleteReviewCalled = true;
    reviews.removeWhere((r) => r['id'] == reviewId);
    notifyListeners();
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  Widget buildTestableWidget(Widget child) {
    return MaterialApp(
      home: child,
    );
  }

  testWidgets('ProgressChartWidget renders CustomPainter line chart and legend when reviews count >= 2', (WidgetTester tester) async {
    final keyResults = [
      {'id': 'kr1', 'title': 'Revenue KR', 'targetValue': 100, 'currentValue': 50}
    ];
    final reviews = [
      {
        'id': 'r1',
        'weekStartDate': '2026-05-04',
        'completedAt': '2026-05-10T18:00:00Z',
        'entries': [
          {'keyResultId': 'kr1', 'previousValue': 0, 'currentValue': 20}
        ]
      },
      {
        'id': 'r2',
        'weekStartDate': '2026-05-11',
        'completedAt': '2026-05-17T18:00:00Z',
        'entries': [
          {'keyResultId': 'kr1', 'previousValue': 20, 'currentValue': 50}
        ]
      }
    ];

    await tester.pumpWidget(buildTestableWidget(
      Scaffold(
        body: SingleChildScrollView(
          child: ProgressChartWidget(reviews: reviews, keyResults: keyResults),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('📈 Progress Over Time'), findsOneWidget);
    expect(find.text('Revenue KR'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('ReviewScreen renders header, cycle selector, week dropdown, and status card', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider();
    provider.isLoading = false;
    provider.cycles = [
      {'id': 'c1', 'name': 'May 2026', 'month': 4, 'year': 2026, 'isActive': true}
    ];
    provider.objectives = [
      {'id': 'o1', 'cycleId': 'c1', 'title': 'Objective 1'}
    ];
    provider.keyResults = [
      {'id': 'kr1', 'objectiveId': 'o1', 'title': 'KR 1', 'targetValue': 10, 'currentValue': 2, 'unit': 'hrs'}
    ];
    provider.reviews = [];

    await tester.pumpWidget(buildTestableWidget(ReviewScreen(provider: provider)));
    await tester.pumpAndSettle();

    expect(find.text('📋 Weekly Review'), findsOneWidget);
    expect(find.text('Cycle: '), findsOneWidget);
    expect(find.text('May 2026'), findsOneWidget);
    expect(find.text('Review for week of: '), findsOneWidget);
  });

  testWidgets('ReviewHistoryWidget renders past review card, expands details, and triggers delete dialog', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider();
    provider.isLoading = false;
    provider.cycles = [
      {'id': 'c1', 'name': 'May 2026', 'month': 4, 'year': 2026, 'isActive': true}
    ];
    provider.keyResults = [
      {'id': 'kr1', 'objectiveId': 'o1', 'title': 'Launch Feature', 'targetValue': 10, 'currentValue': 5, 'unit': 'pts', 'completionMode': 'manual'}
    ];
    provider.reviews = [
      {
        'id': 'r1',
        'weekStartDate': '2026-05-04',
        'weekEndDate': '2026-05-10',
        'cycleId': 'c1',
        'completedAt': '2026-05-10T18:00:00Z',
        'entries': [
          {
            'keyResultId': 'kr1',
            'previousValue': 0.0,
            'currentValue': 5.0,
            'confidence': 'on_track',
            'note': 'Great progress',
          }
        ],
        'reflection': 'Solid week overall',
        'pomodoroStats': {
          'totalPomodoros': 12,
          'totalFocusMinutes': 300,
          'tasksCompleted': 4,
        }
      }
    ];

    await tester.pumpWidget(buildTestableWidget(
      Scaffold(
        body: ReviewHistoryWidget(provider: provider, reviews: provider.reviews),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Week of 2026-05-04'), findsOneWidget);
    expect(find.text('🍅 12 pomos'), findsOneWidget);
    expect(find.text('⏱ 300m focus'), findsOneWidget);
    expect(find.text('✅ 4 tasks'), findsOneWidget);

    // Expand details
    await tester.tap(find.text('Week of 2026-05-04'));
    await tester.pumpAndSettle();

    expect(find.text('Launch Feature'), findsOneWidget);
    expect(find.text('0 → 5'), findsOneWidget);
    expect(find.text('Note: Great progress'), findsOneWidget);
    expect(find.text('Solid week overall'), findsOneWidget);

    // Tap delete icon to open confirmation dialog
    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();

    expect(find.text('Delete Review'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);

    // Confirm delete
    await tester.tap(find.widgetWithText(ElevatedButton, 'Delete'));
    await tester.pumpAndSettle();

    expect(provider.deleteReviewCalled, isTrue);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('ProgressChartWidget renders placeholder message when reviews count < 2', (WidgetTester tester) async {
    final keyResults = [
      {'id': 'kr1', 'title': 'Revenue KR', 'targetValue': 100, 'currentValue': 20}
    ];
    final reviews = [
      {
        'id': 'r1',
        'weekStartDate': '2026-05-04',
        'completedAt': '2026-05-10T18:00:00Z',
        'entries': [
          {'keyResultId': 'kr1', 'previousValue': 0, 'currentValue': 20}
        ]
      }
    ];

    await tester.pumpWidget(buildTestableWidget(
      Scaffold(
        body: ProgressChartWidget(reviews: reviews, keyResults: keyResults),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('📈 Progress Over Time'), findsOneWidget);
    expect(find.text('Complete at least 2 weekly reviews to see your progress chart'), findsOneWidget);
  });

  testWidgets('ReviewWizardScreen renders summary step and progresses through KR step to completion', (WidgetTester tester) async {
    final provider = _FakeOkrStorageProvider();
    provider.cycles = [
      {'id': 'c1', 'name': 'Q2 2026', 'startDate': '2026-04-01', 'endDate': '2026-06-30'}
    ];
    provider.objectives = [
      {'id': 'obj1', 'cycleId': 'c1', 'title': 'Increase MRR'}
    ];
    provider.keyResults = [
      {'id': 'kr1', 'objectiveId': 'obj1', 'title': 'Reach \$10k MRR', 'targetValue': 100, 'currentValue': 40, 'completionMode': 'manual'}
    ];

    await tester.pumpWidget(buildTestableWidget(
      Scaffold(
        body: ReviewWizardScreen(
          weekStart: '2026-05-04',
          weekEnd: '2026-05-10',
          cycleId: 'c1',
          provider: provider,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    // Step 1 of 3: Summary Step
    expect(find.text('Step 1 of 3'), findsOneWidget);
    expect(find.text('📊 This Week\'s Summary'), findsOneWidget);
    expect(find.text('Pomodoros'), findsOneWidget);
    expect(find.text('Focus Time'), findsOneWidget);
    expect(find.text('Tasks Done'), findsOneWidget);

    // Advance to Step 2 of 3: KR Step
    await tester.tap(find.text('Next →'));
    await tester.pumpAndSettle();

    expect(find.text('Step 2 of 3'), findsOneWidget);
    expect(find.text('🎯 Increase MRR'), findsOneWidget);
    expect(find.text('Reach \$10k MRR'), findsOneWidget);
    expect(find.text('🟢 On Track'), findsOneWidget);

    // Tap confidence
    await tester.tap(find.text('🟢 On Track'));
    await tester.pumpAndSettle();

    // Advance to Step 3 of 3: Reflection Step
    await tester.tap(find.text('Next →'));
    await tester.pumpAndSettle();

    expect(find.text('Step 3 of 3'), findsOneWidget);
    expect(find.text('💭 Overall Reflection'), findsOneWidget);
    expect(find.text('✅ Complete Review'), findsOneWidget);

    // Complete Review
    await tester.tap(find.text('✅ Complete Review'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(provider.saveReviewCalled, isTrue);
  });
}

