/*
 * OQENTRA PUBLIC FRONTEND CONFIGURATION
 * ------------------------------------------------------------------
 * Replace the values below before deploying the website.
 * This file contains public configuration only. Never put passwords,
 * JWT secrets, database credentials, API keys or private tokens here.
 */
window.OQENTRA_CONFIG = Object.freeze({
  // Local backend example. Replace with the deployed HTTPS API base URL.
  // Example: https://api.your-domain.com/api
  API_BASE_URL: "http://localhost:4000/api",

  // Optional WhatsApp business number: country code + number, digits only.
  // Leave empty until OQENTRA's official number is ready.
  WHATSAPP_NUMBER: "",

  // Optional public business email. Leave empty until it is configured.
  PUBLIC_EMAIL: ""
});
