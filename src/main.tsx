import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import App from './App';
import { preloadDemoAssets } from './demo/ads';
import './styles.css';
preloadDemoAssets();
if ('fonts' in document) void Promise.all([
  document.fonts.load('400 16px Geist'), document.fonts.load('500 16px Geist'), document.fonts.load('600 16px Geist'),
  document.fonts.load('500 48px "Barlow Condensed"'), document.fonts.load('600 48px "Barlow Condensed"'), document.fonts.load('700 48px "Barlow Condensed"'),
]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
