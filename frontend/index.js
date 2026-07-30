import 'react-native-get-random-values';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (Platform.OS !== 'web') {
  try {
    const { install } = require('react-native-quick-crypto');
    install();
  } catch (e) {
    console.warn('QuickCrypto install skipped on this platform:', e);
  }
}

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

