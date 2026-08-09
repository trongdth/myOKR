/// This is copied from Cargokit (which is the official way to use it currently)
/// Details: https://fzyzcjy.github.io/flutter_rust_bridge/manual/integrate/builtin

import 'dart:io';

import 'package:collection/collection.dart';
import 'package:path/path.dart' as path;

import 'util.dart';

class _Toolchain {
  _Toolchain(
    this.name,
    this.targets,
  );

  final String name;
  final List<String> targets;
}

/// Whether a `rustup toolchain list` line names a STANDARD toolchain
/// (stable/beta/nightly, optionally with a host-triple suffix) rather than a
/// custom one. Anchored to the full toolchain token: a custom toolchain
/// named like 'stable-custom' (single dash-segment) is NOT standard (ticket
/// 18). Residual: a custom name with >= 2 dash-segments (e.g.
/// 'nightly-custom-name') still matches — rustup itself refuses to *link*
/// names that parse as official (its date/host grammar is stricter), so the
/// exposure is a user deliberately naming a toolchain that way; accepted as
/// out of the ticket's scope.
bool isStandardToolchainLine(String line) {
  return RegExp(r'^(stable|beta|nightly)(?:-[a-z0-9_]+(?:-[a-z0-9_]+)+)?(\s|$)')
      .hasMatch(line.trim());
}

/// Whether [target] still needs installing for the given [installed] list
/// (null = unknown → install). Makes installTarget idempotent (ticket 18).
bool needsTargetInstall(List<String>? installed, String target) =>
    !(installed?.contains(target) ?? false);

class Rustup {
  List<String>? installedTargets(String toolchain) {
    final targets = _installedTargets(toolchain);
    return targets != null ? List.unmodifiable(targets) : null;
  }

  void installToolchain(String toolchain) {
    log.info("Installing Rust toolchain: $toolchain");
    runCommand("rustup", ['toolchain', 'install', toolchain]);
    _installedToolchains
        .add(_Toolchain(toolchain, _getInstalledTargets(toolchain)));
  }

  void installTarget(
    String target, {
    required String toolchain,
  }) {
    final installed = _installedTargets(toolchain);
    if (!needsTargetInstall(installed, target)) {
      return; // idempotent — no duplicate installs (ticket 18)
    }
    log.info("Installing Rust target: $target");
    runCommand("rustup", ['target', 'add', '--toolchain', toolchain, target]);
    installed?.add(target);
  }

  bool _didInstallZigBuild = false;

  void installZigBuild(String toolchain) {
    if (_didInstallZigBuild) {
      return;
    }

    log.info("Installing Zig build");
    runCommand("rustup", [
      'run',
      toolchain,
      'cargo',
      'install',
      '--locked',
      'cargo-zigbuild',
    ]);
    _didInstallZigBuild = true;
  }

  final List<_Toolchain> _installedToolchains;

  Rustup() : _installedToolchains = _getInstalledToolchains();

  List<String>? _installedTargets(String toolchain) => _installedToolchains
      .firstWhereOrNull(
          (e) => e.name == toolchain || e.name.startsWith('$toolchain-'))
      ?.targets;

  static List<_Toolchain> _getInstalledToolchains() {
    String extractToolchainName(String line) {
      // ignore (default) after toolchain name
      final parts = line.split(' ');
      return parts[0];
    }

    final res = runCommand("rustup", ['toolchain', 'list']);

    // To list all non-custom toolchains, filter lines naming a standard
    // toolchain (anchored to the full token — see isStandardToolchainLine).
    final lines = res.stdout
        .toString()
        .split('\n')
        .where((e) => e.isNotEmpty && isStandardToolchainLine(e))
        .map(extractToolchainName)
        .toList(growable: true);

    return lines
        .map(
          (name) => _Toolchain(
            name,
            _getInstalledTargets(name),
          ),
        )
        .toList(growable: true);
  }

  static List<String> _getInstalledTargets(String toolchain) {
    final res = runCommand("rustup", [
      'target',
      'list',
      '--toolchain',
      toolchain,
      '--installed',
    ]);
    final lines = res.stdout
        .toString()
        .split('\n')
        .where((e) => e.isNotEmpty)
        .toList(growable: true);
    return lines;
  }

  bool _didInstallRustSrcForNightly = false;

  void installRustSrcForNightly() {
    if (_didInstallRustSrcForNightly) {
      return;
    }
    // Useful for -Z build-std
    runCommand(
      "rustup",
      ['component', 'add', 'rust-src', '--toolchain', 'nightly'],
    );
    _didInstallRustSrcForNightly = true;
  }

  static String? executablePath() {
    final envPath = Platform.environment['PATH'];
    final envPathSeparator = Platform.isWindows ? ';' : ':';
    final home = Platform.isWindows
        ? Platform.environment['USERPROFILE']
        : Platform.environment['HOME'];
    final paths = [
      if (home != null) path.join(home, '.cargo', 'bin'),
      if (envPath != null) ...envPath.split(envPathSeparator),
    ];
    for (final p in paths) {
      final rustup = Platform.isWindows ? 'rustup.exe' : 'rustup';
      final rustupPath = path.join(p, rustup);
      if (File(rustupPath).existsSync()) {
        return rustupPath;
      }
    }
    return null;
  }
}
