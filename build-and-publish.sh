#!/bin/bash

# RoboSats Notifier - Build and Publish Script
# This script builds multi-platform Docker images and pushes to Docker Hub
#
# Usage:
#   ./build-and-publish.sh USERNAME VERSION
#   OR
#   DOCKER_USERNAME=user VERSION=1.1.0 ./build-and-publish.sh

set -e  # Exit on error

# Configuration - accept from args or environment
DOCKER_USERNAME="${1:-${DOCKER_USERNAME:-}}"
VERSION="${2:-${VERSION:-1.1.0}}"
APP_NAME="robosats-notifier"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker username is set
if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${RED}Error: DOCKER_USERNAME not set${NC}"
    echo ""
    echo "Usage (option 1 - recommended):"
    echo "  ./build-and-publish.sh USERNAME VERSION"
    echo "  Example: ./build-and-publish.sh orangepanther21 1.1.0"
    echo ""
    echo "Usage (option 2):"
    echo "  DOCKER_USERNAME=username VERSION=1.1.0 ./build-and-publish.sh"
    echo ""
    exit 1
fi

# Full image names
IMAGE_NAME="${DOCKER_USERNAME}/${APP_NAME}"
IMAGE_TAG_VERSION="${IMAGE_NAME}:${VERSION}"
IMAGE_TAG_LATEST="${IMAGE_NAME}:latest"

echo -e "${GREEN}=== Building Multi-Platform Docker Image ===${NC}"
echo "Platforms: linux/amd64, linux/arm64"
echo "Image: ${IMAGE_TAG_VERSION}"
echo "Also tagging as: ${IMAGE_TAG_LATEST}"
echo ""

# Ensure buildx is set up
if ! docker buildx ls | grep -q "multiplatform"; then
    echo "Creating buildx builder..."
    docker buildx create --name multiplatform --use
else
    echo "Using existing buildx builder..."
    docker buildx use multiplatform
fi

# Build and push multi-platform images
echo ""
echo "Building and pushing..."
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t "${IMAGE_TAG_VERSION}" \
    -t "${IMAGE_TAG_LATEST}" \
    --push \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build and push successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Build and Publish Complete! ===${NC}"
echo ""
echo "Published images:"
echo "  - ${IMAGE_TAG_VERSION}"
echo "  - ${IMAGE_TAG_LATEST}"
echo ""
echo "Next steps:"
echo "  1. Update umbrel/docker-compose.yml with: image: ${IMAGE_TAG_VERSION}"
echo "  2. Update umbrel/umbrel-app.yml with version: \"${VERSION}\""
echo "  3. Update umbrel/umbrel-app.yml releaseNotes"
echo "  4. Commit and push to GitHub"
echo "  5. Create a GitHub release/tag: v${VERSION}"
echo "  6. Submit PR to Umbrel community store"
echo ""
