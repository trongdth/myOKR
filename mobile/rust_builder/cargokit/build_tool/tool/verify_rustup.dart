// Fallback verification for environments where `dart test` cannot load
// tests (this machine's bundled dart-sdk ships only the AOT
// frontend_server, while package:test < 1.26 looks for the JIT snapshot).
// Runs the same assertions as test/rustup_test.dart plus a behavioral
// installTarget check through util.dart's testRunCommandOverride seam.
// Keep in sync with test/rustup_test.dart.
import 'package:build_tool/src/rustup.dart';
import 'package:build_tool/src/util.dart';

void main() {
  // --- isStandardToolchainLine (mirrors test/rustup_test.dart) ---
  assert(isStandardToolchainLine('stable') == true, 'bare stable');
  assert(isStandardToolchainLine('beta') == true, 'bare beta');
  assert(isStandardToolchainLine('nightly (active)') == true, 'nightly active');
  assert(isStandardToolchainLine('stable-x86_64-apple-darwin') == true,
      'host suffix');
  assert(
      isStandardToolchainLine('nightly-aarch64-apple-darwin (active)') == true,
      'host suffix active');
  assert(isStandardToolchainLine('stable-custom') == false,
      'custom single-dash');
  assert(isStandardToolchainLine('my-toolchain') == false, 'custom name');

  // --- needsTargetInstall ---
  assert(needsTargetInstall(['aarch64-apple-ios'], 'aarch64-apple-ios') == false,
      'installed');
  assert(needsTargetInstall([], 'aarch64-apple-ios') == true, 'absent');
  assert(needsTargetInstall(null, 'aarch64-apple-ios') == true, 'unknown');

  // --- behavioral: installTarget is idempotent (no duplicate rustup calls) ---
  final targetAddCalls = <List<String>>[];
  testRunCommandOverride = (args) {
    if (args.arguments.first == 'toolchain' && args.arguments[1] == 'list') {
      return TestRunCommandResult(stdout: 'stable\n');
    }
    if (args.arguments.first == 'target' && args.arguments[1] == 'list') {
      return TestRunCommandResult(stdout: '');
    }
    if (args.arguments.first == 'target' && args.arguments[1] == 'add') {
      targetAddCalls.add(args.arguments);
      return TestRunCommandResult(stdout: '');
    }
    throw StateError('unexpected command: ${args.arguments}');
  };

  final rustup = Rustup();
  rustup.installTarget('aarch64-apple-ios', toolchain: 'stable');
  rustup.installTarget('aarch64-apple-ios', toolchain: 'stable');
  assert(targetAddCalls.length == 1,
      'second installTarget call must be skipped');

  testRunCommandOverride = null;
  print('ALL CHECKS PASSED');
}
