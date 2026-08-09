import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/rust/api/simple.dart';
import 'package:myokr_mobile/src/services/focus_music.dart';
import 'package:myokr_mobile/src/today_focus.dart';

const List<String> kMonthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

String getMonthName(int month, int year) {
  final mName = (month >= 0 && month < 12) ? kMonthNames[month] : 'Month';
  return '$mName $year';
}

class StorageProvider extends ChangeNotifier {
  final OkrStorage okrStorage;
  final PomodoroStorage pomodoroStorage;
  final DropboxService dropboxService;

  bool isLoading = true;

  // Sync state
  bool isSyncing = false;
  String? syncError;
  String? lastSyncTime;
  String? dropboxClientId;
  String? dropboxRefreshToken;
  Timer? _syncTimer;

  bool get isDropboxConnected =>
      dropboxClientId != null &&
      dropboxClientId!.isNotEmpty &&
      dropboxRefreshToken != null &&
      dropboxRefreshToken!.isNotEmpty;

  // OKR Data
  List<Map<String, dynamic>> cycles = [];
  List<Map<String, dynamic>> objectives = [];
  List<Map<String, dynamic>> keyResults = [];
  List<Map<String, dynamic>> reviews = [];
  List<Map<String, dynamic>> habits = [];
  String? selectedCycleId;

  // Pomodoro Data
  Map<String, dynamic> settings = PomodoroStorage.defaultSettings;
  List<Map<String, dynamic>> tasks = [];
  List<Map<String, dynamic>> history = [];
  String? activeTaskId;

  FocusMusicController? focusMusic;

