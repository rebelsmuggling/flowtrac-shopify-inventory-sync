#!/usr/bin/env node

/**
 * Auto-continue Sync Sessions Script
 * 
 * This script monitors sync sessions and automatically continues them
 * when they get stuck. It can be run manually or as a cron job.
 * 
 * Usage:
 *   node scripts/auto-continue-sessions.js
 *   node scripts/auto-continue-sessions.js --base-url=https://your-app.vercel.app
 *   node scripts/auto-continue-sessions.js --max-retries=5 --retry-delay=10000
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

const MAX_RETRIES = process.argv.includes('--max-retries')
  ? parseInt(process.argv[process.argv.indexOf('--max-retries') + 1])
  : 5;

const RETRY_DELAY = process.argv.includes('--retry-delay')
  ? parseInt(process.argv[process.argv.indexOf('--retry-delay') + 1])
  : 10000; // 10 seconds

const REQUEST_TIMEOUT = 30000; // 30 seconds timeout for individual requests

console.log(`Auto-continue sessions script starting...`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`Max retries: ${MAX_RETRIES}`);
console.log(`Retry delay: ${RETRY_DELAY}ms`);
console.log(`Request timeout: ${REQUEST_TIMEOUT}ms`);

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
      timeout: REQUEST_TIMEOUT // Add timeout to prevent hanging requests
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
    console.log('Checking session status...');
    const response = await makeRequest(`${BASE_URL}/api/sync-session?action=status`);
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error checking session status:', error.message);
    throw error;
  }
}

async function continueSession() {
  try {
    console.log('Continuing session...');
    const response = await makeRequest(`${BASE_URL}/api/sync-session`, {
      method: 'POST',
      body: JSON.stringify({ action: 'continue' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error continuing session:', error.message);
    throw error;
  }
}

async function autoContinueSession() {
  try {
    console.log('Starting auto-continuation...');
    const response = await makeRequest(`${BASE_URL}/api/sync-session`, {
      method: 'POST',
      body: JSON.stringify({ action: 'auto-continue' })
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error auto-continuing session:', error.message);
    throw error;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let retries = 0;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 3;
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`\n--- Attempt ${retries + 1}/${MAX_RETRIES} ---`);
      
      // Check current session status
      const statusData = await checkSessionStatus();
      
      if (!statusData.success) {
        throw new Error(`Status check failed: ${statusData.error}`);
      }
      
      const session = statusData.session;
      
      if (!session) {
        console.log('No active session found. Nothing to continue.');
        return;
      }
      
      console.log(`Session ID: ${session.session_id}`);
      console.log(`Status: ${session.status}`);
      console.log(`Current batch: ${session.current_batch}/${session.total_batches}`);
      console.log(`Progress: ${session.processed_skus}/${session.total_skus} SKUs`);
      
      if (session.status === 'completed') {
        console.log('Session is already completed. Nothing to do.');
        return;
      }
      
      if (session.status === 'failed') {
        console.log('Session has failed and cannot be continued.');
        return;
      }
      
      if (session.status === 'in_progress') {
        const hasMoreSessions = session.current_batch < session.total_batches;
        
        if (hasMoreSessions) {
          console.log(`Session is in progress with more batches to process. Starting auto-continuation...`);
          
          const autoContinueData = await autoContinueSession();
          
          if (autoContinueData.success) {
            console.log('Auto-continuation completed successfully!');
            console.log(`Sessions processed: ${autoContinueData.sessions_processed}`);
            console.log(`Total duration: ${autoContinueData.total_duration_ms}ms`);
            console.log(`Final status: ${autoContinueData.final_status}`);
            console.log(`Timeout safe: ${autoContinueData.timeout_safe ? 'Yes' : 'No'}`);
            
            if (autoContinueData.has_more_sessions) {
              console.log(`⚠️  ${autoContinueData.remaining_sessions} sessions remaining.`);
              console.log(`💡 Note: ${autoContinueData.note}`);
              
              // If there are more sessions, suggest running the script again
              console.log('\n🔄 To continue processing remaining sessions, run this script again:');
              console.log('   node scripts/auto-continue-sessions.js');
              
              // Or suggest using a cron job for automatic continuation
              console.log('\n⏰ For automatic continuation, consider setting up a cron job:');
              console.log('   */5 * * * * cd /path/to/project && node scripts/auto-continue-sessions.js');
            } else {
              console.log('✅ All sessions completed successfully!');
            }
            
            // Reset consecutive failures on success
            consecutiveFailures = 0;
            return;
          } else {
            throw new Error(`Auto-continuation failed: ${autoContinueData.error}`);
          }
        } else {
          console.log('Session is in progress but all batches are complete. This might be a state issue.');
          
          // Try to continue anyway to see if it resolves the state
          const continueData = await continueSession();
          console.log('Manual continue result:', continueData);
          return;
        }
      }
      
      // Reset consecutive failures on success
      consecutiveFailures = 0;
      break; // Success, exit retry loop
      
    } catch (error) {
      retries++;
      consecutiveFailures++;
      console.error(`Attempt ${retries}/${MAX_RETRIES} failed:`, error.message);
      
      // If we have too many consecutive failures, increase the delay
      const currentDelay = consecutiveFailures >= maxConsecutiveFailures ? RETRY_DELAY * 2 : RETRY_DELAY;
      
      if (retries < MAX_RETRIES) {
        console.log(`Retrying in ${currentDelay/1000} seconds... (consecutive failures: ${consecutiveFailures})`);
        await sleep(currentDelay);
      } else {
        console.error('Max retries reached. Giving up.');
        console.error('Last error:', error.message);
        process.exit(1);
      }
    }
  }
  
  console.log('Script completed successfully.');
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
  continueSession,
  autoContinueSession
};
