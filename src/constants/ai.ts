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

/**
 * Dynamic credit cost for Edit — mirrors Fashn pricing (×2 markup), scaled by num_images.
 * fast 1k=2 | balanced 1k=4 | quality 1k=6; each tier up adds 2 per step.
 */
export function computeEditCreditCost(
  generationMode: FashnGenerationMode = FashnGenerationMode.BALANCED,
  resolution: FashnResolution = FashnResolution.ONE_K,
  numImages = 1,
): number {
  const table: Record<FashnGenerationMode, Record<FashnResolution, number>> = {
    [FashnGenerationMode.FAST]:     { [FashnResolution.ONE_K]: 2, [FashnResolution.TWO_K]: 4, [FashnResolution.FOUR_K]: 6 },
    [FashnGenerationMode.BALANCED]: { [FashnResolution.ONE_K]: 4, [FashnResolution.TWO_K]: 6, [FashnResolution.FOUR_K]: 8 },
    [FashnGenerationMode.QUALITY]:  { [FashnResolution.ONE_K]: 6, [FashnResolution.TWO_K]: 8, [FashnResolution.FOUR_K]: 10 },
  };
  const base = table[generationMode]?.[resolution] ?? 4;
  return base * Math.max(1, Math.min(4, numImages));
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
