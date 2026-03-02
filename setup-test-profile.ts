/**
 * Quick script to set up a test maker profile
 * Run with: npx ts-node setup-test-profile.ts
 */

import { AppSyncClient } from '@aws-sdk/client-appsync';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import fetch from 'node-fetch';

const APPSYNC_ENDPOINT = 'https://mys2ammtzfg7xe7h2h4bxts6la.appsync-api.us-east-1.amazonaws.com/graphql';
const API_KEY = 'da2-3ck2xduwwbfufncwr4ne2d76bu';

// You'll need to provide these from your authentication
const USER_EMAIL = process.env.USER_EMAIL || 'test@example.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'TestPassword123!';
const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_XXXXXXXXX';
const CLIENT_ID = process.env.CLIENT_ID || 'your-client-id';

async function setupMakerProfile(idToken: string, userId: string) {
  const mutation = `
    mutation SetupMakerProfile($input: SetupMakerProfileInput!) {
      setupMakerProfile(input: $input) {
        userId
        email
        businessName
        storeDescription
        bio
        primaryCraft
        yearsOfExperience
        createdAt
      }
    }
  `;

  const variables = {
    input: {
      userId: userId,
      businessName: "Test Artisan Studio",
      storeDescription: "Handcrafted goods made with love and tradition",
      bio: "Passionate maker specializing in traditional crafts with modern flair",
      businessType: "INDIVIDUAL",
      location: {
        country: "United States",
        state: "California",
        city: "San Francisco",
        zipCode: "94102",
        timezone: "America/Los_Angeles"
      },
      primaryCraft: "Woodworking",
      yearsOfExperience: 5,
      acceptCustomOrders: true,
      acceptRushOrders: false
    }
  };

  const response = await fetch(APPSYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': idToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables
    })
  });

  const result = await response.json();
  return result;
}

async function main() {
  console.log('🔧 Setting up test maker profile...\n');
  
  // For now, just output the mutation that needs to be run
  console.log('To set up your maker profile, run this mutation in the AppSync console:');
  console.log('URL:', APPSYNC_ENDPOINT);
  console.log('\nMutation:');
  console.log(`
mutation SetupMakerProfile {
  setupMakerProfile(input: {
    userId: "YOUR_USER_ID_FROM_JWT"
    businessName: "Test Artisan Studio"
    storeDescription: "Handcrafted goods made with love and tradition"
    bio: "Passionate maker specializing in traditional crafts"
    businessType: INDIVIDUAL
    location: {
      country: "United States"
      state: "California"
      city: "San Francisco"
      zipCode: "94102"
      timezone: "America/Los_Angeles"
    }
    primaryCraft: "Woodworking"
    yearsOfExperience: 5
    acceptCustomOrders: true
    acceptRushOrders: false
  }) {
    userId
    email
    businessName
    storeDescription
    bio
    primaryCraft
    isActive
    createdAt
  }
}
  `);
  
  console.log('\nOR use the API key for testing:');
  console.log('API Key:', API_KEY);
  console.log('\nNote: Replace "YOUR_USER_ID_FROM_JWT" with your actual user ID from the authentication token');
}

main().catch(console.error);
