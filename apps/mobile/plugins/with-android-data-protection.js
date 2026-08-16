const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/** Keep private local scenarios out of cloud backup and device-to-device transfer. */
module.exports = function withAndroidDataProtection(config) {
  config = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0]?.$;
    if (!application) throw new Error('Android application manifest entry is missing.');
    application['android:allowBackup'] = 'false';
    application['android:fullBackupContent'] = '@xml/backup_rules';
    application['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return result;
  });

  return withDangerousMod(config, [
    'android',
    async (result) => {
      const xmlDirectory = path.join(
        result.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDirectory, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDirectory, 'backup_rules.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n  <exclude domain="root" path="." />\n  <exclude domain="file" path="." />\n  <exclude domain="database" path="." />\n  <exclude domain="sharedpref" path="." />\n</full-backup-content>\n',
      );
      await fs.promises.writeFile(
        path.join(xmlDirectory, 'data_extraction_rules.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n    <exclude domain="root" path="." />\n    <exclude domain="file" path="." />\n    <exclude domain="database" path="." />\n    <exclude domain="sharedpref" path="." />\n  </cloud-backup>\n  <device-transfer>\n    <exclude domain="root" path="." />\n    <exclude domain="file" path="." />\n    <exclude domain="database" path="." />\n    <exclude domain="sharedpref" path="." />\n  </device-transfer>\n</data-extraction-rules>\n',
      );
      return result;
    },
  ]);
};
