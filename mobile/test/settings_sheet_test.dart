import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/widgets/settings_sheet.dart';

// Regression test for ADR-0004 (read-modify-write saves). The old
// settings_sheet._saveSettings built a 6-field literal and dropped any sibling
// key the other app had written (notably desktop's focusMusicEnabled). After the
// fix it must build from the loaded settings so sibling keys survive.
//
// This fake captures the payload passed to saveSettings without touching disk.
class _SettingsCaptureProvider extends ChangeNotifier
    implements StorageProvider {
  @override
  Map<String, dynamic> settings;

  final List<Map<String, dynamic>> savedPayloads = [];

  _SettingsCaptureProvider(this.settings);

  @override
  Future<void> saveSettings(Map<String, dynamic> newSettings) async {
    savedPayloads.add(newSettings);
    settings = newSettings;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
        'StorageProvider member not stubbed: ${invocation.memberName}');
  }
}

void main() {
  testWidgets(
      'saving settings preserves sibling keys (focusMusicEnabled) — ADR-0004',
      (tester) async {
    final fake = _SettingsCaptureProvider({
      'focusDuration': 25,
      'shortBreakDuration': 5,
      'longBreakDuration': 15,
      'pomosBeforeLongBreak': 4,
      'autoStartBreaks': false,
      'autoStartFocus': false,
      // A sibling key desktop wrote that mobile's settings_sheet does not edit.
      'focusMusicEnabled': true,
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsSheet(provider: fake)),
    ));

    // Toggling a switch triggers _saveSettings with the edited field.
    final firstSwitch = find.byType(Switch).first;
    await tester.ensureVisible(firstSwitch);
    await tester.tap(firstSwitch);
    await tester.pump();

    expect(fake.savedPayloads, isNotEmpty,
        reason: 'a save should have fired on toggle');
    final payload = fake.savedPayloads.last;
    expect(payload['autoStartBreaks'], isTrue, // the edit was applied
        reason: 'toggled field should change');
    expect(payload['focusMusicEnabled'], isTrue, // sibling preserved — the fix
        reason: 'ADR-0004: sibling keys must survive a settings save');
  });

  testWidgets(
      'Focus Music toggle persists focusMusicEnabled and keeps siblings (ADR-0005)',
      (tester) async {
    final fake = _SettingsCaptureProvider({
      'focusDuration': 25,
      'shortBreakDuration': 5,
      'longBreakDuration': 15,
      'pomosBeforeLongBreak': 4,
      'autoStartBreaks': false,
      'autoStartFocus': false,
      'focusMusicEnabled': false,
      // A sibling key desktop wrote that the toggle must not erase.
      'soundTheme': 'rain',
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsSheet(provider: fake)),
    ));

    // Focus Music is the third switch (auto-start Breaks, auto-start Focus, then it).
    final focusMusicSwitch = find.byType(Switch).at(2);
    await tester.ensureVisible(focusMusicSwitch);
    await tester.tap(focusMusicSwitch);
    await tester.pump();

    expect(fake.savedPayloads, isNotEmpty, reason: 'a save should fire on toggle');
    final payload = fake.savedPayloads.last;
    expect(payload['focusMusicEnabled'], isTrue, // the edit was applied
        reason: 'Focus Music toggle should flip focusMusicEnabled');
    expect(payload['soundTheme'], 'rain', // sibling preserved (read-modify-write)
        reason: 'ADR-0004: a settings save must not erase sibling keys');
  });

  testWidgets('a slider drag fires exactly one save, not one per tick',
      (tester) async {
    final fake = _SettingsCaptureProvider({
      'focusDuration': 25,
      'shortBreakDuration': 5,
      'longBreakDuration': 15,
      'pomosBeforeLongBreak': 4,
      'autoStartBreaks': false,
      'autoStartFocus': false,
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsSheet(provider: fake)),
    ));

    final slider = find.byType(Slider).first;
    await tester.ensureVisible(slider);
    // A long drag generates many onChanged ticks.
    await tester.timedDrag(slider, const Offset(120, 0),
        const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    expect(fake.savedPayloads.length, 1);
  });

  testWidgets('non-gesture value changes persist the slider value', (tester) async {
    final fake = _SettingsCaptureProvider({
      'focusDuration': 25,
      'shortBreakDuration': 5,
      'longBreakDuration': 15,
      'pomosBeforeLongBreak': 4,
      'autoStartBreaks': false,
      'autoStartFocus': false,
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsSheet(provider: fake)),
    ));

    final slider = find.byType(Slider).first;
    await tester.ensureVisible(slider);
    await tester.tap(slider); // one gesture (saves on end)
    await tester.pump();
    final savesAfterTap = fake.savedPayloads.length;
    expect(savesAfterTap, greaterThanOrEqualTo(1));

    // Keyboard arrows and a11y actions fire the slider's onChanged with NO
    // gesture end (the test framework doesn't dispatch those inputs, so
    // invoke the callback directly — it is the same entry point). The
    // change must still persist (ticket 30).
    tester.widget<Slider>(slider).onChanged!(30.0);
    await tester.pump();

    expect(fake.savedPayloads.length, greaterThan(savesAfterTap));
  });
}
