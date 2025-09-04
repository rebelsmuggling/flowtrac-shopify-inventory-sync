'use client';

import Image from "next/image";
import styles from "./page.module.css";
import { useState, useEffect } from "react";

export default function Home() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [syncSession, setSyncSession] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [batchProcessorSession, setBatchProcessorSession] = useState<any>(null);
  const [batchProcessorStatus, setBatchProcessorStatus] = useState<string | null>(null);
  const [databaseStats, setDatabaseStats] = useState<any>(null);
  const [batchProcessorLoading, setBatchProcessorLoading] = useState<boolean>(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [bulkData, setBulkData] = useState('');
  const [showImportTools, setShowImportTools] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingToSheets, setExportingToSheets] = useState(false);
  const [importingFromSheets, setImportingFromSheets] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [sheetsResult, setSheetsResult] = useState<string | null>(null);
  const [importedMapping, setImportedMapping] = useState<any>(null);
  const [mappingData, setMappingData] = useState<any>(null);
  const [loadingMapping, setLoadingMapping] = useState(false);
  const [mappingStatus, setMappingStatus] = useState<any>(null);
  const [githubTestResult, setGithubTestResult] = useState<any>(null);
  const [syncingToGitHub, setSyncingToGitHub] = useState(false);
  const [exportingInventory, setExportingInventory] = useState(false);
  const [fetchingDescriptions, setFetchingDescriptions] = useState(false);
  const [descriptionsResult, setDescriptionsResult] = useState<any>(null);
  const [missingSkusInfo, setMissingSkusInfo] = useState<any>(null);
  
  // Separate sync states
  const [shopifySyncing, setShopifySyncing] = useState(false);
  const [amazonSyncing, setAmazonSyncing] = useState(false);
  const [shipstationSyncing, setShipstationSyncing] = useState(false);
  const [shopifyResult, setShopifyResult] = useState<any>(null);
  const [amazonResult, setAmazonResult] = useState<any>(null);
  const [shipstationResult, setShipstationResult] = useState<any>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setDetails(null);
    setSyncSession(null);
    setSessionStatus(null);
    
    try {
      const res = await fetch("/api/sync", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSessionMode: true })
      });
      const data = await res.json();
      
      if (data.success && data.useSessionMode) {
        setSyncSession(data.session);
        setResult("✅ Session-based sync started!");
        setSessionStatus("Session 1 of " + data.session.total_sessions + " in progress...");
      } else if (data.success) {
        setResult("✅ Sync completed successfully!");
        setDetails(data.updateResults || null);
      } else {
        setResult(`❌ Sync failed: ${data.error || data.message}`);
        setDetails(data.updateResults || null);
      }
    } catch (err) {
      setResult("❌ Sync failed: " + (err as Error).message);
    }
    setSyncing(false);
  };

  const handleShopifySync = async () => {
    setShopifySyncing(true);
    setShopifyResult(null);
    
    try {
      const res = await fetch("/api/sync-shopify", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setShopifyResult(data);
      } else {
        setShopifyResult({ error: data.error || 'Unknown error' });
      }
    } catch (err) {
      setShopifyResult({ error: (err as Error).message });
    }
    setShopifySyncing(false);
  };

  const handleAmazonSync = async () => {
    setAmazonSyncing(true);
    setAmazonResult(null);
    
    try {
      const res = await fetch("/api/sync-amazon", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setAmazonResult(data);
      } else {
        setAmazonResult({ error: data.error || 'Unknown error' });
      }
    } catch (err) {
      setAmazonResult({ error: (err as Error).message });
    }
    setAmazonSyncing(false);
  };

  const handleShipStationSync = async () => {
    setShipstationSyncing(true);
    setShipstationResult(null);
    
    try {
      const res = await fetch("/api/sync-shipstation", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setShipstationResult(data);
      } else {
        setShipstationResult({ error: data.error || 'Unknown error' });
      }
    } catch (err) {
      setShipstationResult({ error: (err as Error).message });
    }
    setShipstationSyncing(false);
  };

  const handleStopShopifySync = async () => {
    try {
      const res = await fetch("/api/stop-shopify-sync", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setShopifySyncing(false);
        setShopifyResult(null);
        console.log('Shopify sync stopped');
      } else {
        console.error('Failed to stop Shopify sync:', data.error);
      }
    } catch (err) {
      console.error('Error stopping Shopify sync:', (err as Error).message);
    }
  };

  const handleStopAmazonSync = async () => {
    try {
      const res = await fetch("/api/stop-amazon-sync", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setAmazonSyncing(false);
        setAmazonResult(null);
        console.log('Amazon sync stopped');
      } else {
        console.error('Failed to stop Amazon sync:', data.error);
      }
    } catch (err) {
      console.error('Error stopping Amazon sync:', (err as Error).message);
    }
  };

  const handleStopShipStationSync = async () => {
    try {
      const res = await fetch("/api/stop-shipstation-sync", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        setShipstationSyncing(false);
        setShipstationResult(null);
        console.log('ShipStation sync stopped');
      } else {
        console.error('Failed to stop ShipStation sync:', data.error);
      }
    } catch (err) {
      console.error('Error stopping ShipStation sync:', (err as Error).message);
    }
  };

  const exportShopifyResults = () => {
    if (!shopifyResult || !shopifyResult.results) return;
    
    const data = {
      syncSummary: {
        message: shopifyResult.message,
        successRate: shopifyResult.results.successRate,
        successful: shopifyResult.results.successful,
        total: shopifyResult.results.total,
        failed: shopifyResult.results.failed,
        timestamp: new Date().toISOString()
      },
      inventoryChanges: shopifyResult.results.inventoryChanges,
      summary: shopifyResult.results.summary,
      errors: shopifyResult.results.errors,
      updates: shopifyResult.results.updates
    };
    
    const csvContent = generateShopifyCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopify-sync-results-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const generateShopifyCSV = (data: any) => {
    const headers = [
      'SKU',
      'Flowtrac SKU',
      'Quantity',
      'Previous Quantity',
      'Quantity Changed',
      'Type',
      'Processing Time (ms)',
      'Timestamp',
      'Actual Quantity (Verified)',
      'Update Successful',
      'Location Name'
    ];
    
    const rows = data.updates.map((update: any) => [
      update.sku || '',
      update.flowtrac_sku || '',
      update.quantity || 0,
      update.previousQuantity || '',
      update.quantityChanged ? 'Yes' : 'No',
      update.type || '',
      update.processingTime || 0,
      update.timestamp || '',
      update.verification?.actualQuantity !== undefined ? update.verification.actualQuantity : 'N/A',
      update.verification?.updateSuccessful ? 'Yes' : 'No',
      update.verification?.locationName || 'N/A'
    ]);
    
    return [headers, ...rows].map(row => row.map((cell: any) => `"${cell}"`).join(',')).join('\n');
  };

  const handleContinueSession = async () => {
    if (!syncSession) return;
    
    setSessionStatus("Continuing session...");
    
    try {
      const res = await fetch("/api/sync-session", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'continue' })
      });
      const data = await res.json();
      
      if (data.success) {
        setSyncSession(data.session);
        
        if (data.session_completed) {
          setResult("✅ All sessions completed successfully!");
          setSessionStatus(null);
          setSyncSession(null);
        } else if (data.session_failed) {
          setResult("❌ Session failed: " + (data.results?.failed_skus?.join(', ') || 'Unknown error'));
          setSessionStatus("Session failed - cannot continue");
        } else {
          setSessionStatus(`Session ${data.current_session} of ${data.session.total_sessions} completed. Ready for next session.`);
        }
      } else {
        setResult("❌ Continue session failed: " + data.error);
        setSessionStatus("Failed to continue session");
      }
    } catch (err) {
      setResult("❌ Continue session failed: " + (err as Error).message);
      setSessionStatus("Error continuing session");
    }
  };

  const handleClearSession = async () => {
    try {
      const res = await fetch("/api/sync-session?action=clear", { method: "GET" });
      const data = await res.json();
      
      if (data.success) {
        setSyncSession(null);
        setSessionStatus(null);
        setResult("Session cleared");
      }
    } catch (err) {
      setResult("Failed to clear session: " + (err as Error).message);
    }
  };

  // Database-powered batch processor functions
  const handleStartBatchProcessor = async () => {
    console.log('Start batch processor clicked!'); // Debug log
    setBatchProcessorLoading(true);
    setBatchProcessorStatus("Starting batch processor...");
    setResult("🔄 Starting database update...");
    
    try {
      console.log('Making API call to /api/flowtrac-batch-processor');
      const res = await fetch("/api/flowtrac-batch-processor", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      
      console.log('API response received:', res.status);
      const data = await res.json();
      console.log('API data:', data);
      
      if (data.success) {
        setBatchProcessorSession(data);
        
        if (data.session_completed) {
          setBatchProcessorStatus("All batches completed successfully!");
          setResult("✅ Database update completed! All batches processed.");
        } else if (data.session_failed) {
          setBatchProcessorStatus("Session failed");
          setResult("❌ Database update failed: " + data.error);
        } else if (data.auto_continue) {
          setBatchProcessorStatus("Batch completed. Auto-continuing to next batch...");
          setResult("✅ Batch completed! Continuing to next batch automatically...");
          
          console.log('Auto-continuing to next batch in 2 seconds...');
          
          // Auto-continue to next batch after a short delay
          setTimeout(() => {
            console.log('Auto-continuation timeout fired, calling handleContinueBatchProcessor');
            handleContinueBatchProcessor(data.session_id);
          }, 2000);
        } else {
          setBatchProcessorStatus("Batch completed. Ready for next batch.");
          setResult("✅ First batch completed! Click 'Continue Next Batch' to continue.");
        }
      } else {
        setResult("❌ Batch processor failed: " + data.error);
        setBatchProcessorStatus("Failed to start batch processor");
      }
    } catch (err) {
      console.error('Error in handleStartBatchProcessor:', err);
      setResult("❌ Batch processor failed: " + (err as Error).message);
      setBatchProcessorStatus("Error starting batch processor");
    } finally {
      setBatchProcessorLoading(false);
    }
  };

  const handleContinueBatchProcessor = async (sessionId?: string) => {
    console.log('handleContinueBatchProcessor called');
    console.log('Current session:', batchProcessorSession);
    console.log('Passed sessionId:', sessionId);
    
    const targetSessionId = sessionId || batchProcessorSession?.session_id;
    
    if (!targetSessionId) {
      console.log('No session ID found, returning');
      return;
    }
    
    setBatchProcessorStatus("Continuing batch processor...");
    
    try {
      console.log('Making continue API call with sessionId:', targetSessionId);
      
      const res = await fetch("/api/flowtrac-batch-processor", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'continue',
          sessionId: targetSessionId
        })
      });
      
      console.log('Continue API response status:', res.status);
      const data = await res.json();
      console.log('Continue API response data:', data);
      
      if (data.success) {
        setBatchProcessorSession(data);
        
        if (data.session_completed) {
          setBatchProcessorStatus("All batches completed successfully!");
          setResult("✅ Database update completed! All batches processed.");
          stopPolling();
        } else if (data.session_failed) {
          setBatchProcessorStatus("Session failed");
          setResult("❌ Database update failed: " + data.error);
          stopPolling();
        } else if (data.auto_continue) {
          setBatchProcessorStatus("Batch completed. Auto-continuing to next batch...");
          setResult("✅ Batch completed! Continuing to next batch automatically...");
          
          console.log('Auto-continuing to next batch in 2 seconds...');
          
          // Auto-continue to next batch after a short delay
          setTimeout(() => {
            console.log('Auto-continuation timeout fired, calling handleContinueBatchProcessor');
            handleContinueBatchProcessor(data.session_id);
          }, 2000);
        } else {
          setBatchProcessorStatus("Batch completed. Ready for next batch.");
          setResult("✅ Batch completed! Click 'Continue Next Batch' to continue.");
        }
      } else {
        setResult("❌ Continue failed: " + data.error);
        setBatchProcessorStatus("Failed to continue batch processor");
      }
    } catch (err) {
      setResult("❌ Continue failed: " + (err as Error).message);
      setBatchProcessorStatus("Error continuing batch processor");
    }
  };

  const startPollingForUpdates = (sessionId: string) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    console.log(`Starting polling for session: ${sessionId}`);
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/flowtrac-batch-processor?action=status&sessionId=${sessionId}`);
        const data = await res.json();
        
        console.log('Polling response:', data);
        
        if (data.success && data.session) {
          setBatchProcessorSession(data.session);
          
          if (data.session.status === 'completed') {
            console.log('Session completed, stopping polling');
            setBatchProcessorStatus("All batches completed successfully!");
            setResult("✅ Database update completed! All batches processed.");
            stopPolling();
          } else if (data.session.status === 'failed') {
            console.log('Session failed, stopping polling');
            setBatchProcessorStatus("Session failed");
            setResult("❌ Database update failed: " + data.session.error_message);
            stopPolling();
          } else {
            console.log(`Session status: ${data.session.status}, continuing to poll`);
          }
        } else {
          console.log('Polling response format unexpected:', data);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000); // Poll every 3 seconds
    
    setPollingInterval(interval);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      console.log('Stopping polling');
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);



  const handleLoadDatabaseStats = async () => {
    try {
      const res = await fetch("/api/flowtrac-batch-processor?action=status", { method: "GET" });
      const data = await res.json();
      
      if (data.success) {
        setDatabaseStats(data);
      }
    } catch (err) {
      console.error("Failed to load database stats:", err);
    }
  };



  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch("/api/import-csv", { 
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(`✅ ${data.message}`);
        // Refresh mapping data after import
        loadMappingData();
      } else {
        setImportResult(`❌ Import failed: ${data.error}`);
      }
    } catch (err) {
      setImportResult("❌ Import failed: " + (err as Error).message);
    }
    setImporting(false);
  };

  const handleBulkAdd = async () => {
    if (!bulkData.trim()) return;

    setImporting(true);
    setImportResult(null);

    try {
      const products = JSON.parse(bulkData);
      const res = await fetch("/api/bulk-add", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(`✅ ${data.message}`);
        setBulkData('');
        // Refresh mapping data after import
        loadMappingData();
      } else {
        setImportResult(`❌ Bulk add failed: ${data.error}`);
      }
    } catch (err) {
      setImportResult("❌ Invalid JSON or request failed: " + (err as Error).message);
    }
    setImporting(false);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/export-csv");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapping-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Export failed');
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const loadMappingData = async () => {
    setLoadingMapping(true);
    try {
      const res = await fetch("/api/mapping");
      const data = await res.json();
      if (data.success) {
        setMappingData(data);
      }
    } catch (err) {
      console.error('Failed to load mapping:', err);
    }
    setLoadingMapping(false);
  };

  const checkMappingStatus = async () => {
    try {
      const res = await fetch("/api/persist-mapping");
      const data = await res.json();
      if (data.success) {
        setMappingStatus(data);
      }
    } catch (err) {
      console.error('Failed to check mapping status:', err);
    }
  };

  const testGitHubMapping = async () => {
    try {
      // First test if API routing is working
      console.log('Testing simple endpoint first...');
      const simpleRes = await fetch("/api/test-simple");
      const simpleData = await simpleRes.json();
      console.log('Simple endpoint result:', simpleData);
      
      // Now test GitHub endpoint with timeout
      console.log('Testing GitHub endpoint...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch("/api/test-github", {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const data = await res.json();
      console.log('GitHub endpoint result:', data);
      setGithubTestResult(data);
    } catch (err: any) {
      console.error('Test failed:', err);
      if (err.name === 'AbortError') {
        setGithubTestResult({ success: false, error: 'Request timed out - likely no GitHub token configured' });
      } else {
        setGithubTestResult({ success: false, error: (err as Error).message });
      }
    }
  };

  const handleExportToSheets = async () => {
    setExportingToSheets(true);
    try {
      const res = await fetch("/api/export-to-sheets");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapping-for-google-sheets-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSheetsResult("✅ CSV exported! Now you can import this into Google Sheets for easy editing.");
      } else {
        setSheetsResult("❌ Export failed");
      }
    } catch (err) {
      setSheetsResult("❌ Export failed: " + (err as Error).message);
    }
    setExportingToSheets(false);
  };

  const handleImportFromSheets = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Add browser console logging
    console.log('🚀 Starting CSV import...');
    console.log('📁 File details:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });
    
    // Test console logging
    console.log('🧪 Console logging test - if you see this, logging is working!');
    console.warn('⚠️ Warning test - you should see this too!');
    console.error('💥 Error test - and this!');

    setImportingFromSheets(true);
    setSheetsResult(null);
    setImportedMapping(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('📤 Sending file to API...');
      const res = await fetch("/api/import-from-sheets", { 
        method: "POST",
        body: formData
      });
      
      console.log('📥 API response received:', {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries())
      });
      
      const data = await res.json();
      console.log('📊 API response data:', data);
      
      if (data.success) {
        console.log(`✅ Import successful: ${data.productCount} products imported`);
        setSheetsResult(`✅ ${data.message}`);
        setImportedMapping(data.mapping);
        // Refresh mapping data after import
        loadMappingData();
      } else {
        console.error(`❌ Import failed: ${data.error}`);
        setSheetsResult(`❌ Import failed: ${data.error}`);
      }
    } catch (err) {
      console.error('💥 Import error:', err);
      setSheetsResult("❌ Import failed: " + (err as Error).message);
    }
    setImportingFromSheets(false);
  };

  const handleUpdateMapping = async () => {
    if (!importedMapping) return;
    
    try {
      const res = await fetch("/api/update-mapping", { 
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: importedMapping })
      });
      
      const data = await res.json();
      if (data.success) {
        const githubStatus = data.githubUpdated ? ' (GitHub updated)' : ' (GitHub update failed)';
        let resultMessage = `✅ ${data.message} The mapping has been automatically updated and will be used for future syncs.${githubStatus}`;
        
        if (!data.githubUpdated && data.githubError) {
          resultMessage += `\n\nGitHub Error Details: ${JSON.stringify(data.githubError, null, 2)}`;
        }
        
        setSheetsResult(resultMessage);
        setImportedMapping(null); // Clear the imported mapping since it's now active
        // Refresh mapping data
        loadMappingData();
      } else {
        setSheetsResult(`❌ Update failed: ${data.error}`);
      }
    } catch (err) {
      setSheetsResult("❌ Update failed: " + (err as Error).message);
    }
  };

  const syncCurrentMappingToGitHub = async () => {
    setSyncingToGitHub(true);
    try {
      // Get current mapping data
      const mappingRes = await fetch("/api/mapping");
      const mappingData = await mappingRes.json();
      
      if (!mappingData.success) {
        setSheetsResult("❌ Failed to get current mapping data");
        return;
      }

      // Update GitHub with current mapping
      const updateRes = await fetch("/api/update-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: mappingData.mapping })
      });
      
      const updateData = await updateRes.json();
      if (updateData.success) {
        const githubStatus = updateData.githubUpdated ? ' (GitHub updated)' : ' (GitHub update failed)';
        let resultMessage = `✅ Current mapping synced to GitHub${githubStatus}`;
        
        if (!updateData.githubUpdated && updateData.githubError) {
          resultMessage += `\n\nGitHub Error Details: ${JSON.stringify(updateData.githubError, null, 2)}`;
        }
        
        setSheetsResult(resultMessage);
        // Clear any previous test results
        setGithubTestResult(null);
      } else {
        setSheetsResult(`❌ GitHub sync failed: ${updateData.error}`);
      }
    } catch (err) {
      setSheetsResult("❌ GitHub sync failed: " + (err as Error).message);
    }
    setSyncingToGitHub(false);
  };

  const handleMigrateBundleFormat = async () => {
    setMigrating(true);
    setSheetsResult(null);
    
    try {
      const res = await fetch("/api/migrate-bundle-format", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSheetsResult(`✅ ${data.message}`);
        // Refresh mapping data after migration
        loadMappingData();
      } else {
        setSheetsResult(`❌ Migration failed: ${data.error}`);
      }
    } catch (err) {
      setSheetsResult("❌ Migration failed: " + (err as Error).message);
    }
    setMigrating(false);
  };

  const handleExportInventoryCSV = async () => {
    setExportingInventory(true);
    setMissingSkusInfo(null);
    try {
      // Use database for CSV export (much faster and shows what will be synced)
      const res = await fetch("/api/export-inventory-csv?includeMissingSkus=true&useDatabase=true");
      if (res.ok) {
        const data = await res.json();
        
        if (data.success) {
          // Create and download the CSV file
          const blob = new Blob([data.csvContent], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.filename || `inventory-database-preview-${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          // Store missing SKU information for display
          setMissingSkusInfo(data.missingSkus);
        } else {
          console.error('Database inventory export failed:', data.error);
        }
      } else {
        console.error('Database inventory export failed');
      }
    } catch (err) {
      console.error('Database inventory export failed:', err);
    }
    setExportingInventory(false);
  };

  const handleExportMissingShipStationProducts = async () => {
    setFetchingDescriptions(true);
    setDescriptionsResult(null);
    try {
      // Export missing ShipStation products CSV
      const res = await fetch("/api/export-missing-shipstation-products");
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `missing-shipstation-products-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Set success result
        setDescriptionsResult({ 
          success: true, 
          message: `Successfully exported missing ShipStation products to CSV` 
        });
      } else {
        const errorData = await res.json();
        setDescriptionsResult({ error: errorData.error || 'Failed to export CSV' });
      }
    } catch (err) {
      setDescriptionsResult({ error: (err as Error).message });
    }
    setFetchingDescriptions(false);
  };

  // Check mapping status on component mount
  useEffect(() => {
    checkMappingStatus();
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        
        <h1>Flowtrac → Shopify Inventory Sync</h1>
        
        <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 16 }}>
          Sync inventory from Flowtrac to Shopify and Amazon. Use the Preview CSV button to see what quantities would be synced without actually performing the sync.
        </p>

        {/* --- Separate Sync Buttons and Status --- */}
        <div style={{ marginTop: 32, width: "100%", maxWidth: 800 }}>
          <h3 style={{ margin: "0 0 16px 0", color: "#495057" }}>🔄 Individual Platform Syncs</h3>
          <p style={{ fontSize: "0.9rem", color: "#6c757d", marginBottom: 16 }}>
            Sync inventory to individual platforms. Each sync processes only products relevant to that platform.
          </p>
          
          {/* Sync Buttons Row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Shopify Sync/Stop Button */}
            <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: "140px" }}>
              <button
                onClick={handleShopifySync}
                disabled={shopifySyncing}
                style={{
                  padding: "0.75rem 1.5rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  background: shopifySyncing ? "#ccc" : "#95bf47",
                  color: "#fff",
                  border: "none",
                  cursor: shopifySyncing ? "not-allowed" : "pointer",
                  flex: 1,
                }}
              >
                {shopifySyncing ? "🔄 Syncing..." : "🛍️ Shopify Sync"}
              </button>
              {shopifySyncing && (
                <button
                  onClick={handleStopShopifySync}
                  style={{
                    padding: "0.75rem 0.5rem",
                    fontSize: "0.9rem",
                    borderRadius: "6px",
                    background: "#dc3545",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    minWidth: "60px",
                  }}
                  title="Stop Shopify Sync"
                >
                  ⏹️
                </button>
              )}
            </div>
            
            {/* Amazon Sync/Stop Button */}
            <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: "140px" }}>
              <button
                onClick={handleAmazonSync}
                disabled={amazonSyncing}
                style={{
                  padding: "0.75rem 1.5rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  background: amazonSyncing ? "#ccc" : "#ff9900",
                  color: "#fff",
                  border: "none",
                  cursor: amazonSyncing ? "not-allowed" : "pointer",
                  flex: 1,
                }}
              >
                {amazonSyncing ? "🔄 Syncing..." : "📦 Amazon Sync"}
              </button>
              {amazonSyncing && (
                <button
                  onClick={handleStopAmazonSync}
                  style={{
                    padding: "0.75rem 0.5rem",
                    fontSize: "0.9rem",
                    borderRadius: "6px",
                    background: "#dc3545",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    minWidth: "60px",
                  }}
                  title="Stop Amazon Sync"
                >
                  ⏹️
                </button>
              )}
            </div>
            
            {/* ShipStation Sync/Stop Button */}
            <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: "140px" }}>
              <button
                onClick={handleShipStationSync}
                disabled={shipstationSyncing}
                style={{
                  padding: "0.75rem 1.5rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  background: shipstationSyncing ? "#ccc" : "#17a2b8",
                  color: "#fff",
                  border: "none",
                  cursor: shipstationSyncing ? "not-allowed" : "pointer",
                  flex: 1,
                }}
              >
                {shipstationSyncing ? "🔄 Syncing..." : "🚢 ShipStation Sync"}
              </button>
              {shipstationSyncing && (
                <button
                  onClick={handleStopShipStationSync}
                  style={{
                    padding: "0.75rem 0.5rem",
                    fontSize: "0.9rem",
                    borderRadius: "6px",
                    background: "#dc3545",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    minWidth: "60px",
                  }}
                  title="Stop ShipStation Sync"
                >
                  ⏹️
                </button>
              )}
            </div>
          </div>
          
          {/* Legacy Sync Button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: syncing ? "#ccc" : "#0070f3",
                color: "#fff",
                border: "none",
                cursor: syncing ? "not-allowed" : "pointer",
                flex: 2,
              }}
            >
              {syncing ? "Syncing..." : "🔄 Full Sync (All Platforms)"}
            </button>
            <button
              onClick={handleExportInventoryCSV}
              disabled={exportingInventory}
              style={{
                padding: "0.75rem 1rem",
                fontSize: "0.9rem",
                borderRadius: "6px",
                background: exportingInventory ? "#ccc" : "#28a745",
                color: "#fff",
                border: "none",
                cursor: exportingInventory ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {exportingInventory ? "Exporting..." : "📊 Database Preview CSV"}
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={handleExportMissingShipStationProducts}
              disabled={fetchingDescriptions}
              style={{
                padding: "0.75rem 1rem",
                fontSize: "0.9rem",
                borderRadius: "6px",
                background: fetchingDescriptions ? "#ccc" : "#17a2b8",
                color: "#fff",
                border: "none",
                cursor: fetchingDescriptions ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {fetchingDescriptions ? "Exporting..." : "📋 Export Missing ShipStation Products"}
            </button>
          </div>
          
          {/* Individual Sync Status Sections */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
            {/* Shopify Sync Status */}
            <div style={{ 
              flex: 1, 
              minWidth: "250px",
              padding: 16, 
              border: "1px solid #e9ecef", 
              borderRadius: "8px",
              backgroundColor: shopifyResult ? "#f8f9fa" : "#fff"
            }}>
              <h4 style={{ margin: "0 0 8px 0", color: "#95bf47" }}>🛍️ Shopify Status</h4>
              {shopifySyncing && (
                <div style={{ color: "#6c757d", fontSize: "0.9rem" }}>
                  🔄 Syncing Shopify inventory...
                </div>
              )}
              {shopifyResult && !shopifySyncing && (
                <div>
                  {shopifyResult.error ? (
                    <div style={{ color: "#dc3545", fontSize: "0.9rem" }}>
                      ❌ {shopifyResult.error}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.9rem" }}>
                      <div style={{ color: "#28a745", fontWeight: "bold", marginBottom: 4 }}>
                        ✅ {shopifyResult.message}
                      </div>
                      {shopifyResult.results?.updates && shopifyResult.results.updates.length > 0 && (
                        <button
                          onClick={exportShopifyResults}
                          style={{
                            backgroundColor: "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            marginBottom: 8
                          }}
                        >
                          📊 Export Results
                        </button>
                      )}
                      <div style={{ color: "#6c757d" }}>
                        📊 Success Rate: {shopifyResult.results?.successRate}% ({shopifyResult.results?.successful}/{shopifyResult.results?.total})
                      </div>
                      {shopifyResult.results?.inventoryChanges && (
                        <div style={{ color: "#6c757d", fontSize: "0.8rem", marginTop: 4 }}>
                          📈 Changes: {shopifyResult.results.inventoryChanges.productsWithChanges} updated, {shopifyResult.results.inventoryChanges.productsUnchanged} unchanged ({shopifyResult.results.inventoryChanges.changePercentage}% changed)
                        </div>
                      )}
                      {shopifyResult.results?.summary && (
                        <div style={{ color: "#6c757d", fontSize: "0.8rem", marginTop: 2 }}>
                          ⏱️ Time: {shopifyResult.results.summary.totalProcessingTime}ms ({shopifyResult.results.summary.averageTimePerProduct}ms avg)
                        </div>
                      )}
                      {shopifyResult.results?.errors?.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", color: "#dc3545" }}>
                            ❌ {shopifyResult.results.errors.length} errors
                          </summary>
                          <ul style={{ fontSize: "0.8rem", margin: "4px 0 0 0", paddingLeft: 16 }}>
                            {shopifyResult.results.errors.slice(0, 3).map((error: string, index: number) => (
                              <li key={index}>{error}</li>
                            ))}
                            {shopifyResult.results.errors.length > 3 && (
                              <li>... and {shopifyResult.results.errors.length - 3} more</li>
                            )}
                          </ul>
                        </details>
                      )}
                      {shopifyResult.results?.updates && shopifyResult.results.updates.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", color: "#95bf47" }}>
                            📋 View {shopifyResult.results.updates.length} product updates
                          </summary>
                          <div style={{ fontSize: "0.8rem", margin: "4px 0 0 0", maxHeight: "200px", overflowY: "auto" }}>
                            {shopifyResult.results.updates.slice(0, 10).map((update: any, index: number) => (
                              <div key={index} style={{ 
                                padding: "4px 0", 
                                borderBottom: "1px solid #eee",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                              }}>
                                <div>
                                  <strong>{update.sku}</strong>
                                  {update.previousQuantity !== null && update.quantityChanged && (
                                    <span style={{ color: "#28a745", marginLeft: 8 }}>
                                      {update.previousQuantity} → {update.quantity}
                                    </span>
                                  )}
                                  {update.previousQuantity !== null && !update.quantityChanged && (
                                    <span style={{ color: "#6c757d", marginLeft: 8 }}>
                                      {update.quantity} (unchanged)
                                    </span>
                                  )}
                                  {update.previousQuantity === null && (
                                    <span style={{ color: "#6c757d", marginLeft: 8 }}>
                                      {update.quantity}
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: "#6c757d", fontSize: "0.7rem" }}>
                                  {update.processingTime}ms
                                </div>
                              </div>
                            ))}
                            {shopifyResult.results.updates.length > 10 && (
                              <div style={{ color: "#6c757d", fontSize: "0.7rem", padding: "4px 0" }}>
                                ... and {shopifyResult.results.updates.length - 10} more products
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Amazon Sync Status */}
            <div style={{ 
              flex: 1, 
              minWidth: "250px",
              padding: 16, 
              border: "1px solid #e9ecef", 
              borderRadius: "8px",
              backgroundColor: amazonResult ? "#f8f9fa" : "#fff"
            }}>
              <h4 style={{ margin: "0 0 8px 0", color: "#ff9900" }}>📦 Amazon Status</h4>
              {amazonSyncing && (
                <div style={{ color: "#6c757d", fontSize: "0.9rem" }}>
                  🔄 Syncing Amazon inventory...
                </div>
              )}
              {amazonResult && !amazonSyncing && (
                <div>
                  {amazonResult.error ? (
                    <div style={{ color: "#dc3545", fontSize: "0.9rem" }}>
                      ❌ {amazonResult.error}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.9rem" }}>
                      <div style={{ color: "#28a745", fontWeight: "bold", marginBottom: 4 }}>
                        ✅ {amazonResult.message}
                      </div>
                      <div style={{ color: "#6c757d" }}>
                        📊 Success Rate: {amazonResult.results?.successRate}% ({amazonResult.results?.successful}/{amazonResult.results?.total})
                      </div>
                      {amazonResult.results?.errors?.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", color: "#dc3545" }}>
                            ❌ {amazonResult.results.errors.length} errors
                          </summary>
                          <ul style={{ fontSize: "0.8rem", margin: "4px 0 0 0", paddingLeft: 16 }}>
                            {amazonResult.results.errors.slice(0, 3).map((error: string, index: number) => (
                              <li key={index}>{error}</li>
                            ))}
                            {amazonResult.results.errors.length > 3 && (
                              <li>... and {amazonResult.results.errors.length - 3} more</li>
                            )}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* ShipStation Sync Status */}
            <div style={{ 
              flex: 1, 
              minWidth: "250px",
              padding: 16, 
              border: "1px solid #e9ecef", 
              borderRadius: "8px",
              backgroundColor: shipstationResult ? "#f8f9fa" : "#fff"
            }}>
              <h4 style={{ margin: "0 0 8px 0", color: "#17a2b8" }}>🚢 ShipStation Status</h4>
              {shipstationSyncing && (
                <div style={{ color: "#6c757d", fontSize: "0.9rem" }}>
                  🔄 Updating warehouse locations...
                </div>
              )}
              {shipstationResult && !shipstationSyncing && (
                <div>
                  {shipstationResult.error ? (
                    <div style={{ color: "#dc3545", fontSize: "0.9rem" }}>
                      ❌ {shipstationResult.error}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.9rem" }}>
                      <div style={{ color: "#28a745", fontWeight: "bold", marginBottom: 4 }}>
                        ✅ {shipstationResult.message}
                      </div>
                      <div style={{ color: "#6c757d" }}>
                        📊 Success Rate: {shipstationResult.results?.successRate}% ({shipstationResult.results?.successful}/{shipstationResult.results?.total})
                      </div>
                      {shipstationResult.results?.errors?.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", color: "#dc3545" }}>
                            ❌ {shipstationResult.results.errors.length} errors
                          </summary>
                          <ul style={{ fontSize: "0.8rem", margin: "4px 0 0 0", paddingLeft: 16 }}>
                            {shipstationResult.results.errors.slice(0, 3).map((error: string, index: number) => (
                              <li key={index}>{error}</li>
                            ))}
                            {shipstationResult.results.errors.length > 3 && (
                              <li>... and {shipstationResult.results.errors.length - 3} more</li>
                            )}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Database Batch Processor Section */}
          <div style={{ 
            marginTop: 32, 
            padding: 20, 
            border: "2px solid #e9ecef", 
            borderRadius: "8px",
            backgroundColor: "#f8f9fa"
          }}>
            <h3 style={{ margin: "0 0 16px 0", color: "#495057" }}>🗄️ Database-Powered Inventory Sync</h3>
            <p style={{ fontSize: "0.9rem", color: "#6c757d", marginBottom: 16 }}>
              Update the database with Flowtrac inventory data in batches, then sync to Shopify/Amazon from the database.
            </p>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={handleStartBatchProcessor}
                disabled={batchProcessorSession || batchProcessorLoading}
                style={{
                  padding: "0.75rem 1.5rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  background: batchProcessorSession || batchProcessorLoading ? "#ccc" : "#6f42c1",
                  color: "#fff",
                  border: "none",
                  cursor: batchProcessorSession || batchProcessorLoading ? "not-allowed" : "pointer",
                  flex: 2,
                }}
              >
                {batchProcessorLoading ? "🔄 Starting..." : "🚀 Start Database Update"}
              </button>
              <button
                onClick={handleLoadDatabaseStats}
                style={{
                  padding: "0.75rem 1rem",
                  fontSize: "0.9rem",
                  borderRadius: "6px",
                  background: "#6c757d",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                📊 Database Stats
              </button>

            </div>
            
            {/* Database Stats Display */}
            {databaseStats && (
              <div style={{ 
                marginBottom: 16, 
                padding: 12, 
                backgroundColor: "#fff", 
                borderRadius: "4px",
                border: "1px solid #dee2e6"
              }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem" }}>Database Statistics</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.8rem" }}>
                  <div><strong>Inventory Records:</strong> {databaseStats.inventory?.total_inventory_records || 0}</div>
                  <div><strong>Unique SKUs:</strong> {databaseStats.inventory?.unique_skus || 0}</div>
                  <div><strong>Last Update:</strong> {databaseStats.inventory?.last_inventory_update ? new Date(databaseStats.inventory.last_inventory_update).toLocaleString() : 'Never'}</div>
                  <div><strong>Total Sessions:</strong> {databaseStats.sessions?.total_sessions || 0}</div>
                </div>
              </div>
            )}
            
                        {/* Batch Processor Session Controls */}
            {batchProcessorSession && (
              <div style={{ 
                marginTop: 16, 
                padding: 16, 
                border: "1px solid #dee2e6", 
                borderRadius: "6px",
                backgroundColor: "#fff"
              }}>
                <h4 style={{ margin: "0 0 12px 0", color: "#495057" }}>Database Update Progress</h4>
                
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Progress:</span>
                    <span>{batchProcessorSession.results?.skus_processed || 0} SKUs processed</span>
                  </div>
                  <div style={{ 
                    width: "100%", 
                    height: "8px", 
                    backgroundColor: "#e9ecef", 
                    borderRadius: "4px",
                    overflow: "hidden"
                  }}>
                    <div style={{ 
                      width: `${((batchProcessorSession.results?.skus_processed || 0) / 120) * 100}%`,
                      height: "100%",
                      backgroundColor: "#6f42c1",
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Batch {batchProcessorSession.batch_number || 0} completed</strong>
                  <br />
                  <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
                    {batchProcessorSession.results?.successful || 0} successful, {batchProcessorSession.results?.failed || 0} failed
                  </span>
                </div>
                
                {batchProcessorStatus && (
                  <div style={{ 
                    marginBottom: 12,
                    padding: "8px 12px",
                    backgroundColor: "#e3f2fd",
                    borderRadius: "4px",
                    fontSize: "0.9rem"
                  }}>
                    {batchProcessorStatus}
                  </div>
                )}
                
                {batchProcessorSession.session_completed && (
                  <div style={{ 
                    marginBottom: 12,
                    padding: "8px 12px",
                    backgroundColor: "#d4edda",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    color: "#155724"
                  }}>
                    ✅ All batches completed successfully!
                  </div>
                )}
                
                {batchProcessorSession.session_failed && (
                  <div style={{ 
                    marginBottom: 12,
                    padding: "8px 12px",
                    backgroundColor: "#f8d7da",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    color: "#721c24"
                  }}>
                    ❌ Session failed: {batchProcessorSession.error || 'Unknown error'}
                  </div>
                )}
                
                <div style={{ display: "flex", gap: 8 }}>
                  {batchProcessorSession.next_batch_available && (
                    <button
                      onClick={() => handleContinueBatchProcessor()}
                      style={{
                        padding: "0.5rem 1rem",
                        fontSize: "0.9rem",
                        borderRadius: "4px",
                        background: "#28a745",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      Continue Next Batch
                    </button>
                  )}
                  <button
                    onClick={() => {
                      stopPolling();
                      setBatchProcessorSession(null);
                      setBatchProcessorStatus(null);
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.9rem",
                      borderRadius: "4px",
                      background: "#dc3545",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    Clear Session
                  </button>
                </div>
              </div>
            )}
          </div>
          {result && (
            <div style={{ marginTop: 8, fontWeight: 500 }}>{result}</div>
          )}
          
          {/* Session-based sync controls */}
          {syncSession && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              border: "1px solid #ddd", 
              borderRadius: "6px",
              backgroundColor: "#f8f9fa"
            }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#333" }}>Session Progress</h4>
              
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Progress:</span>
                  <span>{syncSession.processed_skus} / {syncSession.total_skus} SKUs</span>
                </div>
                <div style={{ 
                  width: "100%", 
                  height: "8px", 
                  backgroundColor: "#e9ecef", 
                  borderRadius: "4px",
                  overflow: "hidden"
                }}>
                  <div style={{ 
                    width: `${(syncSession.processed_skus / syncSession.total_skus) * 100}%`,
                    height: "100%",
                    backgroundColor: "#0070f3",
                    transition: "width 0.3s ease"
                  }} />
                </div>
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <strong>Session {syncSession.current_session} of {syncSession.total_sessions}</strong>
                <br />
                <span style={{ fontSize: "0.9rem", color: "#666" }}>
                  {syncSession.remaining_skus} SKUs remaining
                </span>
              </div>
              
              {sessionStatus && (
                <div style={{ 
                  marginBottom: 12, 
                  padding: "8px 12px", 
                  backgroundColor: "#e3f2fd", 
                  borderRadius: "4px",
                  fontSize: "0.9rem"
                }}>
                  {sessionStatus}
                </div>
              )}
              
              <div style={{ display: "flex", gap: 8 }}>
                {syncSession.status === 'in_progress' && syncSession.current_session < syncSession.total_sessions && (
                  <button
                    onClick={handleContinueSession}
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.9rem",
                      borderRadius: "4px",
                      background: "#28a745",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    Continue Next Session
                  </button>
                )}
                <button
                  onClick={handleClearSession}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    borderRadius: "4px",
                    background: "#dc3545",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Clear Session
                </button>
              </div>
            </div>
          )}
          {details && (
            <div style={{ marginTop: 16 }}>
              <h4>Sync Results:</h4>
              <ul style={{ paddingLeft: 20 }}>
                {Object.entries(details).map(([sku, res]: any) => {
                  // Handle different result structures
                  if (sku === 'shipstation') {
                    // ShipStation results are nested
                    return Object.entries(res).map(([ssSku, ssRes]: any) => (
                      <li key={`shipstation-${ssSku}`} style={{ color: ssRes.success ? "green" : "red" }}>
                        <strong>ShipStation {ssSku}:</strong> {ssRes.success ? "Success" : `Error: ${ssRes.error || 'Unknown error'}`}
                      </li>
                    ));
                  } else {
                    // Regular SKU results have shopify and amazon properties
                    const shopifyResult = res.shopify;
                    const amazonResult = res.amazon;
                    return (
                      <li key={sku}>
                        <strong>{sku}:</strong>
                        <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                          <li style={{ color: shopifyResult?.success ? "green" : "red" }}>
                            Shopify: {shopifyResult?.success ? "Success" : `Error: ${shopifyResult?.error || 'Unknown error'}`}
                          </li>
                          {amazonResult && (
                            <li style={{ color: amazonResult?.success ? "green" : "red" }}>
                              Amazon: {amazonResult?.success ? "Success" : `Error: ${amazonResult?.error || 'Unknown error'}`}
                            </li>
                          )}
                        </ul>
                      </li>
                    );
                  }
                })}
              </ul>
            </div>
          )}
        </div>

        {/* --- Missing SKU Information --- */}
        {missingSkusInfo && (
          <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
            <h4>📊 Preview CSV Results:</h4>
            <div style={{ 
              padding: "12px 16px", 
              borderRadius: "6px",
              background: missingSkusInfo.missing > 0 ? "#fff3cd" : "#d4edda",
              border: `1px solid ${missingSkusInfo.missing > 0 ? "#ffeaa7" : "#c3e6cb"}`,
              color: missingSkusInfo.missing > 0 ? "#856404" : "#155724"
            }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Summary:</strong> {missingSkusInfo.valid} valid SKUs, {missingSkusInfo.missing} missing SKUs ({missingSkusInfo.percentageValid}% valid)
              </div>
              {missingSkusInfo.missing > 0 && (
                <div>
                  <strong>Missing SKUs ({missingSkusInfo.missing}):</strong>
                  <div style={{ 
                    maxHeight: "200px", 
                    overflowY: "auto", 
                    marginTop: 8,
                    padding: "8px",
                    background: "#f8f9fa",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontFamily: "monospace"
                  }}>
                    {missingSkusInfo.missingSkusList.slice(0, 20).join(', ')}
                    {missingSkusInfo.missingSkusList.length > 20 && (
                      <div style={{ marginTop: 4, color: "#6c757d" }}>
                        ... and {missingSkusInfo.missingSkusList.length - 20} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Missing ShipStation Products Results --- */}
        {descriptionsResult && (
          <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
            <h4>Missing ShipStation Products Results:</h4>
            {descriptionsResult.error ? (
              <div style={{ 
                padding: "8px 12px", 
                borderRadius: "4px",
                background: "#f8d7da",
                color: "#721c24",
                fontSize: "0.9rem"
              }}>
                ❌ Error: {descriptionsResult.error}
              </div>
            ) : descriptionsResult.success ? (
              <div style={{ 
                border: "1px solid #ddd", 
                padding: 16, 
                borderRadius: 6,
                background: "#f8f9fa",
                marginBottom: 16
              }}>
                <div style={{ marginBottom: 12 }}>
                  <strong>✅ Success!</strong> {descriptionsResult.message}
                </div>
                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                  <strong>Next Steps:</strong>
                  <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                    <li>Open the downloaded CSV file</li>
                    <li>Review the missing products list</li>
                    <li>Manually create these products in ShipStation</li>
                    <li>Use the provided descriptions and "Finished Chocolate" tag</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div style={{ 
                padding: "8px 12px", 
                borderRadius: "4px",
                background: "#f8d7da",
                color: "#721c24",
                fontSize: "0.9rem"
              }}>
                ❌ Request failed
              </div>
            )}
          </div>
        )}

        {/* --- Console Test Button --- */}
        <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
          <button
            onClick={() => {
              console.log('🧪 Test button clicked!');
              console.warn('⚠️ Warning test!');
              console.error('💥 Error test!');
              alert('Check the console for test messages!');
            }}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              borderRadius: "6px",
              background: "#6f42c1",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              marginBottom: 16
            }}
          >
            🧪 Test Console Logging
          </button>
        </div>

        {/* --- Google Sheets Integration --- */}
        <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
          <h3 style={{ marginBottom: 16, color: "#333" }}>📊 Google Sheets Integration</h3>
          <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 16 }}>
            Export your mapping to Google Sheets for easy editing, then import it back!
          </p>
          
          {/* Mapping Status Indicator */}
          <div style={{ 
            fontSize: "0.8rem", 
            color: "#666", 
            marginBottom: 16,
            padding: "8px 12px",
            background: "#e7f3ff",
            borderRadius: "4px",
            border: "1px solid #b3d9ff"
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Mapping Status:</strong> 
                {mappingStatus?.hasCachedMapping ? 
                  ` ✅ Active (${mappingStatus.productCount} products)` : 
                  mappingData?.source === 'github' ?
                  ` 🔗 GitHub (${mappingData?.productCount} products)` :
                  ' ⚠️ Using original mapping.json'
                }
              </span>
              <button
                onClick={checkMappingStatus}
                style={{
                  padding: "2px 8px",
                  fontSize: "0.7rem",
                  borderRadius: "3px",
                  background: "#007bff",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  marginRight: "8px"
                }}
              >
                Refresh
              </button>
              <button
                onClick={testGitHubMapping}
                style={{
                  padding: "2px 8px",
                  fontSize: "0.7rem",
                  borderRadius: "3px",
                  background: "#28a745",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  marginRight: "8px"
                }}
              >
                Test GitHub
              </button>
              <button
                onClick={syncCurrentMappingToGitHub}
                disabled={syncingToGitHub}
                style={{
                  padding: "2px 8px",
                  fontSize: "0.7rem",
                  borderRadius: "3px",
                  background: syncingToGitHub ? "#6c757d" : "#dc3545",
                  color: "#fff",
                  border: "none",
                  cursor: syncingToGitHub ? "not-allowed" : "pointer"
                }}
              >
                {syncingToGitHub ? "Syncing..." : "Sync to GitHub"}
              </button>
            </div>
            
            {/* GitHub Test Result */}
            {githubTestResult && (
              <div style={{ 
                fontSize: "0.8rem", 
                color: "#666", 
                marginBottom: 16,
                padding: "8px 12px",
                background: githubTestResult.success ? "#d4edda" : "#f8d7da",
                borderRadius: "4px",
                border: `1px solid ${githubTestResult.success ? "#c3e6cb" : "#f5c6cb"}`
              }}>
                <strong>GitHub Test Result:</strong> {githubTestResult.success ? 
                  `✅ ${githubTestResult.message} (${githubTestResult.productCount} products)` :
                  `❌ ${githubTestResult.error || githubTestResult.message}`
                }
                {githubTestResult.success && githubTestResult.products && (
                  <div style={{ marginTop: "4px", fontSize: "0.7rem" }}>
                    <strong>Products in GitHub:</strong>
                    <div style={{ maxHeight: "100px", overflowY: "auto", marginTop: "2px" }}>
                      {githubTestResult.products.map((p: any, i: number) => (
                        <div key={i} style={{ marginBottom: "1px" }}>
                          {p.flowtrac_sku} → {p.shopify_sku} {p.amazon_sku ? `(${p.amazon_sku})` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ 
            fontSize: "0.8rem", 
            color: "#666", 
            marginBottom: 16,
            padding: "8px 12px",
            background: "#f8f9fa",
            borderRadius: "4px",
            border: "1px solid #dee2e6"
          }}>
            <strong>Bundle Components Format:</strong> Use "SKU1:2; SKU2:1" format instead of JSON.<br/>
            Example: "IC-KOOL-0045:2; IC-HCPK-0096:1" means 2 of IC-KOOL-0045 and 1 of IC-HCPK-0096
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={handleMigrateBundleFormat}
              disabled={migrating}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: migrating ? "#ccc" : "#dc3545",
                color: "#fff",
                border: "none",
                cursor: migrating ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {migrating ? "Migrating..." : "🔄 Migrate Old Format"}
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={handleExportToSheets}
              disabled={exportingToSheets}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: exportingToSheets ? "#ccc" : "#28a745",
                color: "#fff",
                border: "none",
                cursor: exportingToSheets ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {exportingToSheets ? "Exporting..." : "📤 Export to Sheets"}
            </button>
            <label
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: importingFromSheets ? "#ccc" : "#ffc107",
                color: "#000",
                border: "none",
                cursor: importingFromSheets ? "not-allowed" : "pointer",
                flex: 1,
                textAlign: "center",
                display: "block"
              }}
            >
              {importingFromSheets ? "Importing..." : "📥 Import from Sheets"}
              <input
                type="file"
                accept=".csv"
                onChange={handleImportFromSheets}
                disabled={importingFromSheets}
                style={{ display: "none" }}
              />
            </label>
          </div>
          
          {sheetsResult && (
            <div style={{ 
              marginTop: 8, 
              padding: "8px 12px", 
              borderRadius: "4px",
              background: sheetsResult.includes("✅") ? "#d4edda" : "#f8d7da",
              color: sheetsResult.includes("✅") ? "#155724" : "#721c24",
              fontSize: "0.9rem"
            }}>
              {sheetsResult}
            </div>
          )}
          
          {importedMapping && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleUpdateMapping}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  background: "#28a745",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                ✅ Apply Imported Mapping
              </button>
            </div>
          )}
        </div>

        {/* --- Mapping Info and Export --- */}
        <div style={{ marginTop: 16, width: "100%", maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={loadMappingData}
              disabled={loadingMapping}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: loadingMapping ? "#ccc" : "#17a2b8",
                color: "#fff",
                border: "none",
                cursor: loadingMapping ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {loadingMapping ? "Loading..." : "📋 View Current Mapping"}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                borderRadius: "6px",
                background: exporting ? "#ccc" : "#6c757d",
                color: "#fff",
                border: "none",
                cursor: exporting ? "not-allowed" : "pointer",
                flex: 1,
              }}
            >
              {exporting ? "Exporting..." : "📥 Export CSV"}
            </button>
          </div>

          {/* Mapping Data Display */}
          {mappingData && (
            <div style={{ 
              border: "1px solid #ddd", 
              padding: 16, 
              borderRadius: 6,
              background: "#f8f9fa",
              marginBottom: 16
            }}>
              <h4>Current Mapping ({mappingData.productCount} products)</h4>
              <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 12 }}>
                Last updated: {new Date(mappingData.lastUpdated).toLocaleString()}
              </p>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd" }}>
                      <th style={{ textAlign: "left", padding: "4px" }}>Shopify SKU</th>
                      <th style={{ textAlign: "left", padding: "4px" }}>Flowtrac SKU</th>
                      <th style={{ textAlign: "left", padding: "4px" }}>Product Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingData.mapping.products.slice(0, 10).map((product: any, index: number) => (
                      <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "4px" }}>{product.shopify_sku}</td>
                        <td style={{ padding: "4px" }}>{product.flowtrac_sku}</td>
                        <td style={{ padding: "4px" }}>{product.product_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappingData.productCount > 10 && (
                  <p style={{ fontSize: "0.8rem", color: "#666", marginTop: 8 }}>
                    Showing first 10 of {mappingData.productCount} products. Export CSV to see all.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* --- Import Tools Section --- */}
        <div style={{ marginTop: 32, width: "100%", maxWidth: 480 }}>
          <button
            onClick={() => setShowImportTools(!showImportTools)}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              borderRadius: "6px",
              background: "#28a745",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              width: "100%",
              marginBottom: 16,
            }}
          >
            {showImportTools ? "Hide" : "Show"} Import Tools
          </button>

          {showImportTools && (
            <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 6 }}>
              <h3>Bulk Import Products</h3>
              
              {/* CSV Import */}
              <div style={{ marginBottom: 20 }}>
                <h4>CSV Import</h4>
                <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 8 }}>
                  Upload a CSV file with columns: shopify_sku, flowtrac_sku, product_name, [bundle_components]
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  disabled={importing}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Bulk JSON Add */}
              <div style={{ marginBottom: 20 }}>
                <h4>Bulk JSON Add</h4>
                <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 8 }}>
                  Paste JSON array of products
                </p>
                <textarea
                  value={bulkData}
                  onChange={(e) => setBulkData(e.target.value)}
                  placeholder={`[
  {
    "shopify_sku": "IC-KOOL-0045",
    "flowtrac_sku": "IC-KOOL-0045", 
    "product_name": "Kool Aid Cherry",
    "bundle_components": []
  }
]`}
                  style={{
                    width: "100%",
                    height: 120,
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    fontFamily: "monospace",
                    fontSize: "0.8rem"
                  }}
                />
                <button
                  onClick={handleBulkAdd}
                  disabled={importing || !bulkData.trim()}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    borderRadius: "4px",
                    background: importing ? "#ccc" : "#0070f3",
                    color: "#fff",
                    border: "none",
                    cursor: importing ? "not-allowed" : "pointer",
                    marginTop: 8,
                  }}
                >
                  {importing ? "Importing..." : "Add Products"}
                </button>
              </div>

              {importResult && (
                <div style={{ 
                  marginTop: 16, 
                  padding: 8, 
                  borderRadius: 4,
                  background: importResult.includes("✅") ? "#d4edda" : "#f8d7da",
                  color: importResult.includes("✅") ? "#155724" : "#721c24"
                }}>
                  {importResult}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className={styles.footer}>
        <a
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
