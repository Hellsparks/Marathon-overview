import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './themes.css';

// Intercept console errors for the bug reporter
window.lastConsoleErrors = [];
const bufferSize = 50;

const originalError = console.error;
console.error = function (...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    window.lastConsoleErrors.push(`[ERROR] ${new Date().toISOString()}: ${msg}`);
    if (window.lastConsoleErrors.length > bufferSize) window.lastConsoleErrors.shift();
    originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = function (...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    window.lastConsoleErrors.push(`[WARN]  ${new Date().toISOString()}: ${msg}`);
    if (window.lastConsoleErrors.length > bufferSize) window.lastConsoleErrors.shift();
    originalWarn.apply(console, args);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
