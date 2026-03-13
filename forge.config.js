require('dotenv').config();
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/ffmpeg-static/**',
    },
    name: 'Downroad',
    appBundleId: 'com.grantosthedev.downroad',
    icon: path.join(__dirname, 'assets', 'icon'),
    extraResource: [],
    ignore: [
      /^\/bin($|\/)/,
      /^\/assets($|\/)/,
      /^\/build($|\/)/,
      /^\/scripts($|\/)/,
      /^\/out($|\/)/,
      /^\/\.git/,
      /^\/\.env$/,
      /^\/\.gitignore$/,
      /^\/README\.md$/i,
      /^\/forge\.config\.js$/,
      /\.d\.ts$/,
      /\.js\.map$/,
      /\/CHANGELOG(\.md)?$/i,
    ],
    osxSign: {
      identity: 'Developer ID Application: Grant Jenkins (89SDQA6945)',
      hardenedRuntime: true,
      entitlements: path.join(__dirname, 'build', 'entitlements.plist'),
      entitlementsInherit: path.join(__dirname, 'build', 'entitlements.inherit.plist'),
      signatureFlags: ['library'],
    },
    osxNotarize: {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'Downroad',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
    }),
  ],
};