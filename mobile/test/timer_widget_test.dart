import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/timer_screen.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/services/focus_music.dart';


class FakeStorageProvider extends ChangeNotifier implements StorageProvider {
  @override
  bool isLoading = false;

  @override
  Map<String, dynamic> get settings => PomodoroStorage.defaultSettings;


  @override
  List<Map<String, dynamic>> tasks = [];

  @override
  List<Map<String, dynamic>> history = [];

  @override
  List<Map<String, dynamic>> keyResults = [];

  @override
  List<Map<String, dynamic>> cycles = [];

  @override
  List<Map<String, dynamic>> objectives = [];

  @override
  List<Map<String, dynamic>> reviews = [];

  @override
  String? activeTaskId;

  @override
  FocusMusicController? focusMusic;

  @override
  Map<String, dynamic>? get activeCycle => null;




  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    tasks = newTasks;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
        'StorageProvider member not stubbed: ${invocation.memberName}');
  }
}

void main() {
  testWidgets('TimerScreen renders tabs and controls', (WidgetTester tester) async {
    final fakeProvider = FakeStorageProvider();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TimerScreen(provider: fakeProvider),
      ),
    ));

    // Verify TabBar items exist
    expect(find.text('Timer'), findsOneWidget);
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Analytics'), findsOneWidget);

    // Verify default timer text is present (25:00 for Focus)
    expect(find.text('25:00'), findsOneWidget);
    
    // Verify the session types
    expect(find.text('Focus'), findsWidgets);
    expect(find.text('Short Break'), findsOneWidget);
    expect(find.text('Long Break'), findsOneWidget);

    // Verify controls (Start button)
    expect(find.text('Start'), findsOneWidget);

    // Scroll to the start button if it's off-screen
    await tester.ensureVisible(find.text('Start'));
    
    // Tap the start button
    await tester.tap(find.text('Start'));
    await tester.pump();

    // Verify it changed to Pause
    expect(find.text('Pause'), findsOneWidget);

    // Tap Tasks Tab — pumpAndSettle capped at 2s of fake time instead of the
    // default 10min: a session timer that actually ticks would never settle,
    // and the cap turns that latent hang into a fast failure (ticket 11).
    await tester.tap(find.text('Tasks'));
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 2),
    );

    expect(find.text('What are you working on?'), findsOneWidget);
  });

  testWidgets('TimerScreen can add a new task', (WidgetTester tester) async {
    final fakeProvider = FakeStorageProvider();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TimerScreen(provider: fakeProvider),
      ),
    ));

    // Tap Tasks Tab
    await tester.tap(find.text('Tasks'));
    await tester.pumpAndSettle();

    // Enter a new task
    await tester.enterText(find.byType(TextField), 'Read a book');
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();

    // Verify task is added to the list
    expect(find.text('Read a book'), findsOneWidget);
  });

  testWidgets('add-task failure shows a snackbar and keeps the typed text',
      (WidgetTester tester) async {
    final fakeProvider = _ThrowingTimerProvider();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TimerScreen(provider: fakeProvider),
      ),
    ));

    await tester.tap(find.text('Tasks'));
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 2),
    );

    await tester.enterText(find.byType(TextField), 'Read a book');
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();

    expect(find.textContaining('Failed to save'), findsOneWidget);
    expect(find.text('Read a book'), findsOneWidget); // controller not cleared
  });
}

class _ThrowingTimerProvider extends FakeStorageProvider {
  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async =>
      throw Exception('disk full');
}
