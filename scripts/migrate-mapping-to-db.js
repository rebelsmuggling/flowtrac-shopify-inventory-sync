const fs = require('fs');
const path = require('path');

async function migrateMappingToDatabase() {
  try {
    console.log('Starting migration of mapping.json to database...');
    
    // Read the mapping.json file
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    if (!fs.existsSync(mappingPath)) {
      console.error('mapping.json not found in current directory');
      process.exit(1);
    }
    
    const mappingContent = fs.readFileSync(mappingPath, 'utf-8');
    const mapping = JSON.parse(mappingContent);
    
    console.log(`Found ${mapping.products?.length || 0} products in mapping.json`);
    
    // Call the database migration API
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/mapping-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mapping,
        updatedBy: 'migration_script'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to migrate mapping to database:', response.status, errorText);
      process.exit(1);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Successfully migrated mapping to database!');
      console.log(`   Version: ${result.version}`);
      console.log(`   Product count: ${result.productCount}`);
      console.log(`   Updated at: ${result.updatedAt}`);
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
migrateMappingToDatabase();
