# Changelog

All notable changes to RoboSats Notifier will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-02-26

### Added
- **Clearnet URL Support**: Configure an optional RoboSats clearnet URL for offer links in notifications
  - New `ROBOSATS_CLEARNET_URL` configuration option in web UI and environment variables
  - Offer messages now include a clearnet link when configured

### Fixed
- Improved deletion logging in WhatsAppClient — non-existent messages are now treated as successfully deleted, reducing misleading error noise

## [1.3.0] - 2026-02-04

### Added
- **Daily Summary Feature**: Receive scheduled daily reports with comprehensive statistics
  - Configurable summary time and timezone via web UI
  - BTC price tracking with support for multiple currencies
  - 24-hour price movement display
  - Offer statistics (count, volume, premium ranges) per currency
  - Coordinator health and volume statistics
  - Customizable closing messages with rotating phrases
  - Flexible section selection (choose which stats to include)
- New `/api/stats/reset` endpoint for clearing statistics data
- Enhanced stats tracking with hourly bucket rotation for 24h rolling windows
- Yadio API integration for real-time BTC price data

### Changed
- Upgraded `whatsapp-web.js` from v1.34.5-alpha.3 to v1.34.6
- Removed `patch-package` dependency (patches no longer needed with latest whatsapp-web.js)
- Improved timezone handling with proper GMT offset parsing
- Enhanced error logging in RobosatsClient for invalid response formats
- YadioClient now fetches prices sequentially for multiple currencies to avoid rate limiting
- StatsTracker rotates hourly buckets based on elapsed time and prevents duplicate offer counting

### Fixed
- Timezone offset calculation now correctly parses GMT offsets (e.g., GMT+5, GMT-3)
- Improved message deletion verification with better error handling

## [1.2.1] - 2026-01-23

### Fixed
- Fixed bug where expired offers were not having their WhatsApp messages deleted
  - Removed redundant `cleanupExpiredOffers()` call that was removing offers from tracker before the message deletion logic could process them
  - The existing inactive offers logic now correctly handles both expired offers and cancelled/taken offers

## [1.2.0] - 2026-01-22

### Changed
- Refactored `getOrderBookFromCoordinator` and `getOrderBook` methods with `Promise.allSettled` for improved parallel request handling
- Enhanced logging of coordinator responses and errors for better debugging
- Offer tracking now includes coordinator information for better management of inactive offers
- Improved logic for deleting offers based on their status and coordinator reachability
- `RobosatsClient` now returns reachable coordinators alongside offers for improved tracking

## [1.1.0] - 2026-01-22

### Added
- Auto-delete WhatsApp messages when offers become inactive (taken, cancelled, or expired)
  - New `DELETE_INACTIVE_MESSAGES` configuration option in UI
  - Tracks message IDs for each sent notification
  - Configurable via web UI with helpful info about requirements
- Link previews now disabled for all WhatsApp messages
- Configuration persistence for WhatsApp group name and contact details
- `nodemon.json` configuration to prevent unwanted restarts during development
- `patch-package` integration for persistent library patches
- Multi-platform Docker build support (amd64, arm64)

### Changed
- Updated `whatsapp-web.js` from 1.23.0 to 1.34.5-alpha.3
- WhatsApp client now uses `headless: 'new'` mode (deprecated API fix)
- Improved offer tracker data model to store message IDs and metadata
- Enhanced data migration handling for backwards compatibility
- Notification settings (group/contact) now persist across page refreshes

### Fixed
- **Critical**: Fixed "Cannot read properties of undefined (reading 'markedUnread')" error when sending WhatsApp messages
  - Applied patch to `whatsapp-web.js` changing `sendSeen` to `markSeen`
  - Patch persists through Docker builds via `patch-package`
- Fixed WhatsApp initialization hanging issues with latest library version
- Fixed nodemon restart loops caused by data file changes
- Fixed configuration fields being deleted when switching notification types
- Fixed frontend not pre-filling saved group names and contact information

### Technical
- Added `loading_screen` event listener for better WhatsApp initialization visibility
- Improved error handling in message deletion
- Better disk I/O patterns in offer tracking (though batching could be further optimized)
- `sendMessage` methods now return message objects for ID tracking
- Added comprehensive release documentation and automation scripts

### Security
- Removed accidental `audit` package dependency

## [1.0.0] - 2026-01-15

### Added
- Initial release of RoboSats Notifier
- Web UI for configuration at port 3000
- QR code authentication for WhatsApp
- Real-time monitoring of RoboSats offers across multiple coordinators
- Multi-coordinator support (Alice, Veneto, FreedomSats, Bazaar, Moon, Temple, Lake, WhiteyeSats)
- Currency filtering for targeted notifications
- Two notification modes:
  - WhatsApp group notifications
  - Direct contact notifications (country code + phone number)
- Configurable check intervals (5-60 minutes)
- Persistent offer tracking to avoid duplicate notifications
- Offer expiration handling (24h default)
- Docker support with Chromium for headless browser
- Umbrel app integration
- Multi-language support (EN, ES, FR, DE, IT, PT, RU, ZH, JA)
- Environment variable configuration via `.env`
- Web-based settings management with live updates
- Bot enable/disable toggle
- Test message functionality
- Status monitoring dashboard
- Coordinator health tracking

### Technical
- Node.js 18 runtime
- Express web server
- Puppeteer for WhatsApp Web automation
- LocalAuth strategy for session persistence
- Docker containerization
- Tor support via RoboSats onion URL
- Data persistence in `/data` volume
- WhatsApp authentication persistence in `.wwebjs_auth`

---

## Links

- [GitHub Repository](https://github.com/OrangePanther21/robosats-notifier)
- [Issue Tracker](https://github.com/OrangePanther21/robosats-notifier/issues)
- [Umbrel App Store](https://apps.umbrel.com/)
