# NIMA - Nimiq Wallet Manager
Manage your Nimiq wallets directly in your browser

**[Install from the Chrome Web Store!](https://chrome.google.com/webstore/detail/nima-nimiq-wallet-manager/jfijpdoopiaiahclhnfoibiohfnjpcfo)**

This extension lets you manage all your Nimiq wallets directly in your browser. The extension connects directly to the Nimiq blockchain and gives you instant access to your funds. You can easily import your existing wallets, switch between them and send Nimiq directly from the extension.

A history of your recent transactions and mined blocks is available for each wallet.

The extension also supports mining, so you can mine Nimiq whenever your browser is running, without having to visit the testnet webpage.

> Developed for Chrome and Firefox, but may also work in Opera and other WebKit-based browsers.

## Screenshots
![Main screen](assets/screenshots/screenshot2.png?raw=true)
![Wallet list](assets/screenshots/screenshot3.png?raw=true)
![Import wallet](assets/screenshots/screenshot4.png?raw=true)

## Development
To install for development, follow these instructions: https://developer.chrome.com/extensions/getstarted#unpacked

## Changelog
**v0.4.0**
- Adapt for Firefox
- Enable quick wallet switching without a network reconnect
- Fix displayed status feedback during loading

**v0.3.2**
- Fix wrong icon path in manifest file

**v0.3.1**
- Use Nimiq's robohash for identicons
- Enable setting mining threads
- Replace Dollar currency icon with "NIM" suffix

**v0.3.0**
- Update extension to work with the Luna testnet v3

**v0.2.3**
- Fix regression from v0.2.2 where the historygap event was not stored anymore

**v0.2.2**
- Fix import section not disappearing after initial import when popup is not reopened
- Do not create historygap event for generated wallet on initial import

**v0.2.1**
- Update README and screenshots

**v0.2.0**
- Add wallet history
- Add basic notification badge
- Set minimum supported Chrome version to 58

**v0.1.3**
- Fix being able to close the import screen when not having any wallets
- Remove unused contacts and cashlinks buttons

**v0.1.2**
- Initial release
