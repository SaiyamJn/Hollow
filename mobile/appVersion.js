/**
 * Single source of truth for Hollow mobile releases.
 * Bump BOTH fields when shipping a new build (Play Store AAB or sideload APK).
 *
 * - version     → user-facing (SemVer). Sideload APK: `Hollow Ver-{version}.apk`
 * - versionCode → Android integer; must increase every Play upload.
 */
module.exports = {
  version: "1.3.12",
  versionCode: 51,
};
