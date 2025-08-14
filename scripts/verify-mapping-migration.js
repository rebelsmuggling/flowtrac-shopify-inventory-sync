const fs = require('fs');
const path = require('path');

// Files that should use mapping service
const API_FILES = [
  'src/app/api/mapping/route.ts',
  'src/app/api/mapping-db/route.ts',
  'src/app/api/sync/route.ts',
  'src/app/api/export-inventory-csv/route.ts',
  'src/app/api/export-missing-shipstation-products/route.ts',
  'src/app/api/bulk-add/route.ts',
  'src/app/api/import-csv/route.ts',
  'src/app/api/export-csv/route.ts',
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
  'src/app/api/validate-skus/route.ts',
  'src/app/api/test-specific-sku/route.ts',
  'src/app/api/persist-mapping/route.ts'
];

// Service files that should use mapping service
const SERVICE_FILES = [
  'services/flowtrac.ts',
  'services/shopify.ts',
  'src/services/mapping.ts'
];

// Utility files that should use mapping service
const UTILITY_FILES = [
  'src/utils/enrich-mapping-with-product-ids.ts'
];

function checkFile(filePath, description) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return { status: 'missing', issues: ['File not found'] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const issues = [];

    // Check for old mapping imports
    if (content.includes('getImportedMapping')) {
      issues.push('Still uses getImportedMapping');
    }

    if (content.includes('setImportedMapping')) {
      issues.push('Still uses setImportedMapping');
    }

    if (content.includes('imported-mapping-store')) {
      issues.push('Still imports from imported-mapping-store');
    }

    // Check for direct file system access to mapping.json
    if (content.includes('mapping.json') && content.includes('fs.readFileSync')) {
      issues.push('Still reads mapping.json directly');
    }

    // Check for mapping service usage
    const usesMappingService = content.includes('mappingService') || content.includes('MappingService');
    
    if (issues.length > 0) {
      return { status: 'needs_update', issues, usesMappingService };
    } else if (usesMappingService) {
      return { status: 'updated', issues: [] };
    } else {
      return { status: 'no_mapping', issues: ['No mapping usage detected'] };
    }

  } catch (error) {
    return { status: 'error', issues: [error.message] };
  }
}

function main() {
  console.log('🔍 Verifying mapping migration status...\n');

  const allFiles = [...API_FILES, ...SERVICE_FILES, ...UTILITY_FILES];
  let updatedCount = 0;
  let needsUpdateCount = 0;
  let noMappingCount = 0;
  let errorCount = 0;

  console.log('📁 API Routes:');
  for (const file of API_FILES) {
    const result = checkFile(file, 'API Route');
    const status = result.status;
    
    if (status === 'updated') {
      console.log(`  ✅ ${path.basename(file)}`);
      updatedCount++;
    } else if (status === 'needs_update') {
      console.log(`  ❌ ${path.basename(file)} - ${result.issues.join(', ')}`);
      needsUpdateCount++;
    } else if (status === 'no_mapping') {
      console.log(`  ℹ️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      noMappingCount++;
    } else {
      console.log(`  ⚠️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      errorCount++;
    }
  }

  console.log('\n🔧 Services:');
  for (const file of SERVICE_FILES) {
    const result = checkFile(file, 'Service');
    const status = result.status;
    
    if (status === 'updated') {
      console.log(`  ✅ ${path.basename(file)}`);
      updatedCount++;
    } else if (status === 'needs_update') {
      console.log(`  ❌ ${path.basename(file)} - ${result.issues.join(', ')}`);
      needsUpdateCount++;
    } else if (status === 'no_mapping') {
      console.log(`  ℹ️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      noMappingCount++;
    } else {
      console.log(`  ⚠️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      errorCount++;
    }
  }

  console.log('\n🛠️  Utilities:');
  for (const file of UTILITY_FILES) {
    const result = checkFile(file, 'Utility');
    const status = result.status;
    
    if (status === 'updated') {
      console.log(`  ✅ ${path.basename(file)}`);
      updatedCount++;
    } else if (status === 'needs_update') {
      console.log(`  ❌ ${path.basename(file)} - ${result.issues.join(', ')}`);
      needsUpdateCount++;
    } else if (status === 'no_mapping') {
      console.log(`  ℹ️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      noMappingCount++;
    } else {
      console.log(`  ⚠️  ${path.basename(file)} - ${result.issues.join(', ')}`);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Status Summary:');
  console.log(`   Total files checked: ${allFiles.length}`);
  console.log(`   ✅ Updated to use mapping service: ${updatedCount}`);
  console.log(`   ❌ Still need updating: ${needsUpdateCount}`);
  console.log(`   ℹ️  No mapping usage: ${noMappingCount}`);
  console.log(`   ⚠️  Errors: ${errorCount}`);

  if (needsUpdateCount > 0) {
    console.log('\n❌ Migration incomplete! Some files still need updating.');
    return 1;
  } else {
    console.log('\n🎉 Migration verification complete! All files are using the mapping service.');
    return 0;
  }
}

const exitCode = main();
process.exit(exitCode);
