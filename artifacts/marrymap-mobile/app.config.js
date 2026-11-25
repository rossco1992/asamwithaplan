/**
 * app.json holds the config. This only adds the web base URL when the web
 * build is served from a sub-path, such as /app/ for the PWA preview.
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
