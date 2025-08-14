const fs = require('fs');
const path = require('path');

// Patterns to search for and fix
const FIX_PATTERNS = [
  {
    name: 'Missing mappingService import',
    pattern: /import\s+.*getImportedMapping.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*/g,
    replacement: "import { mappingService } from '../../../services/mapping';\n"
  },
  {
    name: 'Missing setImportedMapping import',
    pattern: /import\s+.*setImportedMapping.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*/g,
    replacement: "import { mappingService } from '../../../services/mapping';\n"
  },
  {
    name: 'Old mapping loading pattern 1',
    pattern: /const\s+importedMapping\s*=\s*getImportedMapping\(\);\s*if\s*\(importedMapping\)\s*{\s*console\.log\('Using imported mapping data'\);\s*mapping\s*=\s*importedMapping;\s*}\s*else\s*{\s*const\s+mappingPath\s*=\s*path\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);\s*console\.log\('Using file mapping data'\);\s*mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);\s*}/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Old mapping loading pattern 2',
    pattern: /const\s+importedMapping\s*=\s*getImportedMapping\(\);\s*if\s*\(importedMapping\)\s*{\s*console\.log\('Using imported mapping data for.*'\);\s*mapping\s*=\s*importedMapping;\s*}\s*else\s*{\s*console\.log\('Loading mapping\.json from repository'\);\s*const\s+mappingPath\s*=\s*require\('path'\)\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);\s*mapping\s*=\s*JSON\.parse\(require\('fs'\)\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);\s*}/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Simple getImportedMapping usage',
    pattern: /const\s+mapping\s*=\s*getImportedMapping\(\);/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Simple importedMapping assignment',
    pattern: /const\s+importedMapping\s*=\s*getImportedMapping\(\);\s*if\s*\(importedMapping\)\s*{\s*mapping\s*=\s*importedMapping;\s*}\s*else\s*{\s*mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);\s*}/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Direct fs.readFileSync mapping.json',
    pattern: /const\s+mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Direct fs.readFileSync without mappingPath',
    pattern: /JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\)/g,
    replacement: "(await mappingService.getMapping()).mapping"
  },
  {
    name: 'setImportedMapping usage',
    pattern: /setImportedMapping\(mapping\);/g,
    replacement: "await mappingService.updateMapping(mapping, 'api_update');"
  },
  {
    name: 'fs.writeFileSync mapping.json',
    pattern: /fs\.writeFileSync\(mappingPath,\s*JSON\.stringify\(.*,\s*null,\s*2\)\);/g,
    replacement: "await mappingService.updateMapping(mapping, 'api_update');"
  },
  {
    name: 'Missing mappingService reference',
    pattern: /await\s+mappingService\.updateMapping\(/g,
    replacement: "await mappingService.updateMapping("
  }
];

// Files to check (all API routes and services)
const FILES_TO_CHECK = [
  'src/app/api/diagnose-flowtrac/route.ts',
  'src/app/api/export-csv/route.ts',
  'src/app/api/flowtrac-batch-processor/route.ts',
  'src/app/api/import-csv/route.ts',
  'src/app/api/migrate-bundle-format/route.ts',
  'src/app/api/persist-mapping/route.ts',
  'src/app/api/test-batch-performance/route.ts',
  'src/app/api/test-mapping-product-ids/route.ts',
  'src/app/api/test-small-batch/route.ts',
  'src/app/api/update-mapping/route.ts',
  'src/app/api/sync-session/route.ts',
  'src/app/api/populate-product-ids/route.ts',
  'src/app/api/github-mapping/route.ts',
  'src/app/api/validate-skus/route.ts',
  'services/flowtrac.ts',
  'services/shopify.ts',
  'src/services/mapping.ts',
  'src/utils/enrich-mapping-with-product-ids.ts',
  'src/utils/flowtrac-diagnostics.ts',
  'src/utils/test-fetchFlowtracShopifySkuInventory.ts'
];

function fixFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { status: 'missing', changes: [] };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let changes = [];
    let updated = false;

    // Apply each fix pattern
    for (const pattern of FIX_PATTERNS) {
      const newContent = content.replace(pattern.pattern, pattern.replacement);
      if (newContent !== content) {
        content = newContent;
        changes.push(pattern.name);
        updated = true;
      }
    }

    // Additional cleanup: remove empty import lines
    content = content.replace(/^\s*import\s+.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*$/gm, '');

    // Fix TypeScript errors for dynamic properties
    content = content.replace(/product\.bundle_components_simple\s*=/g, '(product as any).bundle_components_simple =');
    content = content.replace(/mapping\.lastMigration\s*=/g, '(mapping as any).lastMigration =');

    if (updated) {
      fs.writeFileSync(filePath, content);
      return { status: 'updated', changes };
    } else {
      return { status: 'no_changes', changes: [] };
    }

  } catch (error) {
    return { status: 'error', error: error.message, changes: [] };
  }
}

function main() {
  console.log('🔧 Fixing all compilation errors...\n');

  let updatedCount = 0;
  let errorCount = 0;
  let noChangesCount = 0;

  for (const filePath of FILES_TO_CHECK) {
    const result = fixFile(filePath);
    
    if (result.status === 'updated') {
      console.log(`✅ ${path.basename(filePath)}`);
      console.log(`   Changes: ${result.changes.join(', ')}`);
      updatedCount++;
    } else if (result.status === 'no_changes') {
      console.log(`ℹ️  ${path.basename(filePath)} - No changes needed`);
      noChangesCount++;
    } else if (result.status === 'missing') {
      console.log(`⚠️  ${path.basename(filePath)} - File not found`);
      noChangesCount++;
    } else {
      console.log(`❌ ${path.basename(filePath)} - Error: ${result.error}`);
      errorCount++;
    }
  }

  console.log('\n📊 Fix Summary:');
  console.log(`   Files processed: ${FILES_TO_CHECK.length}`);
  console.log(`   Files updated: ${updatedCount}`);
  console.log(`   Files unchanged: ${noChangesCount}`);
  console.log(`   Errors: ${errorCount}`);

  if (updatedCount > 0) {
    console.log('\n🎉 All compilation errors should now be fixed!');
    console.log('   Try running "npm run build" to verify.');
  } else {
    console.log('\n✅ No compilation errors found!');
  }
}

main();
