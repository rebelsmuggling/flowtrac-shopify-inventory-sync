# Timeout Fixes for Vercel Sync Sessions

## Problem Summary

The main sync process was experiencing timeout errors on Vercel due to:

1. **Vercel's 300-second timeout limit** for serverless functions
2. **Complex session processing** involving multiple API calls to Shopify, Amazon, and ShipStation
3. **Auto-continuation mechanism** triggering too many sessions at once
4. **No recovery mechanism** for stuck or failed sessions

## Solutions Implemented

### 1. Reduced Batch Sizes and Timeouts

- **Batch Size**: Reduced from 60 to 30 SKUs per session
- **Auto-continuation**: Limited to 2 sessions per auto-run (down from 3)
- **Total Time Limit**: Reduced to 3 minutes (180s) with 120s buffer for Vercel's 300s limit
- **Platform Timeouts**:
  - Shopify: 60s (down from 90s)
  - Amazon: 45s (down from 60s)
  - ShipStation: 45s (down from 60s)

### 2. Enhanced Session Recovery

Created new API endpoint `/api/sync-session-recovery` with three actions:

- **`recover`**: Detects and recovers stuck sessions (no updates for 5+ minutes)
- **`reset`**: Resets failed sessions to allow continuation
- **`status`**: Provides detailed session health information

### 3. Improved Auto-Continue Script

Enhanced `scripts/auto-continue-sessions.js` with:

- **Configurable retries**: `--max-retries=5`
- **Configurable delays**: `--retry-delay=10000`
- **Request timeouts**: 30s timeout per request
- **Consecutive failure handling**: Increased delays after multiple failures
- **Better error reporting**: More detailed error messages

### 4. Session Monitoring Script

New `scripts/monitor-sessions.js` for:

- **Health monitoring**: Check session status and health
- **Automatic recovery**: Recover stuck sessions automatically
- **Failed session reset**: Reset failed sessions for continuation
- **Cron job ready**: Can be run as a scheduled task

### 5. Vercel Configuration Updates

Updated `vercel.json` with:

- **Function timeouts**: Explicit 300s timeout for sync functions
- **Recovery endpoint**: 60s timeout for recovery operations
- **Cron job**: Maintained 30-minute schedule

## Usage Instructions

### Manual Session Management

1. **Check session status**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync-session-recovery \
     -H "Content-Type: application/json" \
     -d '{"action": "status"}'
   ```

2. **Recover stuck sessions**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync-session-recovery \
     -H "Content-Type: application/json" \
     -d '{"action": "recover"}'
   ```

3. **Reset failed sessions**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync-session-recovery \
     -H "Content-Type: application/json" \
     -d '{"action": "reset"}'
   ```

### Automated Monitoring

1. **Run session monitor**:
   ```bash
   node scripts/monitor-sessions.js
   ```

2. **Run auto-continue with custom settings**:
   ```bash
   node scripts/auto-continue-sessions.js --max-retries=5 --retry-delay=10000
   ```

3. **Set up cron job for monitoring** (every 5 minutes):
   ```bash
   */5 * * * * cd /path/to/project && node scripts/monitor-sessions.js
   ```

### Production Deployment

1. **Deploy to Vercel** with updated configuration
2. **Set up monitoring cron job** on your server or external service
3. **Monitor logs** for timeout and recovery events
4. **Adjust batch sizes** if needed based on performance

## Monitoring and Alerts

### Key Metrics to Watch

- **Session completion time**: Should be under 3 minutes
- **Recovery frequency**: High frequency indicates underlying issues
- **Platform API response times**: Monitor Shopify/Amazon/ShipStation performance
- **Error rates**: Track failed sessions and recovery attempts

### Log Analysis

Look for these log patterns:

- `"Session appears to be stuck"` - Indicates timeout issues
- `"Successfully recovered stuck session"` - Recovery working
- `"Auto-continuation completed successfully"` - Sessions processing correctly
- `"Platform sync timeout"` - External API issues

### Recommended Alerts

1. **Session stuck for >10 minutes**: Immediate attention needed
2. **High recovery frequency**: Investigate underlying causes
3. **Platform API failures**: Check external service status
4. **Auto-continuation failures**: Review session logic

## Troubleshooting

### Common Issues

1. **Sessions still timing out**:
   - Reduce batch size further (try 20 SKUs)
   - Increase delays between sessions
   - Check external API performance

2. **Recovery not working**:
   - Verify database connectivity
   - Check session recovery endpoint logs
   - Ensure proper environment variables

3. **Auto-continuation failing**:
   - Check network connectivity to Vercel
   - Verify base URL configuration
   - Review retry settings

### Performance Optimization

1. **Database queries**: Ensure efficient inventory fetching
2. **External APIs**: Monitor Shopify/Amazon/ShipStation performance
3. **Network latency**: Consider regional deployment
4. **Batch processing**: Optimize SKU grouping

## Future Improvements

1. **Progressive timeout**: Start with small batches, increase if successful
2. **Platform-specific batching**: Different batch sizes per platform
3. **Real-time monitoring**: WebSocket-based session status updates
4. **Predictive recovery**: AI-based timeout prediction and prevention
5. **Distributed processing**: Multiple Vercel functions for parallel processing

## Configuration Reference

### Environment Variables

```env
# Session configuration
BATCH_SIZE=30
MAX_SESSIONS_PER_AUTO_RUN=2
MAX_TOTAL_TIME_MS=180000
SHOPIFY_TIMEOUT_MS=60000
AMAZON_TIMEOUT_MS=45000
SHIPSTATION_TIMEOUT_MS=45000

# Recovery configuration
STUCK_THRESHOLD_MS=300000  # 5 minutes
RECOVERY_TIMEOUT_MS=15000  # 15 seconds
```

### Script Configuration

```bash
# Auto-continue with custom settings
node scripts/auto-continue-sessions.js \
  --max-retries=5 \
  --retry-delay=10000 \
  --base-url=https://your-app.vercel.app

# Monitor with custom timeout
node scripts/monitor-sessions.js \
  --base-url=https://your-app.vercel.app
```

This comprehensive timeout management system should resolve the Vercel timeout issues while providing robust recovery mechanisms for any future problems.
