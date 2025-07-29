// In-memory storage for the imported mapping (for serverless environment)
let importedMappingData: any = null;

export function setImportedMapping(mapping: any) {
  importedMappingData = mapping;
}

export function getImportedMapping() {
  // First try the immediate imported mapping
  if (importedMappingData) {
    return importedMappingData;
  }
  
  // Fallback to cached mapping if available
  try {
    const { getCachedMapping } = require('./mapping-cache');
    const cachedMapping = getCachedMapping();
    if (cachedMapping) {
      console.log('Using cached mapping data as fallback');
      return cachedMapping;
    }
  } catch (error) {
    console.log('No cached mapping available');
  }
  
  return null;
}

export function clearImportedMapping() {
  importedMappingData = null;
} 