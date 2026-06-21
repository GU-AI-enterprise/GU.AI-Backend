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
  PERFORMANCE = 'performance',
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
 * GU.AI credit cost for variable-cost Fashn endpoints (×2 markup on Fashn pricing).
 * Covers: try-on-max, product-to-model, face-to-model, model-create, model-swap, edit, reframe.
 *
 * | mode    | 1k | 2k | 4k |
 * | fast    |  2 |  4 |  6 |
 * | balanced|  4 |  6 |  8 |
 * | quality |  6 |  8 | 10 |
 *
 * face_reference adds 3 Fashn credits per output image → +6 GU.AI credits per image.
 * num_images multiplies the total.
 */
export function computeVariableCreditCost(
  generationMode: FashnGenerationMode = FashnGenerationMode.BALANCED,
  resolution: FashnResolution = FashnResolution.ONE_K,
  numImages = 1,
  hasFaceReference = false,
): number {
  const table: Record<FashnGenerationMode, Record<FashnResolution, number>> = {
    [FashnGenerationMode.FAST]:     { [FashnResolution.ONE_K]: 2, [FashnResolution.TWO_K]: 4, [FashnResolution.FOUR_K]: 6 },
    [FashnGenerationMode.BALANCED]: { [FashnResolution.ONE_K]: 4, [FashnResolution.TWO_K]: 6, [FashnResolution.FOUR_K]: 8 },
    [FashnGenerationMode.QUALITY]:  { [FashnResolution.ONE_K]: 6, [FashnResolution.TWO_K]: 8, [FashnResolution.FOUR_K]: 10 },
  };
  const count = Math.max(1, Math.min(4, numImages));
  const base = table[generationMode]?.[resolution] ?? 4;
  const faceExtra = hasFaceReference ? 6 : 0;
  return (base + faceExtra) * count;
}

/** Backward-compat alias — prefer computeVariableCreditCost for new code. */
export function computeEditCreditCost(
  generationMode: FashnGenerationMode = FashnGenerationMode.BALANCED,
  resolution: FashnResolution = FashnResolution.ONE_K,
  numImages = 1,
): number {
  return computeVariableCreditCost(generationMode, resolution, numImages, false);
}

/**
 * GU.AI credit cost for image-to-video (×2 markup on Fashn pricing).
 *
 * | duration | 480p | 720p | 1080p |
 * |    5s    |   2  |   6  |  12   |
 * |   10s    |   4  |  12  |  24   |
 */
export function computeVideoCredits(
  duration: 5 | 10 = 5,
  resolution: '480p' | '720p' | '1080p' = '1080p',
): number {
  const table: Record<string, Record<string, number>> = {
    '5':  { '480p': 2, '720p': 6,  '1080p': 12 },
    '10': { '480p': 4, '720p': 12, '1080p': 24 },
  };
  return table[String(duration)]?.[resolution] ?? 12;
}

/**
 * CREDIT_COST: pre-flight worst-case estimate for fixed-cost endpoints.
 * Variable-cost endpoints (try-on-max, product-to-model, etc.) compute their cost
 * dynamically in the controller using computeVariableCreditCost / computeVideoCredits.
 */
export const CREDIT_COST: Record<AIJobType, number> = {
  [AIJobType.TRY_ON]:           2,   // tryon-v1.6: always 1 Fashn credit × 2
  [AIJobType.TRY_ON_MAX]:       10,  // balanced/1k × 1 image (dynamic compute in controller)
  [AIJobType.GENERATE]:         15,
  [AIJobType.EDIT]:             4,   // balanced/1k × 1 image (dynamic compute in controller)
  [AIJobType.REMOVE_BG]:        2,   // background-remove: always 1 Fashn credit × 2
  [AIJobType.UPSCALE]:          8,
  [AIJobType.PRODUCT_TO_MODEL]: 4,   // fast/1k × 1 image (dynamic compute in controller)
  [AIJobType.REFRAME]:          4,   // fast/1k × 1 image (dynamic compute in controller)
  [AIJobType.FACE_TO_MODEL]:    4,   // fast/1k × 1 image (dynamic compute in controller)
  [AIJobType.MODEL_CREATE]:     4,   // fast/1k × 1 image (dynamic compute in controller)
  [AIJobType.MODEL_SWAP]:       4,   // fast/1k × 1 image (dynamic compute in controller)
  [AIJobType.IMAGE_TO_VIDEO]:   12,  // 5s/1080p (dynamic compute in controller)
};
