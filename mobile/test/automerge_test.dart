import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/rust/frb_generated.dart';
import 'package:myokr_mobile/src/rust/api/simple.dart';

import 'dart:io';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';

void main() {
  setUpAll(() async {
    await RustLib.init(
      externalLibrary: Platform.isMacOS 
        ? ExternalLibrary.open('rust/target/debug/librust_lib_myokr_mobile.dylib')
        : null,
    );
  });

  test('Automerge document test', () async {
    final result = testAutomergeDoc(key: 'my_key', value: 'my_value');
    expect(result, 'my_value');
  });
}
