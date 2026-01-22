# Changelog

All notable changes to RoboSats Notifier will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
