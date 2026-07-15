import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import { UserRole, hasRoleOrHigher } from '../types/role';
import { PLAN_ORDER, type PlanType } from '../utils/planExpiry.util';

/**
 * Chặn endpoint theo gói cước — dùng SAU requireAuth.
 * Staff/Admin luôn được qua. Gói đã quá hạn (cron chưa kịp hạ cấp) coi như free.
 * Usage: router.post('/studio-chat', requirePlan('basic'), ...)
 */
export const requirePlan = (minTier: PlanType) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (hasRoleOrHigher(req.user.role, UserRole.STAFF)) { next(); return; }

      const { data, error } = await supabaseAdmin!
        .from('users')
        .select('plan_type, plan_expires_at')
        .eq('id', req.user.id)
        .single();
      if (error) throw error;

      let tier = (data?.plan_type ?? 'free') as PlanType;
      if (
        tier !== 'free' &&
        data?.plan_expires_at &&
        new Date(data.plan_expires_at).getTime() < Date.now()
      ) {
        tier = 'free';
      }

      if (PLAN_ORDER.indexOf(tier) < PLAN_ORDER.indexOf(minTier)) {
        res.status(403).json({
          success: false,
          error: `Tính năng này cần gói ${minTier.charAt(0).toUpperCase() + minTier.slice(1)} trở lên. Nâng cấp gói để sử dụng.`,
        });
        return;
      }
      next();
    } catch (err: any) {
      console.error('[requirePlan]', err.message);
      res.status(500).json({ success: false, error: 'Không kiểm tra được gói cước.' });
    }
  };
};
