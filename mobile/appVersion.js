/**
 * Single source of truth for Hollow mobile releases.
 * Bump BOTH fields when shipping a new APK (ask: "bump version" / "build apk").
 *
 * - version     → user-facing (SemVer). APK file: `Hollow Ver-{version}.apk`
 * - versionCode → Android integer; must increase every release (Play / sideload).
 */
module.exports = {
  version: "1.0.1",
  versionCode: 2,
};
