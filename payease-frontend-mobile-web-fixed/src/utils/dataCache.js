// Re-export upgraded CacheManager and methods for 100% backward compatibility
export {
  CacheManager,
  appCache,
  silentFetch,
  smartFetch,
  isDataEqual,
  parseCachedNumber
} from "./CacheManager";
