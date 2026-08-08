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
}
