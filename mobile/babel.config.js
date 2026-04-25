// Expo SDK 51 ships with the right babel preset. The reanimated plugin MUST
// be the last item in `plugins` (per the reanimated docs) — putting it
// anywhere else silently breaks worklets in production builds.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
