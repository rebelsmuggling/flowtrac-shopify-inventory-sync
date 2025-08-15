#!/usr/bin/env node

/**
 * Sync Log Monitor Script
 * 
 * This script helps monitor sync logs and provides guidance on accessing Vercel logs.
 * 
 * Usage:
 *   node scripts/monitor-sync-logs.js
 *   node scripts/monitor-sync-logs.js --trigger-sync
 *   node scripts/monitor-sync-logs.js --check-status
 */

const https = require('https');
const http = require('http');

// Configuration
const DEFAULT_BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3000';

const BASE_URL = process.argv.includes('--base-url') 
  ? process.argv[process.argv.indexOf('--base-url') + 1] 
  : DEFAULT_BASE_URL;

const REQUEST_TIMEOUT = 15000; // 15 seconds timeout

console.log(`🔍 Sync Log Monitor Starting...`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`\n📋 How to access Vercel logs:`);
console.log(`1. Go to https://vercel.com/dashboard`);
console.log(`2. Select your project: flowtrac-shopify-inventory-sync`);
console.log(`3. Click on "Functions" tab`);
console.log(`4. Look for recent function calls to /api/sync or /api/sync-session`);
console.log(`5. Click on any function call to see detailed logs`);
console.log(`\n💡 Pro tip: Use 'vercel logs' command if you have Vercel CLI installed`);
console.log(`   vercel logs --follow`);

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 3000),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: REQUEST_TIMEOUT
    };
    
    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function triggerSync() {
  try {
    console.log('\n🚀 Triggering main sync...');
    const response = await makeRequest(`${BASE_URL}/api/sync`, {
      method: 'POST',
      body: JSON.stringify({ 
        useSessionMode: true,
        dryRun: false 
      })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    console.log('✅ Sync triggered successfully!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.useSessionMode) {
      console.log('\n🔄 Session mode enabled - check Vercel logs for session progress');
      console.log('💡 Look for logs from /api/sync-session endpoints');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to trigger sync:', error.message);
    throw error;
  }
}

async function checkSessionStatus() {
  try {
    console.log('\n📊 Checking session status...');
    const response = await makeRequest(`${BASE_URL}/api/sync-session?action=status`);
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    console.log('✅ Session status retrieved:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to check session status:', error.message);
    throw error;
  }
}

async function checkRecoveryStatus() {
  try {
    console.log('\n🔧 Checking recovery status...');
    const response = await makeRequest(`${BASE_URL}/api/sync-session-recovery`, {
      method: 'POST',
      body: JSON.stringify({ action: 'status' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    console.log('✅ Recovery status retrieved:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to check recovery status:', error.message);
    throw error;
  }
}

async function monitorProgress() {
  console.log('\n🔄 Starting progress monitoring...');
  console.log('Press Ctrl+C to stop monitoring');
  
  let iteration = 0;
  const maxIterations = 20; // Monitor for ~5 minutes (15s intervals)
  
  const interval = setInterval(async () => {
    iteration++;
    
    try {
      const sessionData = await checkSessionStatus();
      
      if (sessionData.session) {
        const session = sessionData.session;
        console.log(`\n📈 Progress Update #${iteration}:`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Progress: ${session.current_batch}/${session.total_batches} batches`);
        console.log(`   SKUs: ${session.processed_skus}/${session.total_skus}`);
        console.log(`   Last Updated: ${new Date(session.last_updated).toLocaleTimeString()}`);
        
        if (session.status === 'completed') {
          console.log('✅ Sync completed successfully!');
          clearInterval(interval);
          return;
        } else if (session.status === 'failed') {
          console.log('❌ Sync failed!');
          clearInterval(interval);
          return;
        }
      } else {
        console.log(`\n📈 Progress Update #${iteration}: No active session`);
      }
      
      if (iteration >= maxIterations) {
        console.log('\n⏰ Monitoring timeout reached. Check Vercel logs for final status.');
        clearInterval(interval);
      }
      
    } catch (error) {
      console.error(`❌ Error in progress update #${iteration}:`, error.message);
      
      if (iteration >= maxIterations) {
        clearInterval(interval);
      }
    }
  }, 15000); // Check every 15 seconds
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--trigger-sync')) {
      await triggerSync();
      console.log('\n🔄 Starting progress monitoring after sync trigger...');
      await monitorProgress();
    } else if (args.includes('--check-status')) {
      await checkSessionStatus();
      await checkRecoveryStatus();
    } else {
      console.log('\n📋 Available commands:');
      console.log('   node scripts/monitor-sync-logs.js --trigger-sync');
      console.log('   node scripts/monitor-sync-logs.js --check-status');
      console.log('\n📖 Manual Vercel Log Access:');
      console.log('1. Vercel Dashboard → Your Project → Functions → Recent Calls');
      console.log('2. Vercel CLI: vercel logs --follow');
      console.log('3. Look for these function calls:');
      console.log('   - /api/sync (main sync trigger)');
      console.log('   - /api/sync-session (session management)');
      console.log('   - /api/sync-session-recovery (recovery operations)');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
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
  triggerSync,
  checkSessionStatus,
  checkRecoveryStatus,
  monitorProgress
};
