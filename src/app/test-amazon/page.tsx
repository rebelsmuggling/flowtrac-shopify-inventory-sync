'use client';

import { useState } from 'react';

export default function TestAmazonPage() {
  const [testType, setTestType] = useState('connection');
  const [sku, setSku] = useState('TEST-SKU-001');
  const [quantity, setQuantity] = useState(10);
  const [bulkUpdates, setBulkUpdates] = useState('TEST-SKU-002,15\nTEST-SKU-003,20');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let response;
      
      if (testType === 'connection') {
        response = await fetch('/api/test-amazon-feed?testType=connection');
      } else if (testType === 'single') {
        response = await fetch('/api/test-amazon-feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testType: 'single', sku, quantity })
        });
      } else if (testType === 'bulk') {
        const updates = bulkUpdates
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [sku, qty] = line.split(',');
            return { sku: sku.trim(), quantity: parseInt(qty.trim()) };
          });

        response = await fetch('/api/test-amazon-feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testType: 'bulk', bulkUpdates: updates })
        });
      }

      const data = await response!.json();
      
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Test failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">🧪 Amazon Feed Test</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Test Type:</label>
          <select 
            value={testType} 
            onChange={(e) => setTestType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
          >
            <option value="connection">Connection Test</option>
            <option value="single">Single SKU Update</option>
            <option value="bulk">Bulk SKU Update</option>
          </select>
        </div>

        {testType === 'single' && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">SKU:</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="TEST-SKU-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Quantity:</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="10"
              />
            </div>
          </div>
        )}

        {testType === 'bulk' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Bulk Updates (one per line, format: SKU,quantity):</label>
            <textarea
              value={bulkUpdates}
              onChange={(e) => setBulkUpdates(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md h-32"
              placeholder="TEST-SKU-002,15&#10;TEST-SKU-003,20"
            />
          </div>
        )}

        <button
          onClick={runTest}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-md"
        >
          {loading ? 'Running Test...' : 'Run Test'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <strong>Test Type:</strong> {result.testType}
            </div>
            <div>
              <strong>Duration:</strong> {result.duration}
            </div>
          </div>

          <div className="mb-4">
            <strong>Result:</strong>
            <pre className="bg-gray-100 p-4 rounded-md mt-2 overflow-auto">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          </div>

          {result.result?.success ? (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              ✅ Test completed successfully!
            </div>
          ) : (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              ⚠️ Test completed with issues. Check the result details above.
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-100 rounded-lg p-6 mt-6">
        <h3 className="text-lg font-semibold mb-3">Test Instructions</h3>
        <ul className="list-disc list-inside space-y-2 text-sm">
          <li><strong>Connection Test:</strong> Tests AWS credentials and SP-API connection without making feed submissions</li>
          <li><strong>Single SKU Update:</strong> Tests updating a single SKU using the JSON feed format</li>
          <li><strong>Bulk SKU Update:</strong> Tests updating multiple SKUs in a single feed submission</li>
          <li>Use test SKUs (TEST-SKU-001, etc.) to avoid affecting real inventory</li>
          <li>Check the Vercel logs for detailed error information</li>
        </ul>
      </div>
    </div>
  );
}
