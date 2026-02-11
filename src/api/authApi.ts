import axios from 'axios';

// baseURL is set dynamically by ConfigProvider before any consumers mount
const authApi = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default authApi;
