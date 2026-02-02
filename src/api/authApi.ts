import axios from 'axios';

import { AUTH_API_BASE_URL } from '../config/env';

const authApi = axios.create({
  baseURL: AUTH_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default authApi;
