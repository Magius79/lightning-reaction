import axios from 'axios';

/**
 * Axios instance for calls to the backend's internal/money routes.
 * Attaches the shared INTERNAL_API_KEY on every request via an interceptor,
 * so the key is read at call time (after dotenv.config() has run) rather than
 * at module load.
 */
export const backendApi = axios.create();

backendApi.interceptors.request.use((config) => {
  config.headers.set('X-Internal-Key', process.env.INTERNAL_API_KEY || '');
  return config;
});
