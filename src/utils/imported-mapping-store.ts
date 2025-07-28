// In-memory storage for the imported mapping (for serverless environment)
let importedMappingData: any = null;

export function setImportedMapping(mapping: any) {
  importedMappingData = mapping;
}

export function getImportedMapping() {
  return importedMappingData;
}

export function clearImportedMapping() {
  importedMappingData = null;
} 