#!/bin/bash

# Aqua Wise Local Testing Script
# This script helps you test both functions locally

echo "🚀 Aqua Wise Local Testing Helper"
echo "================================="

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "📝 Please copy env.template to .env and fill in your Shopify credentials:"
    echo "   cp env.template .env"
    echo "   # Then edit .env with your actual values"
    exit 1
fi

# Function to test main product sync
test_main_function() {
    echo ""
    echo "🔧 Testing Main Product Sync Function"
    echo "====================================="
    echo "Starting function on port 8080..."
    
    # Start function in background
    npm run start &
    FUNCTION_PID=$!
    
    # Wait for function to start
    sleep 3
    
    echo "📤 Sending test request..."
    curl --location \
        --header "Content-Type: application/json" \
        --data @test/sample-product.json \
        http://localhost:8080
    
    echo ""
    echo "🛑 Stopping function..."
    kill $FUNCTION_PID
    wait $FUNCTION_PID 2>/dev/null
}

# Function to test bundle function
test_bundle_function() {
    echo ""
    echo "🔧 Testing Bundle Function"
    echo "========================="
    echo "Starting bundle function on port 8080..."
    
    # Start function in background
    npm run start:bundle &
    FUNCTION_PID=$!
    
    # Wait for function to start
    sleep 3
    
    echo "📤 Sending test request..."
    curl --location \
        --header "Content-Type: application/json" \
        --data @test/sample-bundle.json \
        http://localhost:8080
    
    echo ""
    echo "🛑 Stopping function..."
    kill $FUNCTION_PID
    wait $FUNCTION_PID 2>/dev/null
}

# Function to test with existing files
test_existing_files() {
    echo ""
    echo "🔧 Testing with Existing Files"
    echo "=============================="
    echo "Starting main function on port 8080..."
    
    # Start function in background
    npm run start &
    FUNCTION_PID=$!
    
    # Wait for function to start
    sleep 3
    
    if [ -f "test.json" ]; then
        echo "📤 Testing with test.json..."
        curl --location \
            --header "Content-Type: application/json" \
            --data @test.json \
            http://localhost:8080
    fi
    
    echo ""
    echo "🛑 Stopping function..."
    kill $FUNCTION_PID
    wait $FUNCTION_PID 2>/dev/null
}

# Main menu
echo ""
echo "What would you like to test?"
echo "1) Main Product Sync Function (with sample data)"
echo "2) Bundle Function (with sample data)"
echo "3) Main Function (with existing test.json)"
echo "4) All functions"
echo "5) Exit"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        test_main_function
        ;;
    2)
        test_bundle_function
        ;;
    3)
        test_existing_files
        ;;
    4)
        test_main_function
        test_bundle_function
        test_existing_files
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "✅ Testing complete!"
echo ""
echo "📚 Additional Information:"
echo "- Main function endpoint: http://localhost:8080"
echo "- Bundle function endpoint: http://localhost:8080 (when running start:bundle)"
echo "- Sample files are in the test/ directory"
echo "- Check the console output above for any errors"
