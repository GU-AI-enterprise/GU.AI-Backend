export enum AIJobType {
  TRY_ON = 'try_on',
  TRY_ON_MAX = 'try_on_max',
  GENERATE = 'generate',
  EDIT = 'edit',
  REMOVE_BG = 'remove_bg',
  UPSCALE = 'upscale',
  PRODUCT_TO_MODEL = 'product_to_model',
  REFRAME = 'reframe',
  FACE_TO_MODEL = 'face_to_model',
  MODEL_CREATE = 'model_create',
  MODEL_SWAP = 'model_swap',
  IMAGE_TO_VIDEO = 'image_to_video',
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
  AUTO = 'auto',
  TOPS = 'tops',
  BOTTOMS = 'bottoms',
  ONE_PIECES = 'one-pieces',
}

export enum TryOnMode {
  QUALITY = 'quality',
  BALANCED = 'balanced',
  SPEED = 'speed',
}

export enum FashnResolution {
  ONE_K = '1k',
  TWO_K = '2k',
  FOUR_K = '4k',
}

export enum FashnGenerationMode {
  FAST = 'fast',
  BALANCED = 'balanced',
  QUALITY = 'quality',
}

export const CREDIT_COST: Record<AIJobType, number> = {
  [AIJobType.TRY_ON]: 10,
  [AIJobType.TRY_ON_MAX]: 20,
  [AIJobType.GENERATE]: 15,
  [AIJobType.EDIT]: 5,
  [AIJobType.REMOVE_BG]: 3,
  [AIJobType.UPSCALE]: 8,
  [AIJobType.PRODUCT_TO_MODEL]: 12,
  [AIJobType.REFRAME]: 5,
  [AIJobType.FACE_TO_MODEL]: 8,
  [AIJobType.MODEL_CREATE]: 20,
  [AIJobType.MODEL_SWAP]: 12,
  [AIJobType.IMAGE_TO_VIDEO]: 25,
};
