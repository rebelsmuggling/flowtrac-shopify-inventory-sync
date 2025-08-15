# Vercel Log Monitoring Guide

## Quick Access to Vercel Logs

### Method 1: Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project**: `flowtrac-shopify-inventory-sync`
3. **Click "Functions" tab**
4. **Look for recent function calls** to:
   - `/api/sync` (main sync trigger)
   - `/api/sync-session` (session management)
   - `/api/sync-session-recovery` (recovery operations)
5. **Click on any function call** to see detailed logs

### Method 2: Vercel CLI (Real-time)

If you have Vercel CLI installed:

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Follow logs in real-time
vercel logs --follow

# Or get recent logs
vercel logs
```

### Method 3: Using Our Monitoring Script

```bash
# Trigger sync and monitor progress
node scripts/monitor-sync-logs.js --trigger-sync

# Check current status
node scripts/monitor-sync-logs.js --check-status
```

## What to Look For in Logs

### Successful Sync Indicators

```
✅ Session-based sync completed successfully with auto-continuation.
✅ Auto-continuation completed successfully!
✅ All sessions completed successfully!
```

### Timeout/Error Indicators

```
❌ Session appears to be stuck
❌ Platform sync timeout
❌ Auto-continuation timeout
❌ Session failed and cannot be continued
```

### Progress Indicators

```
🔄 Processing session 1 of 5
🔄 Auto-continuing to session 2 of 5
📊 Session 1 completed: 30 successful, 0 failed
```

## Key Log Patterns

### Session Management
- `"Processing session X of Y"` - Session processing started
- `"Session X completed"` - Session completed successfully
- `"Auto-continuing to session X"` - Auto-continuation working

### Platform Sync
- `"Starting bulk Shopify update"` - Shopify sync started
- `"Starting bulk Amazon update"` - Amazon sync started
- `"ShipStation sync completed"` - ShipStation sync completed

### Recovery Operations
- `"Session appears to be stuck"` - Recovery detection
- `"Successfully recovered stuck session"` - Recovery successful
- `"Failed session reset successfully"` - Reset successful

### Timeout Management
- `"Approaching timeout limit"` - Timeout protection working
- `"Timeout safe: Yes"` - Session completed within limits
- `"Platform sync timeout"` - External API timeout

## Monitoring Best Practices

### 1. Real-time Monitoring
```bash
# Use Vercel CLI for real-time logs
vercel logs --follow

# Or use our script for progress updates
node scripts/monitor-sync-logs.js --trigger-sync
```

### 2. Check Session Health
```bash
# Check if sessions are stuck
curl -X POST https://your-app.vercel.app/api/sync-session-recovery \
  -H "Content-Type: application/json" \
  -d '{"action": "status"}'
```

### 3. Monitor Recovery Operations
```bash
# Run session monitor
node scripts/monitor-sessions.js
```

## Troubleshooting Common Issues

### Issue: "Function timeout"
**Solution**: Check if batch sizes are too large or external APIs are slow

### Issue: "Session stuck"
**Solution**: Use recovery endpoint to reset the session

### Issue: "Auto-continuation failed"
**Solution**: Check network connectivity and retry settings

### Issue: "Platform sync timeout"
**Solution**: Monitor external API performance (Shopify/Amazon/ShipStation)

## Log Analysis Commands

### Extract Error Patterns
```bash
# Look for timeout errors
grep -i "timeout" vercel-logs.txt

# Look for stuck sessions
grep -i "stuck" vercel-logs.txt

# Look for successful completions
grep -i "completed successfully" vercel-logs.txt
```

### Monitor Specific Endpoints
```bash
# Monitor sync endpoint
grep "/api/sync" vercel-logs.txt

# Monitor session endpoint
grep "/api/sync-session" vercel-logs.txt

# Monitor recovery endpoint
grep "/api/sync-session-recovery" vercel-logs.txt
```

## Performance Metrics

### Expected Log Patterns for Healthy Sync

1. **Session Start**: `"Processing session 1 of X"`
2. **Database Query**: `"Fetched inventory from database"`
3. **Platform Sync**: `"Starting bulk [Platform] update"`
4. **Session Complete**: `"Session X completed: Y successful, Z failed"`
5. **Auto-continuation**: `"Auto-continuing to session X"`
6. **Final Success**: `"All sessions completed successfully!"`

### Timeout Thresholds

- **Total Session Time**: Should be under 3 minutes
- **Platform API Calls**: Should be under 60 seconds each
- **Auto-continuation**: Should complete within 15 seconds
- **Recovery Operations**: Should complete within 15 seconds

## Alert Setup

### Recommended Alerts

1. **Session stuck for >5 minutes**: Immediate attention needed
2. **High timeout frequency**: Investigate batch sizes or external APIs
3. **Recovery operations >3 times per hour**: Check for underlying issues
4. **Platform API failures**: Monitor external service status

### Monitoring Frequency

- **During sync**: Every 15 seconds (use monitoring script)
- **Post-sync**: Check logs for any errors or warnings
- **Daily**: Review overall sync success rates
- **Weekly**: Analyze performance trends and optimize settings
