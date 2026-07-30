const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: require.resolve('stream-browserify'),
  crypto: require.resolve('crypto-browserify'),
  buffer: require.resolve('buffer'),
  string_decoder: require.resolve('string_decoder'),
  events: require.resolve('events'),
};

module.exports = config;
