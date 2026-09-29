// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// pdf-lib (audit report) imports tslib; Metro's package-exports resolution picks tslib's ESM wrapper,
// which crashes at load ("Cannot destructure property '__extends'"). Use tslib's plain ES build instead.
const ALIASES = { tslib: require.resolve("tslib/tslib.es6.js") };
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(context, ALIASES[moduleName] ?? moduleName, platform);

module.exports = config;
