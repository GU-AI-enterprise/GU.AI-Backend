export enum AIJobType {
  TRY_ON = 'try_on',
  GENERATE = 'generate',
  EDIT = 'edit',
  REMOVE_BG = 'remove_bg',
  UPSCALE = 'upscale',
}

export enum AIJobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum AIProvider {
  NANO_BANANA = 'nano_banana',
  REMOVE_BG = 'remove_bg',
  FASHN = 'fashn',
}

export enum TryOnCategory {
  TOPS = 'tops',
  BOTTOMS = 'bottoms',
  ONE_PIECES = 'one-pieces',
}

export enum TryOnMode {
  QUALITY = 'quality',
  BALANCED = 'balanced',
  SPEED = 'speed',
}

export const CREDIT_COST: Record<AIJobType, number> = {
  [AIJobType.TRY_ON]: 10,
  [AIJobType.GENERATE]: 15,
  [AIJobType.EDIT]: 5,
  [AIJobType.REMOVE_BG]: 8,
  [AIJobType.UPSCALE]: 8,
};
