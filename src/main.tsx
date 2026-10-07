import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import './styles.css';
import App from './App';

if (window.__KIN_WIDGET__) {
  document.body.classList.add('kin-widget');
  void import('./widget-host')
    .then(({ connectWidgetHost }) => connectWidgetHost())
    .catch(() => {
      /* The workspace still works in a standalone browser. */
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
