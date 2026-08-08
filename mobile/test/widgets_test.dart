import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/widgets/timer_ring.dart';
import 'package:myokr_mobile/src/widgets/myokr_card.dart';

void main() {
  testWidgets('TimerRing renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TimerRing(
            progress: 0.75,
            timeText: '25:00',
            labelText: 'Focus',
            isBreak: false,
          ),
        ),
      ),
    );

    expect(find.text('25:00'), findsOneWidget);
    expect(find.text('Focus'), findsOneWidget);
    
    // CustomPaint is used internally by Text etc, so find the specific one inside TimerRing
    expect(find.descendant(of: find.byType(TimerRing), matching: find.byType(CustomPaint)), findsWidgets);
  });

  testWidgets('MyOkrCard renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MyOkrCard(
            child: Text('Card Content'),
          ),
        ),
      ),
    );

    expect(find.text('Card Content'), findsOneWidget);
    expect(find.byType(Card), findsOneWidget);
  });
}
