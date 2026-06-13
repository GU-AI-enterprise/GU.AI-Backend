# Role-Based Authorization Guide

## Overview
The backend now supports 3 user roles with hierarchical permissions:
- **CUSTOMER** - Regular users (level 1)
- **STAFF** - Staff members (level 2)
- **ADMIN** - Administrators (level 3)

## Database Schema
The `users` table has a `role` column with constraint:
```sql
role varchar NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','admin'))
```

## Role Types & Utilities

### UserRole Enum
```typescript
import { UserRole } from '../types/role';

UserRole.CUSTOMER  // 'customer'
UserRole.STAFF     // 'staff'
UserRole.ADMIN     // 'admin'
```

### Role Hierarchy
```typescript
import { ROLE_HIERARCHY, hasRoleOrHigher } from '../types/role';

ROLE_HIERARCHY[UserRole.CUSTOMER]  // 1
ROLE_HIERARCHY[UserRole.STAFF]     // 2
ROLE_HIERARCHY[UserRole.ADMIN]     // 3

// Check if user has required role or higher
hasRoleOrHigher(UserRole.STAFF, UserRole.ADMIN)   // false
hasRoleOrHigher(UserRole.ADMIN, UserRole.STAFF)   // true
hasRoleOrHigher(UserRole.STAFF, UserRole.CUSTOMER) // true
```

## HTTP API Authorization

### Import Middleware
```typescript
import { requireAuth, requireRole, requireStaff, requireAdmin, requireCustomer } from '../middlewares/auth.middleware';
import { UserRole } from '../types/role';
```

### Basic Authentication
```typescript
router.get('/profile', requireAuth, getProfile);
```

### Require Specific Role or Higher
```typescript
// Requires STAFF or higher (STAFF, ADMIN)
router.get('/dashboard', requireAuth, requireRole(UserRole.STAFF), getDashboard);

// Requires ADMIN only
router.get('/admin/users', requireAuth, requireRole(UserRole.ADMIN), listUsers);
```

### Pre-built Middleware

#### requireStaff
Allows STAFF and ADMIN:
```typescript
router.get('/staff/dashboard', requireAuth, requireStaff, getStaffDashboard);
```

#### requireAdmin
Allows ADMIN only:
```typescript
router.get('/admin/settings', requireAuth, requireAdmin, updateSettings);
```

#### requireCustomer
Allows CUSTOMER only:
```typescript
router.get('/customer/orders', requireAuth, requireCustomer, getOrders);
```

## Socket.IO Authorization

### Import Middleware
```typescript
import { socketAuthMiddleware, adminAuthMiddleware, staffAuthMiddleware } from '../middlewares/socket.middleware';
```

### Basic Socket Authentication
All authenticated users (any role):
```typescript
io.use(socketAuthMiddleware);
```

### Admin-Only Socket
Only ADMIN users:
```typescript
io.use(adminAuthMiddleware);
```

### Staff-Only Socket
STAFF and ADMIN users:
```typescript
io.use(staffAuthMiddleware);
```

### Access User Role in Socket Handlers
```typescript
io.on('connection', (socket: AuthenticatedSocket) => {
  console.log(`User role: ${socket.userRole}`);
  
  if (socket.userRole === UserRole.ADMIN) {
    // Admin-specific logic
  }
});
```

## AuthRequest Interface
After authentication, `req.user` contains:
```typescript
{
  id: string;
  email: string;
  role: UserRole;
}
```

## Usage Examples

### Example 1: Customer Endpoint
```typescript
import express from 'express';
import { requireAuth, requireCustomer } from '../middlewares/auth.middleware';

const router = express.Router();

router.post('/orders', requireAuth, requireCustomer, createOrder);
```

### Example 2: Staff Endpoint
```typescript
import { requireAuth, requireStaff } from '../middlewares/auth.middleware';

router.get('/support/tickets', requireAuth, requireStaff, listTickets);
```

### Example 3: Admin Endpoint
```typescript
import { requireAuth, requireAdmin } from '../middlewares/auth.middleware';

router.put('/users/:id/role', requireAuth, requireAdmin, updateUserRole);
```

### Example 4: Role-Based Response
```typescript
import { requireAuth, UserRole } from '../middlewares/auth.middleware';

router.get('/data', requireAuth, (req, res) => {
  if (req.user?.role === UserRole.ADMIN) {
    return res.json({ allData: '...' });
  }
  
  if (req.user?.role === UserRole.STAFF) {
    return res.json({ staffData: '...' });
  }
  
  // Customer
  return res.json({ customerData: '...' });
});
```

### Example 5: Socket Room by Role
```typescript
import { socketAuthMiddleware, AuthenticatedSocket } from '../middlewares/socket.middleware';
import { UserRole } from '../types/role';

io.use(socketAuthMiddleware);

io.on('connection', (socket: AuthenticatedSocket) => {
  if (socket.userRole === UserRole.ADMIN) {
    socket.join('admin-room');
  } else if (socket.userRole === UserRole.STAFF) {
    socket.join('staff-room');
  }
});
```

## Migration Notes

If you have existing users with old role values ('user'), run this migration:

```sql
-- Update existing 'user' roles to 'customer'
UPDATE public.users 
SET role = 'customer' 
WHERE role = 'user';

-- Update activity_logs actor_role
UPDATE public.activity_logs 
SET actor_role = 'customer' 
WHERE actor_role = 'user';
```

## Best Practices

1. **Always use `requireAuth` first** before role-based middleware
2. **Use the most restrictive middleware** that fits your needs
3. **Prefer `requireRole(UserRole.X)`** for flexibility
4. **Use pre-built middleware** for common cases (requireStaff, requireAdmin)
5. **Check role in controllers** for conditional logic
6. **Log role changes** in activity_logs for audit trail

## Error Responses

- **401 Unauthorized** - Missing or invalid token
- **403 Forbidden** - Insufficient role permissions

Example error:
```json
{
  "error": "Access denied. Admin role required."
}
```
