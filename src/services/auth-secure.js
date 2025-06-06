// HBVU PHOTOS Authentication Service
// Secure authentication service with environment variable configuration

const AUTH_TOKEN_KEY = 'hbvu_auth_token';
const USER_DATA_KEY = 'hbvu_user_data';

// Configuration from environment variables
const config = {
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  apiUrl: import.meta.env.VITE_API_URL,
  authEndpoint: import.meta.env.VITE_AUTH_ENDPOINT || '/api/auth/login',
  userEndpoint: import.meta.env.VITE_USER_ENDPOINT || '/api/users',
  demoCredentials: {
    admin: {
      username: import.meta.env.VITE_DEMO_ADMIN_USERNAME || 'admin',
      password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'admin123'
    },
    user: {
      username: import.meta.env.VITE_DEMO_USER_USERNAME || 'user',
      password: import.meta.env.VITE_DEMO_USER_PASSWORD || 'user123'
    }
  }
};

// Demo users for development (only used when VITE_DEMO_MODE=true)
const demoUsers = {
  [config.demoCredentials.admin.username]: {
    id: 1,
    username: config.demoCredentials.admin.username,
    name: 'Admin User',
    email: 'admin@hbvu.su',
    role: 'admin',
    avatar: '👤',
    password: config.demoCredentials.admin.password,
    permissions: ['upload_photos', 'create_album', 'delete_album', 'delete_photo', 'manage_users']
  },
  [config.demoCredentials.user.username]: {
    id: 2,
    username: config.demoCredentials.user.username,
    name: 'Regular User',
    email: 'user@hbvu.su',
    role: 'user',
    avatar: '👤',
    password: config.demoCredentials.user.password,
    permissions: []
  }
};

// Demo authentication function (development only)
async function demoLogin(username, password) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const user = demoUsers[username];
  if (!user || user.password !== password) {
    throw new Error('Invalid username or password');
  }
  
  // Generate a simple demo token
  const token = btoa(JSON.stringify({ userId: user.id, exp: Date.now() + 24 * 60 * 60 * 1000 }));
  
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      permissions: user.permissions
    }
  };
}

// Production authentication function
async function productionLogin(username, password) {
  const response = await fetch(`${config.apiUrl}${config.authEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(error.message || 'Authentication failed');
  }
  
  return await response.json();
}

// Validate token with backend
async function validateToken(token) {
  if (config.demoMode) {
    // Demo token validation
    try {
      const decoded = JSON.parse(atob(token));
      return decoded.exp > Date.now();
    } catch {
      return false;
    }
  } else {
    // Production token validation
    const response = await fetch(`${config.apiUrl}/api/auth/validate`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.ok;
  }
}

class AuthService {
  constructor() {
    this.currentUser = null;
    this.token = localStorage.getItem(AUTH_TOKEN_KEY);
    this.isInitialized = false;
  }

  // Initialize auth service and restore session
  async init() {
    if (this.token) {
      try {
        if (await validateToken(this.token)) {
          const userData = localStorage.getItem(USER_DATA_KEY);
          if (userData) {
            this.currentUser = JSON.parse(userData);
          }
        } else {
          this.clearAuth();
        }
      } catch (error) {
        console.warn('Token validation failed, clearing auth:', error);
        this.clearAuth();
      }
    }
    this.isInitialized = true;
  }

  // Login with username and password
  async login(username, password) {
    try {
      let response;
      
      if (config.demoMode) {
        response = await demoLogin(username, password);
      } else {
        response = await productionLogin(username, password);
      }
      
      this.token = response.token;
      this.currentUser = response.user;
      
      localStorage.setItem(AUTH_TOKEN_KEY, this.token);
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(this.currentUser));
      
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  // Logout and clear session
  logout() {
    this.clearAuth();
    return { success: true };
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.token && this.currentUser);
  }

  // Check if user is admin
  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get auth token
  getToken() {
    return this.token;
  }

  // Clear authentication state
  clearAuth() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  }

  // Permission system
  canPerformAction(action) {
    if (!this.isAuthenticated()) {
      return false;
    }

    // Check if user has specific permission
    if (this.currentUser.permissions) {
      return this.currentUser.permissions.includes(action);
    }

    // Fallback to role-based permissions
    const adminActions = ['upload_photos', 'create_album', 'delete_album', 'delete_photo', 'manage_users'];
    if (adminActions.includes(action)) {
      return this.isAdmin();
    }

    return true; // Regular users can view content
  }

  // User management methods (for demo mode)
  async getUsers() {
    if (config.demoMode) {
      return Object.values(demoUsers).map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: '2024-01-01',
        lastLogin: new Date().toISOString()
      }));
    } else {
      // Production: fetch from backend
      const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      return await response.json();
    }
  }

  async createUser(userData) {
    if (config.demoMode) {
      // Demo mode: simulate user creation
      throw new Error('User creation not available in demo mode');
    } else {
      // Production: create user via backend
      const response = await fetch(`${config.apiUrl}${config.userEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create user' }));
        throw new Error(error.message);
      }
      
      return await response.json();
    }
  }

  async updateUser(userId, userData) {
    if (config.demoMode) {
      // Demo mode: simulate user update
      throw new Error('User updates not available in demo mode');
    } else {
      // Production: update user via backend
      const response = await fetch(`${config.apiUrl}${config.userEndpoint}/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(userData)
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update user' }));
        throw new Error(error.message);
      }
      
      return await response.json();
    }
  }

  async deleteUser(userId) {
    if (config.demoMode) {
      // Demo mode: simulate user deletion
      throw new Error('User deletion not available in demo mode');
    } else {
      // Production: delete user via backend
      const response = await fetch(`${config.apiUrl}${config.userEndpoint}/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete user' }));
        throw new Error(error.message);
      }
      
      return true;
    }
  }

  // Get configuration info (useful for displaying mode in UI)
  getConfig() {
    return {
      demoMode: config.demoMode,
      hasBackendAuth: !config.demoMode
    };
  }
}

export default new AuthService();
