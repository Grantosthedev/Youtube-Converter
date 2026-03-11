require('dotenv').config();
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/ffmpeg-static/**',
    },
    name: 'DL Buddy',
    icon: path.join(__dirname, 'assets', 'icon'),
    extraResource: [
      path.join(__dirname, 'bin'),
    ],
    ignore: [
      /^\/bin($|\/)/,
      /^\/assets($|\/)/,
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
    osxSign: {},
    // osxNotarize: {
    //   keychainProfile: 'DLBuddy'
    // }
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
        name: 'DL Buddy',
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