  StorageProvider({
    required this.okrStorage,
    required this.pomodoroStorage,
    DropboxService? dropboxService,
    FlutterSecureStorage? secureStorage,
  })  : dropboxService = dropboxService ?? DropboxService(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage();

  @override
  void dispose() {
    _syncTimer?.cancel();
    dropboxService.close();
    super.dispose();
  }

  /// Starts (or restarts) the 15-minute periodic sync timer.
  void _scheduleSyncTimer() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(minutes: 15), (_) => syncData());
  }

  /// Stops the periodic sync timer while the app is backgrounded — a
  /// backgrounded app must not keep hitting Dropbox every 15 minutes
  /// (ticket 12).
  void pauseSync() {
    _syncTimer?.cancel();
    _syncTimer = null;
  }

  /// Restarts the periodic sync timer when the app returns to the foreground.
  void resumeSync() {
    if (isDropboxConnected) {
      _scheduleSyncTimer();
    }
  }

  // Credentials live in secure storage (Keychain/Keystore) — a refresh token
  // is a long-lived credential and must not sit in plain SharedPreferences
  // (ticket 16). lastSyncTime stays in prefs: it is not a secret. Injectable
  // for tests that simulate a failing secure write.
  final FlutterSecureStorage _secureStorage;

  Future<void> initSync() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      lastSyncTime = prefs.getString('last_sync_time');

      dropboxClientId = await _secureStorage.read(key: 'dropbox_client_id');
      dropboxRefreshToken = await _secureStorage.read(key: 'dropbox_refresh_token');
      // A prefs copy means either pre-secure-storage legacy data, or a
      // connect whose post-write cleanup failed. Handle both: write the
      // prefs values into EMPTY secure slots (migration), and always drop
      // the prefs copy — if secure already holds a value, the prefs copy is
      // stale and must not overwrite it. Prefs are cleared only after the
      // writes succeed, so a failure retries on the next load.
      final legacyClient = prefs.getString('dropbox_client_id');
      final legacyToken = prefs.getString('dropbox_refresh_token');
      if (legacyClient != null || legacyToken != null) {
        if (legacyClient != null && dropboxClientId == null) {
          await _secureStorage.write(key: 'dropbox_client_id', value: legacyClient);
          dropboxClientId = legacyClient;
        }
        if (legacyToken != null && dropboxRefreshToken == null) {
          await _secureStorage.write(key: 'dropbox_refresh_token', value: legacyToken);
          dropboxRefreshToken = legacyToken;
        }
        await prefs.remove('dropbox_client_id');
        await prefs.remove('dropbox_refresh_token');
      }

      if (isDropboxConnected) {
        _scheduleSyncTimer();
        Future.delayed(const Duration(seconds: 3), () {
          if (isDropboxConnected) {
            syncData();
          }
        });
        notifyListeners();
      }
    } catch (_) {}
  }


  Future<bool> connectDropbox(
    String clientId,
    String authResponse,
    String codeVerifier, {
    required String expectedState,
  }) async {
    // The user may paste the bare code, a code=...&state=... query, or the
    // full redirect URL. The CSRF state must come back with the code.
    final parsed = parseAuthResponse(authResponse);
    if (clientId.trim().isEmpty ||
        parsed.code.isEmpty ||
        codeVerifier.isEmpty ||
        parsed.state == null) {
      syncError =
          'Please complete the authorization step — paste the full redirect URL.';
      notifyListeners();
      return false;
    }

    isSyncing = true;
    syncError = null;
    notifyListeners();

    try {
      final refreshToken = await dropboxService.exchangeDropboxCode(
        clientId.trim(),
        parsed.code,
        codeVerifier,
        expectedState: expectedState,
        returnedState: parsed.state!,
      );

      final isValid = await dropboxService.validateDropboxToken(clientId.trim(), refreshToken);
      if (isValid) {
        await _secureStorage.write(key: 'dropbox_client_id', value: clientId.trim());
        await _secureStorage.write(key: 'dropbox_refresh_token', value: refreshToken);
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('dropbox_client_id');
        await prefs.remove('dropbox_refresh_token');
        dropboxClientId = clientId.trim();
        dropboxRefreshToken = refreshToken;

        _scheduleSyncTimer();

        isSyncing = false;
        notifyListeners();

        await syncData();
        return true;
      } else {
        syncError = 'Failed to validate the connection. Please try again.';
      }
    } catch (e) {
      syncError = 'Error validating authorization code: ${e.toString()}';
    }

    isSyncing = false;
    notifyListeners();
    return false;
  }

  Future<void> disconnectDropbox() async {
    _syncTimer?.cancel();
    _syncTimer = null;

    await _secureStorage.delete(key: 'dropbox_client_id');
    await _secureStorage.delete(key: 'dropbox_refresh_token');
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('dropbox_client_id');
    await prefs.remove('dropbox_refresh_token');

    dropboxClientId = null;
    dropboxRefreshToken = null;
    syncError = null;
    notifyListeners();
  }

  Future<bool> syncData({bool forceUpload = false}) async {
    if (!isDropboxConnected || isSyncing) return false;

    isSyncing = true;
    syncError = null;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      final compactedSinceLastSync = prefs.getString('myokr_force_sync_overwrite') == '1';

      final success = await dropboxService.syncWithDropbox(
        clientId: dropboxClientId!,
        refreshToken: dropboxRefreshToken!,
        getLocalBinary: () => okrStorage.getAutomergeBinary(),
        mergeExternalBinary: (remoteBinary) async {
          final local = await okrStorage.getAutomergeBinary();
          if (local.isEmpty) {
            await okrStorage.saveAutomergeBinary(remoteBinary);
            return remoteBinary;
          }
          final merged = mergeAutomergeBinaries(localBinary: local, remoteBinary: remoteBinary);
          await okrStorage.saveAutomergeBinary(merged);
          return merged;
        },
        forceUpload: forceUpload,
        compactedSinceLastSync: compactedSinceLastSync,
      );

      if (success) {
        if (compactedSinceLastSync) {
          await prefs.remove('myokr_force_sync_overwrite');
        }
        final nowStr = DateTime.now().toIso8601String();
        lastSyncTime = nowStr;
        await prefs.setString('last_sync_time', nowStr);

        await loadAllData();
      }

      isSyncing = false;
      notifyListeners();
      return success;
    } catch (e) {
      final errStr = e.toString();
      if (errStr.contains('401') || errStr.contains('Failed to get access token')) {
        await disconnectDropbox();
        syncError = 'Dropbox connection is invalid or expired. Please reconnect.';
      } else {
        syncError = errStr;
      }
      isSyncing = false;
      notifyListeners();
      return false;
    }
  }


  Future<void> loadAllData() async {
    isLoading = true;
    notifyListeners();

    try {
      cycles = await okrStorage.loadCycles();
      objectives = await okrStorage.loadObjectives();
      keyResults = await okrStorage.loadKeyResults();
      reviews = await okrStorage.loadReviews();
      habits = await okrStorage.loadHabits();

      settings = await pomodoroStorage.loadSettings();
      tasks = await pomodoroStorage.loadTasks();
      history = await pomodoroStorage.loadHistory();
      final timerState = await pomodoroStorage.loadTimerState();
      activeTaskId = timerState?['activeTaskId'];

      await repairReviews();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  // Active cycle logic
  Map<String, dynamic>? get activeCycle {
    if (cycles.isEmpty) return null;
    if (selectedCycleId != null) {
      final selected = cycles.where((c) => c['id'] == selectedCycleId).firstOrNull;
      if (selected != null) return selected;
    }
    final now = DateTime.now();
    try {
      return cycles.firstWhere(
        (c) => c['month'] == now.month - 1 && c['year'] == now.year,
      );
    } catch (_) {
      try {
        return cycles.firstWhere((c) => c['isActive'] == true);
      } catch (_) {
        return cycles.last;
      }
    }
  }

  void selectCycle(String cycleId) {
    selectedCycleId = cycleId;
    notifyListeners();
  }

  // Progress Calculations
  double getEffectiveCurrentValue(
    Map<String, dynamic> kr, {
    List<Map<String, dynamic>>? overrideHabits,
  }) {
    final mode = kr['completionMode'] as String? ?? 'manual';
    final krId = kr['id'] as String?;
    final rawCurrent = (kr['currentValue'] as num?)?.toDouble() ?? 0.0;

    if (mode == 'manual' || krId == null) {
      return rawCurrent;
    }

    if (mode == 'habit') {
      final habitId = kr['habitId'] as String?;
      if (habitId == null) return 0.0;

      final habitList = overrideHabits ?? habits;
      final habit = habitList.firstWhere((h) => h['id'] == habitId, orElse: () => {});
      if (habit.isEmpty) return 0.0;

      final objId = kr['objectiveId'] as String?;
      final obj = objectives.firstWhere((o) => o['id'] == objId, orElse: () => {});
      if (obj.isEmpty) return 0.0;

      final cycleId = obj['cycleId'] as String?;
      final cycle = cycles.firstWhere((c) => c['id'] == cycleId, orElse: () => {});
      if (cycle.isEmpty) return 0.0;

      final cycleMonth = cycle['month'] as int?;
      final cycleYear = cycle['year'] as int?;
      if (cycleMonth == null || cycleYear == null) return 0.0;

      final ticks = habit['ticks'];
      if (ticks is! List) return 0.0;

      int matchCount = 0;
      for (final tick in ticks) {
        if (tick is String) {
          final parts = tick.split('-');
          if (parts.length == 3) {
            final year = int.tryParse(parts[0]);
            final month = int.tryParse(parts[1]);
            if (year == cycleYear && month != null && (month - 1) == cycleMonth) {
              matchCount++;
            }
          }
        }
      }
      return matchCount.toDouble();
    }

    final linkedTasks = tasks.where((t) => t['keyResultId'] == krId).toList();

    switch (mode) {
      case 'focus_hours':
        final focusDurationMinutes = (settings['focusDuration'] as num?)?.toDouble() ?? 25.0;
        double totalMinutes = 0.0;
        for (final t in linkedTasks) {
          final p = (t['completedPomodoros'] as num?)?.toDouble() ?? 0.0;
          totalMinutes += p * focusDurationMinutes;
        }
        final hours = totalMinutes / 60.0;
        return (hours * 100).round() / 100.0;

      case 'focus_pomodoros':
        double totalPomos = 0.0;
        for (final t in linkedTasks) {
          totalPomos += (t['completedPomodoros'] as num?)?.toDouble() ?? 0.0;
        }
        return totalPomos;

      case 'completed_tasks':
        int completedCount = 0;
        for (final t in linkedTasks) {
          if (t['isCompleted'] == true) {
            completedCount++;
          }
        }
        return completedCount.toDouble();

      default:
        return rawCurrent;
    }
  }

  double getEffectiveCurrentValueAsOf(
    Map<String, dynamic> kr,
    String endDate, {
    List<Map<String, dynamic>>? overrideHabits,
  }) {
    final mode = kr['completionMode'] as String? ?? 'manual';
    final krId = kr['id'] as String?;
    final rawCurrent = (kr['currentValue'] as num?)?.toDouble() ?? 0.0;

    if (mode == 'manual' || krId == null) {
      return rawCurrent;
    }

    if (mode == 'habit') {
      final habitId = kr['habitId'] as String?;
      if (habitId == null) return 0.0;

      final habitList = overrideHabits ?? habits;
      final habit = habitList.firstWhere((h) => h['id'] == habitId, orElse: () => {});
      if (habit.isEmpty) return 0.0;

      final objId = kr['objectiveId'] as String?;
      final obj = objectives.firstWhere((o) => o['id'] == objId, orElse: () => {});
      if (obj.isEmpty) return 0.0;

      final cycleId = obj['cycleId'] as String?;
      final cycle = cycles.firstWhere((c) => c['id'] == cycleId, orElse: () => {});
      if (cycle.isEmpty) return 0.0;

      final cycleMonth = cycle['month'] as int?;
      final cycleYear = cycle['year'] as int?;
      if (cycleMonth == null || cycleYear == null) return 0.0;

      final ticks = habit['ticks'];
      if (ticks is! List) return 0.0;

      int matchCount = 0;
      for (final tick in ticks) {
        if (tick is String && tick.compareTo(endDate) <= 0) {
          final parts = tick.split('-');
          if (parts.length == 3) {
            final year = int.tryParse(parts[0]);
            final month = int.tryParse(parts[1]);
            if (year == cycleYear && month != null && (month - 1) == cycleMonth) {
              matchCount++;
            }
          }
        }
      }
      return matchCount.toDouble();
    }

    final linkedTasks = tasks.where((t) => t['keyResultId'] == krId).toList();
    final linkedIds = linkedTasks.map((t) => t['id'] as String).toSet();

    switch (mode) {
      case 'focus_hours':
        final focusDurationMinutes = (settings['focusDuration'] as num?)?.toDouble() ?? 25.0;
        int count = 0;
        for (final day in history) {
          final date = day['date'] as String?;
          if (date != null && date.compareTo(endDate) <= 0) {
            final sessions = day['sessions'];
            if (sessions is List) {
              for (final s in sessions) {
                if (s is Map &&
                    s['type'] == 'focus' &&
                    s['completed'] == true &&
                    s['taskId'] != null &&
                    linkedIds.contains(s['taskId'])) {
                  count++;
                }
              }
            }
          }
        }
        final totalMinutes = count * focusDurationMinutes;
        final hours = totalMinutes / 60.0;
        return (hours * 100).round() / 100.0;

      case 'focus_pomodoros':
        int count = 0;
        for (final day in history) {
          final date = day['date'] as String?;
          if (date != null && date.compareTo(endDate) <= 0) {
            final sessions = day['sessions'];
            if (sessions is List) {
              for (final s in sessions) {
                if (s is Map &&
                    s['type'] == 'focus' &&
                    s['completed'] == true &&
                    s['taskId'] != null &&
                    linkedIds.contains(s['taskId'])) {
                  count++;
                }
              }
            }
          }
        }
        return count.toDouble();

      case 'completed_tasks':
        int count = 0;
        for (final t in linkedTasks) {
          if (t['isCompleted'] == true) {
            final completedAt = t['completedAt'] as String?;
            if (completedAt != null && completedAt.substring(0, min(10, completedAt.length)).compareTo(endDate) <= 0) {
              count++;
            }
          }
        }
        return count.toDouble();

      default:
        return rawCurrent;
    }
  }

  Future<void> repairReviews() async {
    bool changed = false;

    final repaired = reviews.map((r) {
      if (r['completedAt'] == null) return r;
      final weekStart = r['weekStartDate'] as String?;
      final weekEnd = r['weekEndDate'] as String?;
      final entries = r['entries'];
      if (weekStart == null || weekEnd == null || entries is! List) return r;

      final parts = weekStart.split('-').map(int.tryParse).toList();
      if (parts.length != 3 || parts.any((p) => p == null)) return r;
      final dt = DateTime.utc(parts[0]!, parts[1]!, parts[2]!);
      final prevSun = dt.subtract(Duration(days: dt.weekday == DateTime.monday ? 1 : dt.weekday));
      final prevSunStr =
          "${prevSun.year.toString().padLeft(4, '0')}-${prevSun.month.toString().padLeft(2, '0')}-${prevSun.day.toString().padLeft(2, '0')}";

      bool entriesChanged = false;
      final updatedEntries = (entries.whereType<Map>()).map((entryMap) {
        final entry = Map<String, dynamic>.from(entryMap);
        final krId = entry['keyResultId'] as String?;
        final kr = keyResults.firstWhere((k) => k['id'] == krId, orElse: () => {});
        final mode = kr['completionMode'] as String? ?? 'manual';
        if (kr.isEmpty || mode == 'manual') return entry;

        final correctPrev = getEffectiveCurrentValueAsOf(kr, prevSunStr);
        final correctCurr = getEffectiveCurrentValueAsOf(kr, weekEnd);

        final prevVal = (entry['previousValue'] as num?)?.toDouble() ?? 0.0;
        final currVal = (entry['currentValue'] as num?)?.toDouble() ?? 0.0;

        if (prevVal != correctPrev || currVal != correctCurr) {
          entriesChanged = true;
          entry['previousValue'] = correctPrev;
          entry['currentValue'] = correctCurr;
        }
        return entry;
      }).toList();

      if (entriesChanged) {
        changed = true;
        final updatedReview = Map<String, dynamic>.from(r);
        updatedReview['entries'] = updatedEntries;
        return updatedReview;
      }
      return r;
    }).toList();

    if (changed) {
      reviews = repaired;
      await okrStorage.saveReviews(repaired);
    }
    await syncKeyResultsFromReviews(repaired);
  }

  Future<void> syncKeyResultsFromReviews([List<Map<String, dynamic>>? overrideReviews]) async {
    final currentReviews = overrideReviews ?? reviews;
    bool changed = false;

    final updatedKRs = keyResults.map((kr) {
      final krId = kr['id'] as String?;
      if (krId == null) return kr;

      final krReviews = currentReviews.where((r) {
        if (r['completedAt'] == null) return false;
        final entries = r['entries'];
        return entries is List && entries.any((e) => e is Map && e['keyResultId'] == krId);
      }).toList();

      krReviews.sort((a, b) {
        final dateA = a['weekStartDate'] as String? ?? '';
        final dateB = b['weekStartDate'] as String? ?? '';
        return dateB.compareTo(dateA);
      });

      if (krReviews.isNotEmpty) {
        final latestReview = krReviews.first;
        final entries = (latestReview['entries'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        final entry = entries.firstWhere((e) => e['keyResultId'] == krId, orElse: () => {});
        if (entry.isNotEmpty) {
          final newCurr = (entry['currentValue'] as num?)?.toDouble() ?? 0.0;
          final newConf = entry['confidence'] as String? ?? 'not_set';
          final currVal = (kr['currentValue'] as num?)?.toDouble() ?? 0.0;
          final currConf = kr['confidence'] as String? ?? 'not_set';

          if (currVal != newCurr || currConf != newConf) {
            changed = true;
            final updated = Map<String, dynamic>.from(kr);
            updated['currentValue'] = newCurr;
            updated['confidence'] = newConf;
            updated['updatedAt'] = DateTime.now().toIso8601String();
            return updated;
          }
        }
      }
      return kr;
    }).toList();

    if (changed) {
      keyResults = updatedKRs;
      await okrStorage.saveKeyResults(updatedKRs);
      notifyListeners();
    }
  }

  Future<void> saveReview(Map<String, dynamic> review) async {
    final rId = review['id'] as String?;
    final weekStart = review['weekStartDate'] as String?;
    final item = Map<String, dynamic>.from(review);

    if (rId == null || rId.isEmpty) {
      item['id'] = DateTime.now().millisecondsSinceEpoch.toString();
    }

    final existingIdx = reviews.indexWhere(
      (r) => r['id'] == item['id'] || (weekStart != null && r['weekStartDate'] == weekStart),
    );
    List<Map<String, dynamic>> updated;
    if (existingIdx >= 0) {
      updated = [...reviews];
      updated[existingIdx] = item;
    } else {
      updated = [...reviews, item];
    }

    reviews = updated;
    await okrStorage.saveReviews(updated);
    await syncKeyResultsFromReviews(updated);
    notifyListeners();
  }

  Future<void> deleteReview(String reviewId) async {
    final updated = reviews.where((r) => r['id'] != reviewId).toList();
    reviews = updated;
    await okrStorage.saveReviews(updated);
    await syncKeyResultsFromReviews(updated);
    notifyListeners();
  }

  // --- Habit CRUD & OKR Linkage Fallback ---
  Future<void> saveHabits(List<Map<String, dynamic>> newHabits) async {
    habits = newHabits;
    await okrStorage.saveHabits(newHabits);
    notifyListeners();
  }

  Future<void> saveHabit(Map<String, dynamic> habit) async {
    final item = Map<String, dynamic>.from(habit);
    if (item['id'] == null || (item['id'] as String).isEmpty) {
      item['id'] = 'habit_${DateTime.now().millisecondsSinceEpoch}';
    }
    final existingIdx = habits.indexWhere((h) => h['id'] == item['id']);
    List<Map<String, dynamic>> updated;
    if (existingIdx >= 0) {
      updated = [...habits];
      updated[existingIdx] = item;
    } else {
      updated = [...habits, item];
    }
    await saveHabits(updated);
  }

  Future<void> updateHabitStatus(String habitId, String status) async {
    final updated = habits.map((h) {
      if (h['id'] == habitId) {
        final item = Map<String, dynamic>.from(h);
        item['status'] = status;
        item['updatedAt'] = DateTime.now().toIso8601String();
        return item;
      }
      return h;
    }).toList();
    await saveHabits(updated);
  }

  Future<void> toggleHabitTick(String habitId, String dateStr) async {
    final updated = habits.map((h) {
      if (h['id'] == habitId) {
        final item = Map<String, dynamic>.from(h);
        final rawTicks = item['ticks'] is List ? List<String>.from(item['ticks']) : <String>[];
        if (rawTicks.contains(dateStr)) {
          rawTicks.remove(dateStr);
        } else {
          rawTicks.add(dateStr);
        }
        rawTicks.sort();
        item['ticks'] = rawTicks;
        item['updatedAt'] = DateTime.now().toIso8601String();
        return item;
      }
      return h;
    }).toList();
    await saveHabits(updated);
  }

  Future<void> deleteHabit(String habitId) async {
    final linkedKRs = keyResults.where((kr) => kr['habitId'] == habitId).toList();

    if (linkedKRs.isNotEmpty) {
      final updatedKRs = keyResults.map((kr) {
        if (kr['habitId'] == habitId) {
          final effectiveVal = getEffectiveCurrentValue(kr);
          final item = Map<String, dynamic>.from(kr);
          item['completionMode'] = 'manual';
          item['currentValue'] = effectiveVal;
          item.remove('habitId');
          item['updatedAt'] = DateTime.now().toIso8601String();
          return item;
        }
        return kr;
      }).toList();

      await saveKeyResults(updatedKRs);
    }

    final updatedHabits = habits.where((h) => h['id'] != habitId).toList();
    await saveHabits(updatedHabits);
  }




  int computeObjectiveProgress(String objId) {
    final krs = keyResults.where((kr) => kr['objectiveId'] == objId).toList();
    if (krs.isEmpty) return 0;

    double totalPct = 0;
    for (final kr in krs) {
      final target = (kr['targetValue'] as num?)?.toDouble() ?? 0;
      final current = getEffectiveCurrentValue(kr);
      final pct = target > 0 ? (current / target) * 100 : 0.0;
      totalPct += min(100.0, pct);
    }

    return (totalPct / krs.length).round();
  }

  int computeOverallProgress(String cycleId) {
    final cycleObjs = objectives.where((o) => o['cycleId'] == cycleId).toList();
    if (cycleObjs.isEmpty) return 0;

    double totalPct = 0;
    for (final obj in cycleObjs) {
      totalPct += computeObjectiveProgress(obj['id']);
    }

    return (totalPct / cycleObjs.length).round();
  }

  // Key Result CRUD
  Future<void> saveKeyResult(Map<String, dynamic> kr) async {
    final krId = kr['id'] as String?;
    final nowIso = DateTime.now().toIso8601String();
    final item = Map<String, dynamic>.from(kr);

    if (krId == null || krId.isEmpty) {
      item['id'] = DateTime.now().millisecondsSinceEpoch.toString();
      item['createdAt'] = nowIso;
    }
    item['updatedAt'] = nowIso;

    final existingIdx = keyResults.indexWhere((k) => k['id'] == item['id']);
    List<Map<String, dynamic>> updated;
    if (existingIdx >= 0) {
      updated = [...keyResults];
      updated[existingIdx] = item;
    } else {
      updated = [...keyResults, item];
    }

    keyResults = updated;
    await okrStorage.saveKeyResults(updated);
    notifyListeners();
  }

  Future<void> deleteKeyResult(String krId) async {
    final updatedKrs = keyResults.where((kr) => kr['id'] != krId).toList();
    keyResults = updatedKrs;
    await okrStorage.saveKeyResults(updatedKrs);
    notifyListeners();
  }

  Future<void> updateKRConfidence(String krId, String confidence) async {
    final idx = keyResults.indexWhere((kr) => kr['id'] == krId);
    if (idx < 0) return;

    const validConfidences = {'on_track', 'at_risk', 'off_track', 'not_set'};
    final safeConfidence = validConfidences.contains(confidence) ? confidence : 'not_set';

    final updated = Map<String, dynamic>.from(keyResults[idx]);
    updated['confidence'] = safeConfidence;
    await saveKeyResult(updated);
  }


  // Cycle Management Actions
  Future<void> createNextCycle() async {
    final lastCycle = cycles.isNotEmpty
        ? cycles.reduce((latest, c) {
            final latestVal = (latest['year'] as int) * 12 + (latest['month'] as int);
            final cVal = (c['year'] as int) * 12 + (c['month'] as int);
            return cVal > latestVal ? c : latest;
          })
        : null;

    int nextMonth;
    int nextYear;

    if (lastCycle != null) {
      final m = lastCycle['month'] as int;
      final y = lastCycle['year'] as int;
      nextMonth = m == 11 ? 0 : m + 1;
      nextYear = m == 11 ? y + 1 : y;
    } else {
      final now = DateTime.now();
      nextMonth = now.month - 1;
      nextYear = now.year;
    }

    final newCycle = <String, dynamic>{
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'name': getMonthName(nextMonth, nextYear),
      'month': nextMonth,
      'year': nextYear,
      'isActive': false,
      'createdAt': DateTime.now().toIso8601String(),
    };

    final updated = [...cycles, newCycle];
    cycles = updated;
    await okrStorage.saveCycles(updated);
    selectedCycleId = newCycle['id'];
    notifyListeners();
  }

  Future<void> cloneActiveCycle() async {
    final source = activeCycle;
    if (source == null) return;

    final latest = cycles.reduce((acc, c) {
      final accVal = (acc['year'] as int) * 12 + (acc['month'] as int);
      final cVal = (c['year'] as int) * 12 + (c['month'] as int);
      return cVal > accVal ? c : acc;
    });

    final m = latest['month'] as int;
    final y = latest['year'] as int;
    final nextMonth = m == 11 ? 0 : m + 1;
    final nextYear = m == 11 ? y + 1 : y;

    final nowIso = DateTime.now().toIso8601String();
    final newCycle = <String, dynamic>{
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'name': getMonthName(nextMonth, nextYear),
      'month': nextMonth,
      'year': nextYear,
      'isActive': false,
      'createdAt': nowIso,
    };

    final sourceObjs = objectives.where((o) => o['cycleId'] == source['id']).toList();
    final objIdMap = <String, String>{};
    final newObjs = <Map<String, dynamic>>[];

    for (int i = 0; i < sourceObjs.length; i++) {
      final oldId = sourceObjs[i]['id'] as String;
      final newId = '${DateTime.now().millisecondsSinceEpoch}_obj_$i';
      objIdMap[oldId] = newId;

      final clonedObj = Map<String, dynamic>.from(sourceObjs[i]);
      clonedObj['id'] = newId;
      clonedObj['cycleId'] = newCycle['id'];
      clonedObj['createdAt'] = nowIso;
      newObjs.add(clonedObj);
    }

    final newKrs = <Map<String, dynamic>>[];
    for (final kr in keyResults) {
      final oldObjId = kr['objectiveId'] as String?;
      if (oldObjId != null && objIdMap.containsKey(oldObjId)) {
        final clonedKr = Map<String, dynamic>.from(kr);
        clonedKr['id'] = '${DateTime.now().millisecondsSinceEpoch}_kr_${newKrs.length}';
        clonedKr['objectiveId'] = objIdMap[oldObjId];
        clonedKr['currentValue'] = 0;
        clonedKr['confidence'] = 'not_set';
        clonedKr['createdAt'] = nowIso;
        clonedKr['updatedAt'] = nowIso;
        newKrs.add(clonedKr);
      }
    }

    final updatedCycles = [...cycles, newCycle];
    final updatedObjs = [...objectives, ...newObjs];
    final updatedKrs = [...keyResults, ...newKrs];

    cycles = updatedCycles;
    objectives = updatedObjs;
    keyResults = updatedKrs;

    await okrStorage.saveCycles(updatedCycles);
    await okrStorage.saveObjectives(updatedObjs);
    await okrStorage.saveKeyResults(updatedKrs);

    selectedCycleId = newCycle['id'];
    notifyListeners();
  }

  Set<String> get deletableCycleIds {
    final now = DateTime.now();
    final currentMonthIndex = now.year * 12 + (now.month - 1);

    final futureEmptyCycles = cycles.where((c) {
      final idx = (c['year'] as int) * 12 + (c['month'] as int);
      final isFuture = idx > currentMonthIndex;
      final hasObjectives = objectives.any((o) => o['cycleId'] == c['id']);
      return isFuture && !hasObjectives;
    });

    return futureEmptyCycles.map((c) => c['id'] as String).toSet();
  }

  Future<void> deleteCycle(String cycleId) async {
    final updated = cycles.where((c) => c['id'] != cycleId).toList();
    cycles = updated;
    await okrStorage.saveCycles(updated);

    if (selectedCycleId == cycleId) {
      selectedCycleId = null;
    }
    notifyListeners();
  }

  // Objective CRUD
  Future<void> saveObjective(Map<String, dynamic> obj) async {
    final objId = obj['id'] as String?;
    final nowIso = DateTime.now().toIso8601String();
    final item = Map<String, dynamic>.from(obj);

    if (objId == null || objId.isEmpty) {
      item['id'] = DateTime.now().millisecondsSinceEpoch.toString();
      item['createdAt'] = nowIso;
    }

    final existingIdx = objectives.indexWhere((o) => o['id'] == item['id']);
    List<Map<String, dynamic>> updated;
    if (existingIdx >= 0) {
      updated = [...objectives];
      updated[existingIdx] = item;
    } else {
      updated = [...objectives, item];
    }

    objectives = updated;
    await okrStorage.saveObjectives(updated);
    notifyListeners();
  }

  Future<void> deleteObjective(String objId) async {
    final updatedObjs = objectives.where((o) => o['id'] != objId).toList();
    final updatedKrs = keyResults.where((kr) => kr['objectiveId'] != objId).toList();

    objectives = updatedObjs;
    keyResults = updatedKrs;

    await okrStorage.saveObjectives(updatedObjs);
    await okrStorage.saveKeyResults(updatedKrs);
    notifyListeners();
  }

  // Today Focus
  List<Map<String, dynamic>> get todayFocusTasks {
    return pickForBudget(tasks, keyResults, activeCycle, settings);
  }

  // Mutations (Save to disk and update state)
  Future<void> saveSettings(Map<String, dynamic> newSettings) async {
    settings = newSettings;
    await pomodoroStorage.saveSettings(newSettings);
    notifyListeners();
  }

  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    tasks = newTasks;
    await pomodoroStorage.saveTasks(newTasks);
    notifyListeners();
  }

  Future<void> saveObjectives(List<Map<String, dynamic>> newObjs) async {
    objectives = newObjs;
    await okrStorage.saveObjectives(newObjs);
    notifyListeners();
  }

  Future<void> saveKeyResults(List<Map<String, dynamic>> newKrs) async {
    keyResults = newKrs;
    await okrStorage.saveKeyResults(newKrs);
    notifyListeners();
  }

  Future<void> setActiveTaskId(String? id) async {
    activeTaskId = id;
    notifyListeners();
    final timerState = await pomodoroStorage.loadTimerState() ?? <String, dynamic>{};
    timerState['activeTaskId'] = id;
    timerState['lastUpdated'] = DateTime.now().toIso8601String();
    await pomodoroStorage.saveTimerState(timerState);
  }
}
