#!/usr/bin/env node

// Simple script to generate a secure JWT secret
const crypto = require('crypto');

console.log('🔐 Generating secure JWT secret...');
console.log('');

const secret = crypto.randomBytes(64).toString('hex');
console.log('Generated JWT_SECRET:');
console.log(secret);
console.log('');
console.log('📝 Copy this value to your .env file:');
console.log(`JWT_SECRET=${secret}`);
console.log('');
console.log('⚠️  Keep this secret secure and never share it!');
