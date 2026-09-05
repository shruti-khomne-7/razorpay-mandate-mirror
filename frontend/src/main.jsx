import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App.jsx';
import './index.css';

// Demo clients must provide a principal key; the backend fails closed without it.
const mandateApiKey = import.meta.env.VITE_MANDATE_API_KEY;
if (mandateApiKey) axios.defaults.headers.common['X-API-Key'] = mandateApiKey;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
