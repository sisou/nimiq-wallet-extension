/* jshint esversion: 6 */

// Cache all document node pointers
var $address          = document.getElementById('address'),
    $balance          = document.getElementById('balance'),
    $status           = document.getElementById('status'),
    $height           = document.getElementById('height'),
    $targetHeight     = document.getElementById('targetHeight'),
    $peers            = document.getElementById('peers'),
    $mining           = document.getElementById('mining'),
    $hashrate         = document.getElementById('hashrate'),
    $walletManagement = document.getElementById('wallet-management'),
    $walletImport     = document.getElementById('wallet-import'),
    $walletList       = document.getElementById('wallet-list');

// Cache all input elements
var $buttonStartMining        = document.getElementById('button-start-mining'),
    $buttonStopMining         = document.getElementById('button-stop-mining'),
    $buttonShowMyWallets      = document.getElementById('button-show-my-wallets'),
    $buttonCloseMyWallets     = document.getElementById('button-close-my-wallets'),
    $buttonShowImportWallets  = document.getElementById('button-show-import-wallets'),
    $buttonCloseImportWallets = document.getElementById('button-close-import-wallets'),
    $inputPrivKey             = document.getElementById('input-privKey'),
    $buttonImportPrivKey      = document.getElementById('button-import-privKey'),
    $buttonImportBetanet      = document.getElementById('button-import-betanet'),
    $buttonNewWallet          = document.getElementById('button-create-new-wallet');

// Set up initial values
var bgPage = chrome.extension.getBackgroundPage(),
    state  = bgPage.state;

$buttonShowMyWallets.innerText = 'My Wallets (' + state.numberOfWallets + ')';
$address.innerText         = state.address;
$balance.innerText         = state.balance;
$status.innerText          = state.status;
$height.innerText          = state.height;
$targetHeight.innerText    = state.targetHeight;
$peers.innerText           = state.peers;
$mining.innerText          = state.mining;
$hashrate.innerText        = state.hashrate;

if(state.numberOfWallets === 0) $walletImport.classList.add('show-instant');

async function updateWalletList() {
    var wallets = await bgPage.listWallets();

    var html = '<ul>';

    console.log(wallets);

    for(let address in wallets) {
        let addressHMTL = address;
        if(address === state.address) addressHMTL = '<strong>' + address + '</strong>';

        html += '<li>';
        html += '<input type="text" value="' + wallets[address].name + '" id="' + address + '-name">';
        html += '<button data-wallet="' + address + '" class="update-name">Edit</button> ';
        html += '<button data-wallet="' + address + '" class="use-wallet">Use</button> ';
        if(state.address && state.address !== address)
            html += '<button data-wallet="' + address + '" class="remove-wallet">Remove</button><br>';
        html += '<hash>' + addressHMTL + '</hash><br>';
        html += 'Balance: ' + wallets[address].balance;
        html += '</li>';
    }

    html += '</ul>';

    $walletList.innerHTML = html;
}
updateWalletList();

// Listen for updates from the background script
function messageReceived(update) {
    console.log("message received:", update);

    var key = Object.keys(update)[0];

    if(key === 'privKey') {
        importPrivateKey(update.privKey);
    }
    else {
        if(key === 'balance') {
            // Skip balance updates during wallet switch
            if(state.balance === 'loading...' && state.status !== 'Consensus established')
                return;
        }

        Object.assign(state, update);

        switch(key) {
            case 'numberOfWallets': $buttonShowMyWallets.innerText = 'My Wallets (' + state.numberOfWallets + ')'; break;
            case 'address':      $address.innerText      = state.address; updateWalletList(); break;
            case 'balance':      $balance.innerText      = state.balance;      break;
            case 'status':       $status.innerText       = state.status;  updateWalletList(); break;
            case 'height':       $height.innerText       = state.height;       break;
            case 'targetHeight': $targetHeight.innerText = state.targetHeight; break;
            case 'peers':        $peers.innerText        = state.peers;        break;
            case 'mining':       $mining.innerText       = state.mining;       break;
            case 'hashrate':     $hashrate.innerText     = state.hashrate;     break;
        }
    }
}
chrome.runtime.onMessage.addListener(messageReceived);

async function importPrivateKey(key) {
    await bgPage.importPrivateKey(key);
    updateWalletList();
}

async function updateName(address, name) {
    await bgPage.updateName(address, name);
    updateWalletList();
}

async function createNewWallet() {
    await bgPage.createNewWallet();
    updateWalletList();
}

async function removeWallet(address) {
    await bgPage.removeWallet(address);
    updateWalletList();
}

// Attach input listeners
$buttonStartMining.addEventListener('click', bgPage.startMining);
$buttonStopMining.addEventListener('click', bgPage.stopMining);

$buttonShowMyWallets.addEventListener('click', e => {
    $walletManagement.classList.add('show');
});
$buttonCloseMyWallets.addEventListener('click', e => {
    $walletManagement.classList.remove('show');
});

$buttonShowImportWallets.addEventListener('click', e => {
    $walletImport.classList.add('show');
});
$buttonCloseImportWallets.addEventListener('click', e => {
    $walletImport.classList.remove('show', 'show-instant');
});

$walletList.addEventListener('click', e => {
    if(e.target.matches('button.use-wallet')) {
        const address = e.target.getAttribute('data-wallet');
        bgPage.switchWallet(address);
        $buttonCloseMyWallets.click();
    }
    else if(e.target.matches('button.update-name')) {
        const address = e.target.getAttribute('data-wallet');
        const name = document.getElementById(address + '-name').value;
        updateName(address, name);
    }
    else if(e.target.matches('button.remove-wallet')) {
        const address = e.target.getAttribute('data-wallet');
        removeWallet(address);
    }
});

$buttonImportPrivKey.addEventListener('click', e => {
    importPrivateKey($inputPrivKey.value);
    $buttonCloseImportWallets.click();
});
$buttonImportBetanet.addEventListener('click', e => {
    chrome.tabs.query({active: true}, tabs => {
        var tab = tabs[0];
        if(tab.url === 'https://nimiq.com/betanet/') {
            chrome.tabs.executeScript({file: "extract_betanet_key.js"});
            $buttonCloseImportWallets.click();
        }
        else {
            window.open('https://nimiq.com/betanet','_newtab');
        }
    });
});
$buttonNewWallet.addEventListener('click', e => {
    createNewWallet();
    $buttonCloseImportWallets.click();
});
