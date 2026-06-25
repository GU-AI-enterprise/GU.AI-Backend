export const PLAN_ORDER = ['free', 'basic', 'pro'] as const;
export type PlanType = typeof PLAN_ORDER[number];

const PLAN_DURATION_DAYS = 30;

export interface PlanRenewal {
  plan_type: string;
  plan_expires_at: string;
}

/**
 * Tính plan_type + plan_expires_at mới khi user mua/gia hạn 1 gói (gọi sau khi thanh toán thành công).
 * - Gói mới tier cao hơn tier hiện tại (hoặc đang free) → nâng cấp, hạn = now + 30 ngày.
 * - Gói mới CÙNG tier với gói đang active (chưa hết hạn) → coi là gia hạn, cộng thêm 30 ngày
 *   từ hạn hiện tại (không phải từ now) để không mất số ngày còn lại khi gia hạn sớm.
 * - Gói mới cùng tier nhưng gói cũ đã hết hạn → tính lại từ now (không cộng dồn ngày đã mất).
 * - Gói mới tier thấp hơn tier đang active → không đổi gì (never downgrade), trả về null.
 */
export function computePlanRenewal(
  currentPlanType: string | null,
  currentExpiresAt: string | null,
  grantsPlanType: string | null,
): PlanRenewal | null {
  if (!grantsPlanType) return null;

  const newIdx = PLAN_ORDER.indexOf(grantsPlanType as PlanType);
  if (newIdx === -1) return null; // grants_plan_type không hợp lệ (vd. tier đã bị xoá)

  const now = Date.now();
  const currentIdx = PLAN_ORDER.indexOf((currentPlanType ?? 'free') as PlanType);
  const currentExpiryMs = currentExpiresAt ? new Date(currentExpiresAt).getTime() : 0;
  const isCurrentlyActive = currentIdx > 0 && currentExpiryMs > now;

  if (newIdx < currentIdx && isCurrentlyActive) return null; // never downgrade

  const sameTierRenewal = newIdx === currentIdx && isCurrentlyActive;
  const baseMs = sameTierRenewal ? currentExpiryMs : now;
  const plan_expires_at = new Date(baseMs + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return { plan_type: grantsPlanType, plan_expires_at };
}
