const fs = require('fs');
const path = require('path');

// List of files that still need updating
const FILES_TO_UPDATE = [
  {
    file: 'src/app/api/flowtrac-batch-processor/route.ts',
    description: 'Flowtrac batch processor API route'
  },
  {
    file: 'src/app/api/test-small-batch/route.ts',
    description: 'Test small batch API route'
  },
  {
    file: 'src/app/api/test-specific-sku/route.ts',
    description: 'Test specific SKU API route'
  },
  {
    file: 'src/app/api/test-small-sample/route.ts',
    description: 'Test small sample API route'
  },
  {
    file: 'src/app/api/populate-product-ids/route.ts',
    description: 'Populate product IDs API route'
  },
  {
    file: 'src/app/api/test-batch-performance/route.ts',
    description: 'Test batch performance API route'
  },
  {
    file: 'src/app/api/diagnose-flowtrac/route.ts',
    description: 'Diagnose Flowtrac API route'
  },
  {
    file: 'src/app/api/test-mapping-product-ids/route.ts',
    description: 'Test mapping product IDs API route'
  },
  {
    file: 'src/app/api/sync-session/route.ts',
    description: 'Sync session API route'
  },
  {
    file: 'src/app/api/update-mapping/route.ts',
    description: 'Update mapping API route'
  },
  {
    file: 'src/app/api/persist-mapping/route.ts',
    description: 'Persist mapping API route'
  }
];

// Update patterns
const UPDATE_PATTERNS = [
  {
    name: 'Import mappingService',
    pattern: /import\s+.*getImportedMapping.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*/g,
    replacement: "import { mappingService } from '../../../services/mapping';\n"
  },
  {
    name: 'Replace getImportedMapping usage',
    pattern: /const\s+importedMapping\s*=\s*getImportedMapping\(\);\s*if\s*\(importedMapping\)\s*{\s*console\.log\('Using imported mapping data'\);\s*mapping\s*=\s*importedMapping;\s*}\s*else\s*{\s*const\s+mappingPath\s*=\s*path\.join\(process\.cwd\(\),\s*['"]mapping\.json['"]\);\s*console\.log\('Using file mapping data'\);\s*mapping\s*=\s*JSON\.parse\(fs\.readFileSync\(mappingPath,\s*['"]utf-8['"]\)\);\s*}/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Replace simple getImportedMapping',
    pattern: /const\s+mapping\s*=\s*getImportedMapping\(\);/g,
    replacement: "const { mapping, source } = await mappingService.getMapping();\n    console.log(`Using ${source} mapping data`);"
  },
  {
    name: 'Replace setImportedMapping with mappingService.updateMapping',
    pattern: /setImportedMapping\(mapping\);/g,
    replacement: "await mappingService.updateMapping(mapping, 'api_update');"
  },
  {
    name: 'Remove fs and path imports',
    pattern: /import\s+.*fs.*from\s+['"]fs['"];?\s*/g,
    replacement: ""
  },
  {
    name: 'Remove path import',
    pattern: /import\s+.*path.*from\s+['"]path['"];?\s*/g,
    replacement: ""
  }
];

async function updateFile(filePath, description) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let updated = false;
    let changes = [];

    // Apply each update pattern
    for (const pattern of UPDATE_PATTERNS) {
      const newContent = content.replace(pattern.pattern, pattern.replacement);
      if (newContent !== content) {
        content = newContent;
        updated = true;
        changes.push(pattern.name);
      }
    }

    // Additional cleanup: remove empty import lines
    content = content.replace(/^\s*import\s+.*from\s+['"]\.\.\/\.\.\/utils\/imported-mapping-store['"];?\s*$/gm, '');

    if (updated) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated ${description}`);
      console.log(`   Changes: ${changes.join(', ')}`);
      return true;
    } else {
      console.log(`ℹ️  No changes needed for ${description}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Starting final mapping cleanup...\n');

  let updatedCount = 0;
  let totalFiles = FILES_TO_UPDATE.length;

  for (const fileInfo of FILES_TO_UPDATE) {
    const success = await updateFile(fileInfo.file, fileInfo.description);
    if (success) updatedCount++;
    console.log('');
  }

  console.log('📊 Cleanup Summary:');
  console.log(`   Files processed: ${totalFiles}`);
  console.log(`   Files updated: ${updatedCount}`);
  console.log(`   Files unchanged: ${totalFiles - updatedCount}`);

  if (updatedCount > 0) {
    console.log('\n🎉 Final mapping cleanup completed!');
    console.log('   All remaining files now use the mapping service.');
  } else {
    console.log('\n✅ All files are already using the mapping service!');
  }
}

main().catch(console.error);
