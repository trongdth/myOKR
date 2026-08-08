import 'dart:convert';

import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_normalizer.dart';
import 'package:shared_preferences/shared_preferences.dart';

// TimerState is device-local (ADR-0002): the running timer's ephemeral state
// lives in shared_preferences, not the synced Automerge doc. The migrated flag
// makes the one-time doc → prefs copy genuinely read-once.
const String _kTimerStatePrefKey = 'myokr_timer_state';
const String _kTimerStateMigratedKey = 'myokr_timer_state_migrated';

class PomodoroStorage extends OkrStorage {
  PomodoroStorage({super.testDirectory});

  static const defaultSettings = {
    'focusDuration': 25,
    'shortBreakDuration': 5,
    'longBreakDuration': 15,
    'pomosBeforeLongBreak': 4,
    'autoStartBreaks': true, // posture ii (matches desktop)
    'autoStartFocus': false,
  };

  // --- Settings ---
  // Normalized on load (bounds clamped, booleans defaulted, focusMusicEnabled
  // preserved/injected). Mirrors desktop loadSettings: try/catch → defaults.
  Future<Map<String, dynamic>> loadSettings() async {
    try {
      return normalizeSettings(await getProperty('settings'));
    } catch (_) {
      return normalizeSettings(null);
    }
  }

  // Read-modify-write (ADR-0004): merge the changed settings onto the RAW doc
  // object, never a wholesale replace. normalizeSettings builds a fixed-shape map,
  // so loading through it would drop unknown sibling keys the other app wrote;
  // reading the raw value here is what lets a future field (desktop's
  // focusMusicEnabled today, anything either app adds tomorrow) survive a mobile
  // save and reach the other device on the next sync.
  Future<void> saveSettings(Map<String, dynamic> settings) async {
    final merged = Map<String, dynamic>.from(await _loadRawSettings())
      ..addAll(settings);
    await saveProperty('settings', merged);
  }

  // Wholesale wipe used by "Clear All Data". Distinct from saveSettings({}),
  // which under read-modify-write semantics means "change nothing". Mirrors
  // clearTimerState.
  Future<void> clearSettings() async {
    await saveProperty('settings', null);
  }

  // The raw (un-normalized) doc settings, or an empty map when absent/hostile.
  // Only String keys are carried (JSON object keys are always strings); a
  // defensive copy that mirrors normalizeTask, so a malformed merge can't crash
  // the write path.
  Future<Map<String, dynamic>> _loadRawSettings() async {
    try {
      final raw = await getProperty('settings');
      if (raw is Map) {
        final result = <String, dynamic>{};
        for (final entry in raw.entries) {
          if (entry.key is String) {
            result[entry.key as String] = entry.value;
          }
        }
        return result;
      }
    } catch (_) {
      // Absent or unreadable → treat as empty; the merge then writes only the
      // caller's settings.
    }
    return <String, dynamic>{};
  }

  // --- Tasks ---
  Future<List<Map<String, dynamic>>> loadTasks() async {
    try {
      final data = await getProperty('tasks');
      if (data is! List) return <Map<String, dynamic>>[];
      return data
          .map((e) => normalizeTask(e))
          .whereType<Map<String, dynamic>>()
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> saveTasks(List<Map<String, dynamic>> tasks) async {
    await saveProperty('tasks', tasks);
  }

  // --- History ---
  Future<List<Map<String, dynamic>>> loadHistory() async {
    try {
      final data = await getProperty('history');
      if (data is! List) return <Map<String, dynamic>>[];
      return data
          .map((e) => normalizeDailyRecord(e))
          .whereType<Map<String, dynamic>>()
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> saveHistory(List<Map<String, dynamic>> history) async {
    await saveProperty('history', history);
  }

  // --- Timer State (device-local, ADR-0002) ---
  // The running timer's ephemeral state lives in shared_preferences (mobile's
  // localStorage analog), NOT the synced Automerge doc, so a focus session
  // started on one device never appears as a running timer on the other. A
  // one-time migration adopts any timerState the doc still carries from the old
  // app version; the doc key is deliberately left in place (not deleted) because
  // deleting it would itself be a doc mutation that syncs, for no functional
  // gain. Both apps ignore doc.timerState; completed sessions still record to
  // shared history exactly as before.
  Future<Map<String, dynamic>?> loadTimerState() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kTimerStatePrefKey);
    if (raw != null) {
      try {
        return normalizeTimerState(jsonDecode(raw));
      } catch (_) {
        // Corrupt device-local state — discard rather than crash; the timer reads
        // as "not running". Mirrors the try/catch every other load path in this
        // file applies to untrusted bytes. The doc is never touched (ADR-0002).
        await prefs.remove(_kTimerStatePrefKey);
        return null;
      }
    }
    // Device storage empty — one-time migration from the doc (read-once).
    if (!(prefs.getBool(_kTimerStateMigratedKey) ?? false)) {
      Map<String, dynamic>? fromDoc;
      try {
        fromDoc = normalizeTimerState(await getProperty('timerState'));
      } catch (_) {
        fromDoc = null;
      }
      if (fromDoc != null) {
        await prefs.setString(_kTimerStatePrefKey, jsonEncode(fromDoc));
      }
      // Set the flag AFTER the value write so a failed write retries next load.
      await prefs.setBool(_kTimerStateMigratedKey, true);
      return fromDoc;
    }
    return null;
  }

  Future<void> saveTimerState(Map<String, dynamic> state) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kTimerStatePrefKey, jsonEncode(state));
    // Any write marks us past migration, so the doc is never re-read afterwards.
    await prefs.setBool(_kTimerStateMigratedKey, true);
  }

  Future<void> clearTimerState() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kTimerStatePrefKey);
    await prefs.setBool(_kTimerStateMigratedKey, true);
  }
}
