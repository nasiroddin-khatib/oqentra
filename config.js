/*
 * OQENTRA PUBLIC WEBSITE CONFIGURATION
 * ------------------------------------------------------------------
 * Public browser settings only. Never place database passwords, JWT secrets,
 * AWS credentials, private API keys or other server secrets in this file.
 */
window.OQENTRA_CONFIG = Object.freeze({
  // Relative URL keeps requests on the website's own domain.
  // Configure Nginx to proxy /api/ requests to the Express backend.
  // If the API is hosted separately, replace this with its HTTPS base URL.
  API_BASE_URL: "/api",

  // Optional official WhatsApp number: country code + number, digits only.
  WHATSAPP_NUMBER: "",

  // Optional public business email. Leave empty until the mailbox is ready.
  PUBLIC_EMAIL: ""
});
