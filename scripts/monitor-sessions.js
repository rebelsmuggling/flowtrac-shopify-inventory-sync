#!/usr/bin/env node

/**
 * Session Monitor Script
 * 
 * This script monitors sync sessions and automatically recovers stuck ones.
 * It can be run as a cron job to ensure sessions don't get permanently stuck.
 * 
 * Usage:
 *   node scripts/monitor-sessions.js
 *   node scripts/monitor-sessions.js --base-url=https://your-app.vercel.app
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

console.log(`Session monitor starting...`);
console.log(`Base URL: ${BASE_URL}`);

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

async function checkSessionStatus() {
  try {
    const response = await makeRequest(`${BASE_URL}/api/sync-session-recovery`, {
      method: 'POST',
      body: JSON.stringify({ action: 'status' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error checking session status:', error.message);
    throw error;
  }
}

async function recoverStuckSessions() {
  try {
    const response = await makeRequest(`${BASE_URL}/api/sync-session-recovery`, {
      method: 'POST',
      body: JSON.stringify({ action: 'recover' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error recovering stuck sessions:', error.message);
    throw error;
  }
}

async function resetFailedSessions() {
  try {
    const response = await makeRequest(`${BASE_URL}/api/sync-session-recovery`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reset' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error resetting failed sessions:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('Checking session status...');
    const statusData = await checkSessionStatus();
    
    if (!statusData.success) {
      throw new Error(`Status check failed: ${statusData.error}`);
    }
    
    if (!statusData.has_session) {
      console.log('✅ No active sessions found. All good!');
      return;
    }
    
    const session = statusData.session;
    console.log(`📊 Session Status:`);
    console.log(`   ID: ${session.session_id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Progress: ${session.current_batch}/${session.total_batches} batches`);
    console.log(`   SKUs: ${session.processed_skus}/${session.total_skus}`);
    console.log(`   Time since update: ${Math.round(statusData.time_since_update_ms / 1000)}s`);
    console.log(`   Is stuck: ${statusData.is_stuck ? 'Yes' : 'No'}`);
    console.log(`   Can recover: ${statusData.can_recover ? 'Yes' : 'No'}`);
    
    if (statusData.is_stuck) {
      console.log('🔄 Session appears to be stuck. Attempting recovery...');
      
      const recoveryData = await recoverStuckSessions();
      
      if (recoveryData.success && recoveryData.recovered) {
        console.log('✅ Successfully recovered stuck session!');
        console.log(`   Recovery time: ${Math.round(recoveryData.time_since_update_ms / 1000)}s`);
      } else {
        console.log('⚠️  Session recovery failed or not needed');
      }
    }
    
    if (session.status === 'failed') {
      console.log('🔄 Session has failed. Attempting reset...');
      
      const resetData = await resetFailedSessions();
      
      if (resetData.success && resetData.reset) {
        console.log('✅ Successfully reset failed session!');
      } else {
        console.log('⚠️  Session reset failed or not needed');
      }
    }
    
    if (session.status === 'completed') {
      console.log('✅ Session completed successfully!');
    } else if (session.status === 'in_progress' && !statusData.is_stuck) {
      console.log('🔄 Session is in progress and healthy');
    }
    
  } catch (error) {
    console.error('❌ Monitor failed:', error.message);
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
  checkSessionStatus,
  recoverStuckSessions,
  resetFailedSessions
};
