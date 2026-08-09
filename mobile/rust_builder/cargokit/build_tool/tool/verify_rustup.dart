import 'package:build_tool/src/rustup.dart';

void main() {
  // isStandardToolchainLine
  assert(isStandardToolchainLine('stable') == true, 'bare stable');
  assert(isStandardToolchainLine('nightly (active)') == true, 'nightly active');
  assert(isStandardToolchainLine('stable-x86_64-apple-darwin') == true, 'host suffix');
  assert(isStandardToolchainLine('stable-custom') == false, 'custom single-dash');
  assert(isStandardToolchainLine('my-toolchain') == false, 'custom name');
  // needsTargetInstall
  assert(needsTargetInstall(['aarch64-apple-ios'], 'aarch64-apple-ios') == false, 'installed');
  assert(needsTargetInstall([], 'aarch64-apple-ios') == true, 'absent');
  assert(needsTargetInstall(null, 'aarch64-apple-ios') == true, 'unknown');
  print('ALL CHECKS PASSED');
}
