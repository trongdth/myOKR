import 'package:build_tool/src/rustup.dart';
import 'package:test/test.dart';

void main() {
  group('isStandardToolchainLine', () {
    test('classifies bare stable/beta/nightly as standard', () {
      expect(isStandardToolchainLine('stable'), isTrue);
      expect(isStandardToolchainLine('beta'), isTrue);
      expect(isStandardToolchainLine('nightly (active)'), isTrue);
    });

    test('classifies host-suffixed standard toolchains', () {
      expect(isStandardToolchainLine('stable-x86_64-apple-darwin'), isTrue);
      expect(
          isStandardToolchainLine('nightly-aarch64-apple-darwin (active)'),
          isTrue);
    });

    test('does NOT classify a custom toolchain named stable-custom', () {
      // The old prefix filter ^(stable|beta|nightly) matched this; the
      // anchored filter must not (ticket 18).
      expect(isStandardToolchainLine('stable-custom'), isFalse);
      expect(isStandardToolchainLine('my-toolchain'), isFalse);
    });
  });

  group('needsTargetInstall', () {
    test('returns false when the target is already installed', () {
      expect(
        needsTargetInstall(['aarch64-apple-ios'], 'aarch64-apple-ios'),
        isFalse,
      );
    });

    test('returns true when absent or the list is unknown', () {
      expect(needsTargetInstall([], 'aarch64-apple-ios'), isTrue);
      expect(needsTargetInstall(null, 'aarch64-apple-ios'), isTrue);
    });
  });
}
