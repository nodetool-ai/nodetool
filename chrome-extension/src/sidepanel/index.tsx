import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register all browser tools with the BrowserToolRegistry
import '../lib/tools/builtin';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
