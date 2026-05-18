import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const api = axios.create({
    baseURL: 'http://localhost:3002/api/v1',
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !(originalRequest as any)._retry) {
            (originalRequest as any)._retry = true;
            try {
                const { data } = await api.post('/auth/refresh');
                useAuthStore.getState().setAccessToken(data.access_token);
                originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
                return api(originalRequest);
            } catch {
                useAuthStore.getState().clearAccessToken();
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
