import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Testing GitHub mapping API...');
    
    // Check environment variables
    const hasGitHubToken = !!process.env.GITHUB_TOKEN;
    const hasVercelUrl = !!process.env.VERCEL_URL;
    
    console.log('Environment check:', {
      hasGitHubToken,
      hasVercelUrl,
      VERCEL_URL: process.env.VERCEL_URL
    });
    
    if (!hasGitHubToken) {
      return NextResponse.json({
        success: false,
        error: 'GitHub token not configured',
        missing: 'GITHUB_TOKEN'
      }, { status: 500 });
    }
    
    // Test the GitHub mapping endpoint
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const testUrl = `${baseUrl}/api/github-mapping`;
    
    console.log('Testing URL:', testUrl);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('GitHub mapping API response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: 'GitHub mapping API is working',
        url: testUrl,
        response: data
      });
    } else {
      const errorText = await response.text();
      return NextResponse.json({
        success: false,
        error: 'GitHub mapping API failed',
        status: response.status,
        response: errorText,
        url: testUrl
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('GitHub mapping test failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
