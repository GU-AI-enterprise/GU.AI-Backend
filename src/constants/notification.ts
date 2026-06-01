export enum NotificationType {
  PAYMENT = 'payment',
  AI_JOB = 'ai_job',
  SUPPORT = 'support',
  SYSTEM = 'system',
  SECURITY = 'security',
  PROMOTION = 'promotion',
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
}
