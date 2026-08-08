import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/theme.dart';

void main() {
  testWidgets('AppTheme instantiates without errors', (WidgetTester tester) async {
    final theme = AppTheme.darkTheme;
    
    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        home: const Scaffold(
          body: Text('Theme Test'),
        ),
      ),
    );

    expect(find.text('Theme Test'), findsOneWidget);
    
    final scaffoldContext = tester.element(find.byType(Scaffold));
    final resolvedTheme = Theme.of(scaffoldContext);
    expect(resolvedTheme.scaffoldBackgroundColor, AppTheme.bgPrimary);
  });
}
