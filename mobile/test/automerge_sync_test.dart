import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:myokr_mobile/src/rust/frb_generated.dart';
import 'package:myokr_mobile/src/rust/api/simple.dart';

void main() {
  setUpAll(() async {
    await RustLib.init(
      externalLibrary: Platform.isMacOS 
        ? ExternalLibrary.open('rust/target/debug/librust_lib_myokr_mobile.dylib')
        : null,
    );
  });

  test('Merge Automerge binaries', () async {
    // Simulate remote device setting key A
    final remoteBinary = createAutomergeDocWithData(key: 'A', value: 'RemoteValue');
    
    // Simulate local device setting key B
    final localBinary = createAutomergeDocWithData(key: 'B', value: 'LocalValue');
    
    // Merge them
    final mergedBinary = mergeAutomergeBinaries(localBinary: localBinary, remoteBinary: remoteBinary);
    
    expect(mergedBinary, isNotEmpty);
    
    // Check that both keys exist in the merged binary
    final valA = jsonDecode(automergeGetProperty(binary: mergedBinary, key: 'A'));
    final valB = jsonDecode(automergeGetProperty(binary: mergedBinary, key: 'B'));
    
    expect(valA, 'RemoteValue');
    expect(valB, 'LocalValue');

  });

  test('merge resolves a same-key conflict to a single scalar', () {
    final a = createAutomergeDocWithData(key: 'k', value: 'A');
    final b = createAutomergeDocWithData(key: 'k', value: 'B');

    final merged = mergeAutomergeBinaries(localBinary: a, remoteBinary: b);

    // Concurrent same-key writes conflict; Automerge resolves them
    // deterministically — the merged doc must hold ONE of the two, not both.
    final val = jsonDecode(automergeGetProperty(binary: merged, key: 'k'));
    expect(val == 'A' || val == 'B', isTrue, reason: 'got: $val');
  });

  test('merge survives a corrupt binary on either side (no panic)', () {
    final corrupt = Uint8List.fromList([0xDE, 0xAD, 0xBE, 0xEF]);
    final valid = createAutomergeDocWithData(key: 'k', value: 'v');

    final merged =
        mergeAutomergeBinaries(localBinary: corrupt, remoteBinary: valid);
    expect(jsonDecode(automergeGetProperty(binary: merged, key: 'k')), 'v');
  });

  test('update survives a corrupt binary (write lands on a fresh doc)', () {
    final corrupt = Uint8List.fromList([0xDE, 0xAD, 0xBE, 0xEF]);

    final result = automergeUpdateProperty(binary: corrupt, key: 'k', jsonStr: '"v"');
    expect(jsonDecode(automergeGetProperty(binary: result, key: 'k')), 'v');
  });

  test('update with invalid JSON returns the input unchanged (no wipe)', () {
    final input = createAutomergeDocWithData(key: 'k', value: 'v');

    final result = automergeUpdateProperty(binary: input, key: 'k', jsonStr: 'not json {');
    expect(result, input);
  });
}
