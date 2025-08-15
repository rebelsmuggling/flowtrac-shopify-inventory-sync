#!/usr/bin/env node

/**
 * Test Amazon JSON Feed Functionality
 * 
 * This script tests the new Amazon JSON feed implementation to ensure
 * it works correctly with the JSON_LISTINGS_FEED format.
 * 
 * Usage:
 *   node scripts/test-amazon-json-feed.js
 */

require('dotenv').config({ path: '.env.local' });

const { updateAmazonInventory, updateAmazonInventoryBulk } = require('../services/amazon.ts');

async function testAmazonJsonFeed() {
  console.log('🧪 Testing Amazon JSON Feed Functionality...\n');

  // Test single SKU update
  console.log('📦 Testing single SKU update...');
  try {
    const testSku = 'TEST-SKU-001';
    const testQuantity = 10;
    
    console.log(`Updating SKU ${testSku} to quantity ${testQuantity}...`);
    const result = await updateAmazonInventory(testSku, testQuantity);
    
    console.log('✅ Single SKU update result:', result);
    
    if (result.success) {
      console.log(`✅ Success! Feed ID: ${result.feedId}, Method: ${result.method}`);
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Single SKU update failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test bulk SKU update
  console.log('📦 Testing bulk SKU update...');
  try {
    const testUpdates = [
      { sku: 'TEST-SKU-002', quantity: 15 },
      { sku: 'TEST-SKU-003', quantity: 20 },
      { sku: 'TEST-SKU-004', quantity: 25 }
    ];
    
    console.log(`Updating ${testUpdates.length} SKUs in bulk...`);
    const bulkResult = await updateAmazonInventoryBulk(testUpdates);
    
    console.log('✅ Bulk update result:', bulkResult);
    
    if (bulkResult.success) {
      console.log(`✅ Success! Feed ID: ${bulkResult.feedId}, Method: ${bulkResult.method}, SKUs Processed: ${bulkResult.skusProcessed}`);
    } else {
      console.log(`❌ Failed: ${bulkResult.error}`);
      if (bulkResult.results) {
        console.log('Individual results:', bulkResult.results);
      }
    }
  } catch (error) {
    console.error('❌ Bulk update failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test environment variables
  console.log('🔧 Checking required environment variables...');
  const requiredVars = [
    'AMAZON_SELLER_ID',
    'AMAZON_MARKETPLACE_ID',
    'AMAZON_REFRESH_TOKEN',
    'AMAZON_CLIENT_ID',
    'AMAZON_CLIENT_SECRET',
    'AMAZON_AWS_ACCESS_KEY_ID',
    'AMAZON_AWS_SECRET_ACCESS_KEY',
    'AMAZON_ROLE_ARN'
  ];

  const missingVars = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    } else {
      console.log(`✅ ${varName}: ${varName.includes('SECRET') || varName.includes('TOKEN') || varName.includes('KEY') ? '***' : process.env[varName]}`);
    }
  }

  if (missingVars.length > 0) {
    console.log('\n❌ Missing environment variables:');
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\nPlease add these to your .env.local file');
  } else {
    console.log('\n✅ All required environment variables are set!');
  }

  console.log('\n🎯 Test completed!');
}

// Run the test
if (require.main === module) {
  testAmazonJsonFeed().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testAmazonJsonFeed };
