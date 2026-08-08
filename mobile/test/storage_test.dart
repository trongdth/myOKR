import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('SharedPreferences save and load', () async {
    SharedPreferences.setMockInitialValues({'my_key': 'initial_value'});
    
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('my_key'), 'initial_value');
    
    await prefs.setString('my_key', 'new_value');
    expect(prefs.getString('my_key'), 'new_value');
  });

  test('Local file save and load (Mocking path)', () async {
    // Instead of using path_provider directly which requires platform channels,
    // we simulate local storage using dart:io Directory.systemTemp
    final directory = Directory.systemTemp.createTempSync('myokr_test');
    final file = File('${directory.path}/test_file.txt');
    
    await file.writeAsString('hello world');
    final content = await file.readAsString();
    
    expect(content, 'hello world');
    
    // Cleanup
    directory.deleteSync(recursive: true);
  });
}
