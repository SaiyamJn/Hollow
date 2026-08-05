const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow http:// API hosts (self-hosted Hollow). Remove when fully on HTTPS. -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/**
 * - Force cleartext HTTP (release APKs otherwise block http://server/api)
 * - Name release APK: Hollow Ver-{versionName}.apk
 */
function withHollowAndroid(config) {
  const versionName = config.version || "1.0.0";

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "network_security_config.xml"), NETWORK_SECURITY_CONFIG);
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:usesCleartextTraffic"] = "true";
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("Hollow Ver-")) {
      return cfg;
    }
    // Name release/debug APKs for sideload downloads (EAS picks them up via glob).
    cfg.modResults.contents += `

// Hollow: name sideload APKs "Hollow Ver-x.x.x.apk"
android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def vName = variant.versionName ?: "${versionName}"
        output.outputFileName = "Hollow Ver-\${vName}.apk"
    }
}
`;
    return cfg;
  });

  return config;
}

module.exports = withHollowAndroid;
