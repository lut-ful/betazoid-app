import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3002/api/v1',
});

export default api;
