// Simple in-memory cache with timestamp for persistence tracking
let mappingCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export function setCachedMapping(mapping: any) {
  mappingCache = {
    data: mapping,
    timestamp: Date.now()
  };
}

export function getCachedMapping() {
  if (mappingCache && (Date.now() - mappingCache.timestamp) < CACHE_DURATION) {
    return mappingCache.data;
  }
  return null;
}

export function clearCachedMapping() {
  mappingCache = null;
}

export function getCacheStatus() {
  if (mappingCache && (Date.now() - mappingCache.timestamp) < CACHE_DURATION) {
    return {
      hasCachedMapping: true,
      productCount: mappingCache.data.products?.length || 0,
      timestamp: mappingCache.timestamp
    };
  } else {
    return {
      hasCachedMapping: false
    };
  }
} 