import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/screens/progress_chart_widget.dart';

void main() {
  group('buildChartData', () {
    test('gap weeks do not produce fabricated 0.0 points', () {
      final keyResults = [
        {'id': 'kr1', 'title': 'Revenue', 'targetValue': 100},
        {'id': 'kr2', 'title': 'Zero target', 'targetValue': 0},
      ];
      final reviews = [
        {
          'weekStartDate': '2026-05-04',
          'entries': [
            {'keyResultId': 'kr1', 'currentValue': 20},
          ]
        },
        {
          'weekStartDate': '2026-05-11',
          'entries': [
            {'keyResultId': 'kr1', 'currentValue': 50},
          ]
        },
        {
          'weekStartDate': '2026-05-18',
          'entries': [
            // kr1 has NO entry this week (data gap); kr2's target is 0.
            {'keyResultId': 'kr2', 'currentValue': 10},
          ]
        },
      ];

      final data = buildChartData(
          sortedReviews: reviews, keyResults: keyResults);

      final kr1 = data.seriesList.firstWhere((s) => s.krId == 'kr1');
      // Two real points at review indices 0 and 1 — the missing week is a
      // gap, not a 0% drop.
      expect(kr1.points.length, 2);
      expect(kr1.points.map((p) => p.dx).toList(), [0.0, 1.0]);

      final kr2 = data.seriesList.firstWhere((s) => s.krId == 'kr2');
      expect(kr2.points, isEmpty); // zero target → no points at all
    });
  });

  group('ProgressChartWidget repaint decision', () {
    Widget wrap(List<Map<String, dynamic>> reviews,
        List<Map<String, dynamic>> keyResults) {
      return MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ProgressChartWidget(
              reviews: reviews,
              keyResults: keyResults,
            ),
          ),
        ),
      );
    }

    final keyResults = [
      {'id': 'kr1', 'title': 'Revenue KR', 'targetValue': 100},
    ];
    List<Map<String, dynamic>> reviews(int n) {
      return List.generate(n, (i) {
        return {
          'id': 'r$i',
          'weekStartDate': '2026-05-0${i + 4}',
          'completedAt': '2026-05-10T18:00:00Z',
          'entries': [
            {'keyResultId': 'kr1', 'currentValue': (i + 1) * 10},
          ]
        };
      });
    }

    testWidgets('same data does not repaint; new review forces a repaint',
        (tester) async {
      final chartPaint = find.descendant(
        of: find.byType(ProgressChartWidget),
        matching: find.byType(CustomPaint),
      );

      await tester.pumpWidget(wrap(reviews(2), keyResults));
      final painterA = tester.renderObject<RenderCustomPaint>(chartPaint).painter!;

      // Identical data → no repaint.
      await tester.pumpWidget(wrap(reviews(2), keyResults));
      final painterB = tester.renderObject<RenderCustomPaint>(chartPaint).painter!;
      expect(painterB.shouldRepaint(painterA), isFalse);

      // A new weekly review → the chart must repaint (ticket 04).
      await tester.pumpWidget(wrap(reviews(3), keyResults));
      final painterC = tester.renderObject<RenderCustomPaint>(chartPaint).painter!;
      expect(painterC.shouldRepaint(painterB), isTrue);
    });

    testWidgets('legend hides series with no points (zero target)',
        (tester) async {
      final keyResultsWithZero = [
        {'id': 'kr1', 'title': 'Revenue KR', 'targetValue': 100},
        {'id': 'kr2', 'title': 'Zero target', 'targetValue': 0},
      ];
      final reviewsWithZero = reviews(2).map((r) {
        r['entries'] = [
          {'keyResultId': 'kr1', 'currentValue': 10},
          {'keyResultId': 'kr2', 'currentValue': 5},
        ];
        return r;
      }).toList();

      await tester.pumpWidget(wrap(reviewsWithZero, keyResultsWithZero));

      expect(find.text('Revenue KR'), findsOneWidget);
      expect(find.text('Zero target'), findsNothing); // no phantom swatch
    });
  });
}
