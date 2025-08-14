const fs = require('fs');
const path = require('path');

// List of API routes that need updating
const API_ROUTES = [
  'src/app/api/import-csv/route.ts',
  'src/app/api/export-csv/route.ts',
  'src/app/api/export-missing-shipstation-products/route.ts',
  'src/app/api/export-product-descriptions-csv/route.ts',
  'src/app/api/test-small-sample/route.ts',
  'src/app/api/test-small-batch/route.ts',
  'src/app/api/test-batch-performance/route.ts',
  'src/app/api/diagnose-flowtrac/route.ts',
  'src/app/api/flowtrac-batch-processor/route.ts',
  'src/app/api/sync-session/route.ts',
  'src/app/api/migrate-bundle-format/route.ts',
  'src/app/api/update-mapping/route.ts',
  'src/app/api/github-mapping/route.ts',
  'src/app/api/test-mapping-product-ids/route.ts',
  'src/app/api/populate-product-ids/route.ts',
  'src/app/api/validate-skus/route.ts'
];

// List of utility files that need updating
const UTILITY_FILES = [
  'src/utils/test-fetchFlowtracShopifySkuInventory.ts',
  'src/utils/flowtrac-diagnostics.ts'
];

// List of scripts that need updating
const SCRIPTS = [
  'scripts/populate-github-mapping-product-ids.js',
  'scripts/insert-mapping-via-api.js'
];

// Patterns to replace
const REPLACEMENTS = [
  {
    // Import statements
    pattern: /import\s+.*getImportedMapping.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*/g,
    replacement: "import { mappingService } from '../../../services/mapping';"
  },
  {
    // File system imports
    pattern: /import\s+.*fs.*from\s+['"]fs['"];?\s*/g,
    replacement: ""
  },
  {
    // Path imports
    pattern: /import\s+.*path.*from\s+['"]path['"];?\s*/g,
    replacement: ""
  },
  {
    // Mapping path constants
    pattern: /const\s+mappingPath\s*=\s*.*path\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);?\s*/g,
    replacement: ""
  },
  {
    // Load mapping with imported mapping fallback
    pattern: /\/\/\s*Load mapping.*\(try imported mapping first, then fallback to file\)\s*let\s+mapping;\s*const\s+importedMapping\s*=\s*getImportedMapping\(\);\s*if\s*\(importedMapping\)\s*{\s*console\.log\('Using imported mapping data'\);\s*mapping\s*=\s*importedMapping;\s*}\s*else\s*{\s*const\s+mappingPath\s*=\s*path\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);\s*console\.log\('Using file mapping data'\);\s*mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);\s*}/g,
    replacement: "// Load mapping using the mapping service\n    const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    // Simple mapping loading
    pattern: /const\s+mappingPath\s*=\s*path\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);\s*const\s+mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);/g,
    replacement: "const { mapping } = await mappingService.getMapping();"
  },
  {
    // SKU collection
    pattern: /\/\/\s*Collect all SKUs.*\(simple and bundle components\)\s*const\s+skus\s*=\s*new\s+Set<string>\(\);\s*for\s*\(const\s+product\s+of\s+mapping\.products\)\s*{\s*if\s*\(product\.flowtrac_sku\)\s*skus\.add\(product\.flowtrac_sku\);\s*if\s*\(Array\.isArray\(product\.bundle_components\)\)\s*{\s*for\s*\(const\s+comp\s+of\s+product\.bundle_components\)\s*{\s*if\s*\(comp\.flowtrac_sku\)\s*skus\.add\(comp\.flowtrac_sku\);\s*}\s*}\s*}/g,
    replacement: "// Collect all SKUs using the mapping service\n    const skus = await mappingService.getMappedSkus();"
  },
  {
    // File writing
    pattern: /fs\.writeFileSync\(mappingPath,\s*JSON\.stringify\(mapping,\s*null,\s*2\)\);/g,
    replacement: "const result = await mappingService.updateMapping(mapping, 'api_update');\n      if (!result.success) {\n        throw new Error(`Failed to update mapping: ${result.error}`);\n      }"
  }
];

function updateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let updated = false;

    // Apply all replacements
    for (const replacement of REPLACEMENTS) {
      const newContent = content.replace(replacement.pattern, replacement.replacement);
      if (newContent !== content) {
        content = newContent;
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No changes needed: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔄 Starting systematic update of mapping usage...\n');

  let totalFiles = 0;
  let updatedFiles = 0;

  // Update API routes
  console.log('📁 Updating API routes...');
  for (const route of API_ROUTES) {
    totalFiles++;
    if (updateFile(route)) {
      updatedFiles++;
    }
  }

  // Update utility files
  console.log('\n📁 Updating utility files...');
  for (const util of UTILITY_FILES) {
    totalFiles++;
    if (updateFile(util)) {
      updatedFiles++;
    }
  }

  // Update scripts
  console.log('\n📁 Updating scripts...');
  for (const script of SCRIPTS) {
    totalFiles++;
    if (updateFile(script)) {
      updatedFiles++;
    }
  }

  console.log(`\n🎉 Update complete!`);
  console.log(`   Total files processed: ${totalFiles}`);
  console.log(`   Files updated: ${updatedFiles}`);
  console.log(`   Files unchanged: ${totalFiles - updatedFiles}`);

  if (updatedFiles > 0) {
    console.log('\n⚠️  Note: Some files may need manual review for:');
    console.log('   - Function signature changes (adding async)');
    console.log('   - Error handling adjustments');
    console.log('   - Import statement cleanup');
  }
}

main().catch(console.error);
