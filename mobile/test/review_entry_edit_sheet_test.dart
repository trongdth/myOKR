import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/screens/review_entry_edit_sheet.dart';

void main() {
  Future<void> openSheet(
    WidgetTester tester,
    Map<String, dynamic> entry,
    Map<String, dynamic> keyResult,
    ValueChanged<Map<String, dynamic>> onSave,
  ) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  builder: (_) => ReviewEntryEditSheet(
                    entry: entry,
                    keyResult: keyResult,
                    onSave: onSave,
                  ),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('shows the stored value with full precision', (tester) async {
    await openSheet(
      tester,
      {'currentValue': 3.14159, 'confidence': 'on_track'},
      {'title': 'Ship feature', 'completionMode': 'manual'},
      (_) {},
    );

    expect(find.text('3.14159'), findsOneWidget);
  });

  testWidgets('saving without editing keeps the full-precision value', (tester) async {
    Map<String, dynamic>? saved;
    await openSheet(
      tester,
      {'currentValue': 3.14159, 'confidence': 'on_track'},
      {'title': 'Ship feature', 'completionMode': 'manual'},
      (updated) => saved = updated,
    );

    await tester.ensureVisible(find.text('Save Changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    expect(saved?['currentValue'], 3.14159);
  });
}
