import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:myokr_mobile/src/okr_normalizer.dart';
import 'package:myokr_mobile/src/rust/api/simple.dart';
import 'package:path_provider/path_provider.dart';

class OkrStorage {
  final String _filePath = 'myokr-data.automerge';
  final Directory? testDirectory;

  // The documents directory never changes for the app's lifetime; resolve it
  // once instead of hitting the platform channel on every load/save (ticket 17).
  // The FUTURE is cached, not the value: concurrent first accesses (e.g. a
  // save racing sync's merge read) share one platform call.
  Future<Directory>? _cachedDirectory;

  OkrStorage({this.testDirectory});

  Future<File> get _localFile async {
    final directory =
        testDirectory ?? await (_cachedDirectory ??= getApplicationDocumentsDirectory());
    return File('${directory.path}/$_filePath');
  }

  Future<Uint8List> getAutomergeBinary() async {
    final file = await _localFile;
    if (await file.exists()) {
      return await file.readAsBytes();
    }
    return Uint8List(0);
  }

  Future<void> saveAutomergeBinary(Uint8List binary) async {
    final file = await _localFile;
    await file.writeAsBytes(binary);
  }

  Future<void> saveProperty(String key, dynamic value) async {
    final binary = await getAutomergeBinary();
    final jsonStr = jsonEncode(value);
    final updatedBinary = automergeUpdateProperty(binary: binary, key: key, jsonStr: jsonStr);
    await saveAutomergeBinary(updatedBinary);
  }

  Future<dynamic> getProperty(String key) async {
    final binary = await getAutomergeBinary();
    if (binary.isEmpty) return null;
    final jsonStr = automergeGetProperty(binary: binary, key: key);
    if (jsonStr == 'null') return null;
    return jsonDecode(jsonStr);
  }

  // --- Cycles ---
  Future<List<Map<String, dynamic>>> loadCycles() async {
    final data = await getProperty('cycles');
    return normalizeCycles(data);
  }

  Future<void> saveCycles(List<Map<String, dynamic>> cycles) async {
    final normalized = normalizeCycles(cycles);
    await saveProperty('cycles', normalized);
  }

  // --- Objectives ---
  Future<List<Map<String, dynamic>>> loadObjectives() async {
    final data = await getProperty('objectives');
    return normalizeObjectives(data);
  }

  Future<void> saveObjectives(List<Map<String, dynamic>> objectives) async {
    final normalized = normalizeObjectives(objectives);
    await saveProperty('objectives', normalized);
  }

  // --- Key Results ---
  Future<List<Map<String, dynamic>>> loadKeyResults() async {
    final data = await getProperty('keyResults');
    return normalizeKeyResults(data);
  }

  Future<void> saveKeyResults(List<Map<String, dynamic>> keyResults) async {
    final normalized = normalizeKeyResults(keyResults);
    await saveProperty('keyResults', normalized);
  }

  // --- Reviews ---
  Future<List<Map<String, dynamic>>> loadReviews() async {
    final data = await getProperty('reviews');
    return normalizeReviews(data);
  }

  Future<void> saveReviews(List<Map<String, dynamic>> reviews) async {
    final normalized = normalizeReviews(reviews);
    await saveProperty('reviews', normalized);
  }

  // --- Habits ---
  Future<List<Map<String, dynamic>>> loadHabits() async {
    final data = await getProperty('habits');
    return normalizeHabits(data);
  }

  Future<void> saveHabits(List<Map<String, dynamic>> habits) async {
    final normalized = normalizeHabits(habits);
    await saveProperty('habits', normalized);
  }

}

