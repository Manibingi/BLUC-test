import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: '/api', // This would be your actual API URL
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to attach token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized errors (expired tokens, etc.)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/'; // Redirect to home page
    }
    return Promise.reject(error);
  }
);

// For demo purposes, we're using mock API calls
// In production, replace these with actual API calls

// Authentication
const auth = {
  login: async (email, password) => {
    // Simulate API request
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: {
            user: {
              id: 'user123',
              email,
              fullName: 'Demo User'
            },
            token: 'demo-token'
          }
        });
      }, 800);
    });
  },
  
  signup: async (userData) => {
    // Simulate API request
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: {
            success: true,
            message: 'Account created successfully'
          }
        });
      }, 800);
    });
  },
  
  checkAuth: async () => {
    // Simulate API request
    return new Promise((resolve) => {
      setTimeout(() => {
        const token = localStorage.getItem('token');
        if (token) {
          resolve({
            data: {
              user: {
                id: 'user123',
                email: 'user@example.com',
                fullName: 'Demo User'
              }
            }
          });
        } else {
          resolve({ data: { user: null } });
        }
      }, 500);
    });
  }
};

// User profile
const user = {
  getProfile: async () => {
    return api.get('/auth/user/profile',{
      headers: {
        authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
  },
  
  updateProfile: async (profileData) => {
    return api.put('/auth/profile', profileData);
  }
};

// Subscription
const subscription = {
  getStatus: async () => {
    // In production, this would be an actual API call
    return api.get('/subscription/status');
  },
  
  subscribe: async (plan) => {
    // In production, this would be an actual API call
    return api.post('/subscription/create', { plan });
  }
};

export default {
  auth,
  user,
  subscription
};