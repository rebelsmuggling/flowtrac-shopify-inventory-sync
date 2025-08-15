#!/usr/bin/env node

/**
 * Amazon Feed Troubleshooter
 * 
 * Comprehensive testing and troubleshooting for Amazon JSON feed submissions.
 * This script helps diagnose issues with Amazon SP-API feed submissions.
 * 
 * Usage:
 *   node scripts/amazon-feed-troubleshooter.js
 *   node scripts/amazon-feed-troubleshooter.js --test-single
 *   node scripts/amazon-feed-troubleshooter.js --test-bulk
 *   node scripts/amazon-feed-troubleshooter.js --diagnose
 */

require('dotenv').config({ path: '.env.local' });

const { updateAmazonInventory, updateAmazonInventoryBulk } = require('../services/amazon.ts');

// Test configurations
const TEST_SKUS = {
  single: { sku: 'TEST-SKU-001', quantity: 10 },
  bulk: [
    { sku: 'TEST-SKU-002', quantity: 15 },
    { sku: 'TEST-SKU-003', quantity: 20 },
    { sku: 'TEST-SKU-004', quantity: 25 },
    { sku: 'TEST-SKU-005', quantity: 30 }
  ]
};

async function checkEnvironmentVariables() {
  console.log('🔧 Checking Amazon SP-API Environment Variables...\n');
  
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

  const results = {};
  const missingVars = [];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(varName);
      results[varName] = { status: 'MISSING', value: null };
    } else {
      const maskedValue = varName.includes('SECRET') || varName.includes('TOKEN') || varName.includes('KEY') 
        ? `${value.substring(0, 4)}***${value.substring(value.length - 4)}`
        : value;
      results[varName] = { status: 'SET', value: maskedValue };
    }
  }

  // Display results
  for (const [varName, result] of Object.entries(results)) {
    const status = result.status === 'SET' ? '✅' : '❌';
    console.log(`${status} ${varName}: ${result.status === 'SET' ? result.value : 'NOT SET'}`);
  }

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing ${missingVars.length} environment variables:`);
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\nPlease add these to your .env.local file');
    return false;
  }

  console.log('\n✅ All required environment variables are set!');
  return true;
}

async function testAmazonConnection() {
  console.log('\n🔌 Testing Amazon SP-API Connection...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

    // Test AWS credentials
    console.log('Testing AWS credentials...');
    const sts = new STSClient({
      credentials: {
        accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
      },
      region: 'us-east-1',
    });
    
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log(`✅ AWS Account ID: ${identity.Account}`);

    // Test Selling Partner API connection
    console.log('\nTesting Selling Partner API connection...');
    const sellingPartner = new SellingPartner({
      region: 'na',
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID!,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET!,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN!,
      }
    });

    // Test getMarketplaceParticipations
    const params = {
      operation: 'getMarketplaceParticipations',
      endpoint: 'sellers'
    };
    
    console.log('Calling getMarketplaceParticipations...');
    const response = await sellingPartner.callAPI(params);
    console.log('✅ SP-API Connection successful!');
    console.log(`   Marketplaces: ${response.payload?.length || 0} found`);
    
    return { success: true, sellingPartner };
  } catch (error) {
    console.error('❌ Amazon SP-API connection failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function testSingleSkuUpdate() {
  console.log('\n📦 Testing Single SKU Update...\n');
  
  const { sku, quantity } = TEST_SKUS.single;
  console.log(`Updating SKU: ${sku} to quantity: ${quantity}`);
  
  const startTime = Date.now();
  
  try {
    const result = await updateAmazonInventory(sku, quantity);
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('Result:', result);
    
    if (result.success) {
      console.log(`✅ Success! Feed ID: ${result.feedId}, Method: ${result.method}`);
      return { success: true, result, duration };
    } else {
      console.log(`❌ Failed: ${result.error}`);
      return { success: false, error: result.error, duration };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Exception after ${duration}ms:`, error.message);
    return { success: false, error: error.message, duration };
  }
}

async function testBulkSkuUpdate() {
  console.log('\n📦 Testing Bulk SKU Update...\n');
  
  const updates = TEST_SKUS.bulk;
  console.log(`Updating ${updates.length} SKUs in bulk:`);
  updates.forEach(update => console.log(`   - ${update.sku}: ${update.quantity}`));
  
  const startTime = Date.now();
  
  try {
    const result = await updateAmazonInventoryBulk(updates);
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('Result:', result);
    
    if (result.success) {
      console.log(`✅ Success! Feed ID: ${result.feedId}, Method: ${result.method}, SKUs: ${result.skusProcessed}`);
      return { success: true, result, duration };
    } else {
      console.log(`❌ Failed: ${result.error}`);
      if (result.results) {
        console.log('Individual results:');
        result.results.forEach(r => {
          const status = r.success ? '✅' : '❌';
          console.log(`   ${status} ${r.sku}: ${r.success ? 'Success' : r.error}`);
        });
      }
      return { success: false, error: result.error, results: result.results, duration };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Exception after ${duration}ms:`, error.message);
    return { success: false, error: error.message, duration };
  }
}

async function testFeedDocumentCreation() {
  console.log('\n📄 Testing Feed Document Creation...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
    const sellingPartner = new SellingPartner({
      region: 'na',
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID!,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET!,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN!,
      }
    });

    // Test JSON feed document creation
    console.log('Creating JSON feed document...');
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });
    
    console.log('✅ JSON feed document created successfully!');
    console.log(`   Document ID: ${createDocRes.feedDocumentId}`);
    console.log(`   Upload URL: ${createDocRes.url.substring(0, 50)}...`);
    
    return { success: true, documentId: createDocRes.feedDocumentId, url: createDocRes.url };
  } catch (error) {
    console.error('❌ Feed document creation failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function runDiagnostics() {
  console.log('🔍 Running Amazon Feed Diagnostics...\n');
  
  const results = {
    environment: await checkEnvironmentVariables(),
    connection: await testAmazonConnection(),
    feedDocument: await testFeedDocumentCreation(),
    singleSku: await testSingleSkuUpdate(),
    bulkSku: await testBulkSkuUpdate()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  
  const tests = [
    { name: 'Environment Variables', result: results.environment },
    { name: 'SP-API Connection', result: results.connection.success },
    { name: 'Feed Document Creation', result: results.feedDocument.success },
    { name: 'Single SKU Update', result: results.singleSku.success },
    { name: 'Bulk SKU Update', result: results.bulkSku.success }
  ];
  
  let passedTests = 0;
  tests.forEach(test => {
    const status = test.result ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test.name}`);
    if (test.result) passedTests++;
  });
  
  console.log(`\n🎯 Overall: ${passedTests}/${tests.length} tests passed`);
  
  if (passedTests === tests.length) {
    console.log('🎉 All tests passed! Amazon JSON feed is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🧪 Amazon Feed Troubleshooter');
  console.log('='.repeat(40));
  
  if (args.includes('--test-single')) {
    await checkEnvironmentVariables();
    await testSingleSkuUpdate();
  } else if (args.includes('--test-bulk')) {
    await checkEnvironmentVariables();
    await testBulkSkuUpdate();
  } else if (args.includes('--diagnose')) {
    await runDiagnostics();
  } else {
    // Run full diagnostics by default
    await runDiagnostics();
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  checkEnvironmentVariables,
  testAmazonConnection,
  testSingleSkuUpdate,
  testBulkSkuUpdate,
  testFeedDocumentCreation,
  runDiagnostics
};
