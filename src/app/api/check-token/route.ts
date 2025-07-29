import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
  return NextResponse.json({ 
    success: true, 
    hasToken: !!GITHUB_TOKEN,
    tokenLength: GITHUB_TOKEN ? GITHUB_TOKEN.length : 0,
    tokenPrefix: GITHUB_TOKEN ? GITHUB_TOKEN.substring(0, 4) : null,
    message: GITHUB_TOKEN ? 'GitHub token is configured' : 'GitHub token is NOT configured'
  });
} 