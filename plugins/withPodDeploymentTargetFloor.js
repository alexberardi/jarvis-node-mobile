/**
 * Config plugin: raise every pod's IPHONEOS_DEPLOYMENT_TARGET to at least 15.1.
 *
 * Xcode 27 turns a pod deployment target below iOS 15 into a hard error, and
 * some pods still declare 9.0–13.4 (SDWebImage, RNSVG, AsyncStorage's resource
 * bundle). The app itself targets 15.1, so this changes nothing at runtime.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MIN = '15.1';
const MARKER = '# withPodDeploymentTargetFloor';
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if Gem::Version.new(c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '0') < Gem::Version.new('${MIN}')
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end`;

/** Insert SNIPPET right after the react_native_post_install(...) call. */
function addFloor(podfile) {
  if (podfile.includes(MARKER)) return podfile;
  const re = /(react_native_post_install\([\s\S]*?\n\s*\))/;
  if (!re.test(podfile)) {
    throw new Error('withPodDeploymentTargetFloor: react_native_post_install(...) not found in Podfile');
  }
  return podfile.replace(re, `$1\n${SNIPPET}`);
}

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      fs.writeFileSync(file, addFloor(fs.readFileSync(file, 'utf8')));
      return cfg;
    },
  ]);

module.exports.addFloor = addFloor;
