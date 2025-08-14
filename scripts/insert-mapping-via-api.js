const fs = require('fs');
const path = require('path');

// Read the local mapping.json file
console.log('Reading mapping from:', mappingPath);

try {
  const mappingContent = fs.readFileSync(mappingPath, 'utf-8');
  const mapping = JSON.parse(mappingContent);
  
  console.log(`Found ${mapping.products?.length || 0} products in mapping.json`);
  
  // Create the API request body
  const requestBody = {
    mapping: mapping,
    updatedBy: 'migration-script'
  };
  
  console.log('✅ Mapping data prepared for API insertion');
  console.log('📋 Next steps:');
  console.log('1. First run the simple-mapping-insert.sql script to create the table structure');
  console.log('2. Then use this data to update via the API:');
  console.log('');
  console.log('API Endpoint: https://flowtrac-shopify-inventory-sync-efn6pw4w5.vercel.app/api/mapping-db');
  console.log('Method: POST');
  console.log('Content-Type: application/json');
  console.log('');
  console.log('Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');
  console.log('3. Or use curl:');
  console.log(`curl -X POST "https://flowtrac-shopify-inventory-sync-efn6pw4w5.vercel.app/api/mapping-db" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${JSON.stringify(requestBody)}'`);
  
} catch (error) {
  console.error('❌ Error reading mapping file:', error.message);
  process.exit(1);
}

