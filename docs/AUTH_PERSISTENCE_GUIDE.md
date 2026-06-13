# Authentication Persistence Guide

## Problem
Login state was being lost when navigating between pages.

## Solution Implemented

### 1. Supabase Client Configuration (`lib/supabase.ts`)
- Enabled `persistSession: true` - Session is stored in localStorage
- Enabled `autoRefreshToken: true` - Tokens are automatically refreshed
- Set custom `storageKey: 'guai-auth-token'` - Unique key for storage
- Using `window.localStorage` for client-side persistence

### 2. AuthContext Provider (`contexts/AuthContext.tsx`)
- Global auth state management using React Context
- Listens to Supabase auth state changes automatically
- Provides `user`, `session`, `loading` state to entire app
- Exposes `signOut()` and `refreshSession()` methods
- Wrapped in `AuthProvider` in root layout

### 3. Middleware Protection (`middleware.ts`)
- Server-side route protection using `@supabase/ssr`
- Protects routes: `/dashboard`, `/profile`, `/settings`
- Redirects unauthenticated users to `/login` with redirect parameter
- Redirects authenticated users away from auth pages (`/login`, `/register`)
- Syncs cookies between server and client

### 4. Updated Login Page (`app/(auth)/login/page.tsx`)
- Uses real Supabase `signInWithPassword()` instead of mock
- Redirects to intended page after successful login
- Uses Supabase OAuth for Google login
- Handles errors properly

### 5. Updated Register Page (`app/(auth)/register/page.tsx`)
- Uses real Supabase `signUp()` instead of mock
- Stores user name in user metadata
- Password validation (minimum 6 characters)
- Uses Supabase OAuth for Google signup

## How It Works

### Session Flow
1. User logs in → Supabase creates session
2. Session stored in localStorage with key `guai-auth-token`
3. AuthContext listens to auth state changes
4. User navigates → Session persists in localStorage
5. Middleware checks session on server-side for protected routes
6. Auto-refresh keeps session alive

### Token Refresh
- Supabase automatically refreshes tokens before expiry
- No manual intervention needed
- Session remains valid across page refreshes

## Usage in Components

```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, session, loading, signOut } = useAuth();

  if (loading) return <div>Loading...</div>;
  
  if (!user) return <div>Please login</div>;

  return (
    <div>
      <p>Welcome, {user.email}</p>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

## Protected Routes

Add routes to protect in `middleware.ts`:
```typescript
const protectedPaths = ['/dashboard', '/profile', '/settings', '/your-route'];
```

## Environment Variables Required

Ensure these are set in `.env`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Benefits

- ✅ Session persists across page navigations
- ✅ Session persists after browser refresh
- ✅ Automatic token refresh
- ✅ Server-side route protection
- ✅ Global auth state accessible anywhere
- ✅ OAuth (Google) login supported
- ✅ Redirect to intended page after login

## Testing

1. Login with email/password
2. Navigate to different pages - session should persist
3. Refresh browser - session should persist
4. Close and reopen browser - session should persist (localStorage)
5. Try to access protected route while logged out - should redirect to login
6. Try to access login page while logged in - should redirect to dashboard
