#!/bin/bash
set -e

echo "Building Lambda deployment package..."

# Install dependencies
npm install --production

# Create deployment package
zip -r lambda_function.zip index.js node_modules/

# Copy to terraform directory
cp lambda_function.zip ../terraform/

echo "Lambda package built successfully: lambda_function.zip"
echo "Package size: $(du -h lambda_function.zip | cut -f1)"
