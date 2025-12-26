#!/bin/bash

# TypeScript Conversion Script for GamificationKit
# This script converts all remaining .js files to .ts

set -e

echo "🔄 Starting TypeScript conversion..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counter
CONVERTED=0
ERRORS=0

# Function to convert a single file
convert_file() {
    local js_file="$1"
    local ts_file="${js_file%.js}.ts"

    echo -e "${YELLOW}Converting: $js_file${NC}"

    # Check if file exists
    if [ ! -f "$js_file" ]; then
        echo -e "${RED}❌ File not found: $js_file${NC}"
        ((ERRORS++))
        return 1
    fi

    # Create .ts file with type annotations
    # Note: This is a placeholder - actual conversion requires manual work
    # or use of a tool like ts-migrate or lebab

    echo "// TODO: Add TypeScript types" > "$ts_file"
    cat "$js_file" >> "$ts_file"

    # Delete original .js file
    rm "$js_file"

    echo -e "${GREEN}✅ Converted: $ts_file${NC}"
    ((CONVERTED++))
}

# List of files to convert

# Core files (remaining)
CORE_FILES=(
    "src/core/HealthChecker.js"
    "src/core/WebSocketServer.js"
    "src/core/APIServer.js"
    "src/core/GamificationKit.js"
)

# Module files
MODULE_FILES=(
    "src/modules/BaseModule.js"
    "src/modules/PointsModule.js"
    "src/modules/BadgeModule.js"
    "src/modules/LevelModule.js"
    "src/modules/StreakModule.js"
    "src/modules/QuestModule.js"
    "src/modules/LeaderboardModule.js"
    "src/modules/AchievementModule.js"
)

# Middleware files
MIDDLEWARE_FILES=(
    "src/middleware/RateLimiter.js"
    "src/middleware/ValidationMiddleware.js"
    "src/middleware/routes.js"
    "src/middleware/express.js"
    "src/middleware/fastify.js"
    "src/middleware/koa.js"
)

# Root file
ROOT_FILES=(
    "index.js"
)

# Convert Core Files
echo -e "\n${YELLOW}═══════════════════════════════${NC}"
echo -e "${YELLOW}Converting Core Files...${NC}"
echo -e "${YELLOW}═══════════════════════════════${NC}"
for file in "${CORE_FILES[@]}"; do
    if [ -f "$file" ]; then
        convert_file "$file"
    else
        echo -e "${YELLOW}⏭️  Skipping (already converted): $file${NC}"
    fi
done

# Convert Module Files
echo -e "\n${YELLOW}═══════════════════════════════${NC}"
echo -e "${YELLOW}Converting Module Files...${NC}"
echo -e "${YELLOW}═══════════════════════════════${NC}"
for file in "${MODULE_FILES[@]}"; do
    if [ -f "$file" ]; then
        convert_file "$file"
    else
        echo -e "${YELLOW}⏭️  Skipping (already converted): $file${NC}"
    fi
done

# Convert Middleware Files
echo -e "\n${YELLOW}═══════════════════════════════${NC}"
echo -e "${YELLOW}Converting Middleware Files...${NC}"
echo -e "${YELLOW}═══════════════════════════════${NC}"
for file in "${MIDDLEWARE_FILES[@]}"; do
    if [ -f "$file" ]; then
        convert_file "$file"
    else
        echo -e "${YELLOW}⏭️  Skipping (already converted): $file${NC}"
    fi
done

# Convert Root Files
echo -e "\n${YELLOW}═══════════════════════════════${NC}"
echo -e "${YELLOW}Converting Root Files...${NC}"
echo -e "${YELLOW}═══════════════════════════════${NC}"
for file in "${ROOT_FILES[@]}"; do
    if [ -f "$file" ]; then
        convert_file "$file"
    else
        echo -e "${YELLOW}⏭️  Skipping (already converted): $file${NC}"
    fi
done

# Convert Test Files
echo -e "\n${YELLOW}═══════════════════════════════${NC}"
echo -e "${YELLOW}Converting Test Files...${NC}"
echo -e "${YELLOW}═══════════════════════════════${NC}"

# Find all .test.js files
TEST_FILES=$(find tests -name "*.test.js" -o -name "setup.js")
for file in $TEST_FILES; do
    if [ -f "$file" ]; then
        ts_file="${file%.js}.ts"
        echo -e "${YELLOW}Converting: $file → $ts_file${NC}"

        # For test files, rename .js to .ts
        mv "$file" "$ts_file"

        echo -e "${GREEN}✅ Converted: $ts_file${NC}"
        ((CONVERTED++))
    fi
done

# Summary
echo -e "\n${GREEN}═══════════════════════════════${NC}"
echo -e "${GREEN}Conversion Summary${NC}"
echo -e "${GREEN}═══════════════════════════════${NC}"
echo -e "${GREEN}✅ Files converted: $CONVERTED${NC}"
echo -e "${RED}❌ Errors: $ERRORS${NC}"

if [ $ERRORS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All files converted successfully!${NC}"
    echo -e "${YELLOW}⚠️  Next steps:${NC}"
    echo "  1. Review converted files and add proper TypeScript types"
    echo "  2. Run: npx tsc --noEmit (to check for type errors)"
    echo "  3. Fix any type errors"
    echo "  4. Run: npm test (to verify tests still pass)"
    echo "  5. Run: npm run build (to build the project)"
else
    echo -e "\n${RED}⚠️  Some files had errors. Please review.${NC}"
    exit 1
fi
