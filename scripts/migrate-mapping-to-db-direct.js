const fs = require('fs');
const path = require('path');

// Import the database functions directly
const { updateMapping } = require('../src/lib/database.ts');

async function migrateMappingToDatabaseDirect() {
  try {
    console.log('Starting direct migration of mapping.json to database...');
    
    // Read the mapping.json file
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    if (!fs.existsSync(mappingPath)) {
      console.error('mapping.json not found in current directory');
      process.exit(1);
    }
    
    const mappingContent = fs.readFileSync(mappingPath, 'utf-8');
    const mapping = JSON.parse(mappingContent);
    
    console.log(`Found ${mapping.products?.length || 0} products in mapping.json`);
    
    // Update the mapping in the database
    const result = await updateMapping(mapping, 'migration_script');
    
    if (result.success) {
      console.log('✅ Successfully migrated mapping to database!');
      console.log(`   Version: ${result.data?.version}`);
      console.log(`   Updated at: ${result.data?.last_updated}`);
    } else {
      console.error('❌ Migration failed:', result.error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
}

// Run the migration
migrateMappingToDatabaseDirect();
